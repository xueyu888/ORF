import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Agent } from "node:http";
import { request as httpsRequest } from "node:https";
import { URL } from "node:url";
import { HttpsProxyAgent } from "https-proxy-agent";
import { env } from "../env";
import { PUSH_PROVIDER_TIMEOUT_MS } from "./pushTransportPolicy";

export type FcmPushMessage = {
  body: string;
  channelId: string;
  collapseKey?: string;
  data: Record<string, string>;
  tag?: string;
  title: string;
  tokens: string[];
};

export type FcmPushResult = {
  failureCount: number;
  invalidTokens: string[];
  successCount: number;
};

type FirebaseServiceAccount = {
  client_email: string;
  private_key: string;
  project_id: string;
  token_uri?: string;
};

type PushProviderHttpResponse = {
  bodyText: string;
  data: unknown;
  statusCode: number;
};

type FcmHttpV1TokenResult = {
  invalidToken: boolean;
  success: boolean;
};

const firebaseMessagingScope = "https://www.googleapis.com/auth/firebase.messaging";
const firebaseOauthGrantType = "urn:ietf:params:oauth:grant-type:jwt-bearer";
const googleOauthTokenUrl = "https://oauth2.googleapis.com/token";
const maxFcmConcurrentRequests = 8;
const tokenRefreshSkewMs = 60_000;

let accessTokenCache: { expiresAtMs: number; token: string } | undefined;
let firebaseHttpAgent: Agent | undefined;
let serviceAccountCache: FirebaseServiceAccount | undefined;

export function isFirebasePushConfigured() {
  return Boolean(
    env.ORF_PUSH_ENABLED &&
      (env.ORF_FIREBASE_SERVICE_ACCOUNT_JSON?.trim() ||
        env.ORF_FIREBASE_SERVICE_ACCOUNT_PATH?.trim() ||
        process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()),
  );
}

export async function sendFcmPushMessage(input: FcmPushMessage): Promise<FcmPushResult> {
  return sendFcmPushMessageWithMode(input, false);
}

export async function validateFcmPushMessage(input: FcmPushMessage): Promise<FcmPushResult> {
  return sendFcmPushMessageWithMode(input, true);
}

async function sendFcmPushMessageWithMode(input: FcmPushMessage, validateOnly: boolean): Promise<FcmPushResult> {
  if (!isFirebasePushConfigured()) {
    return { failureCount: 0, invalidTokens: [], successCount: 0 };
  }

  const tokens = Array.from(new Set(input.tokens.map((token) => token.trim()).filter(Boolean)));
  const invalidTokens: string[] = [];
  let successCount = 0;
  let failureCount = 0;

  for (let index = 0; index < tokens.length; index += maxFcmConcurrentRequests) {
    const chunk = tokens.slice(index, index + maxFcmConcurrentRequests);
    const results = await Promise.all(chunk.map((token) => sendFcmHttpV1Token(input, token, validateOnly)));
    results.forEach((result, resultIndex) => {
      if (result.success) {
        successCount += 1;
        return;
      }
      failureCount += 1;
      if (result.invalidToken) {
        invalidTokens.push(chunk[resultIndex] ?? "");
      }
    });
  }

  return {
    failureCount,
    invalidTokens: invalidTokens.filter(Boolean),
    successCount,
  };
}

export async function withPushProviderDeadline<T>(
  operation: Promise<T> | ((signal: AbortSignal) => Promise<T>),
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  const timeoutError = new Error(`Push provider timed out after ${timeoutMs}ms.`);
  let timer: NodeJS.Timeout | undefined;
  const operationPromise = typeof operation === "function" ? operation(controller.signal) : operation;
  try {
    return await Promise.race([
      operationPromise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort(timeoutError);
          reject(timeoutError);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    operationPromise.catch(() => undefined);
  }
}

async function sendFcmHttpV1Token(input: FcmPushMessage, token: string, validateOnly: boolean): Promise<FcmHttpV1TokenResult> {
  const serviceAccount = resolveFirebaseServiceAccount();
  const accessToken = await getFirebaseAccessToken(serviceAccount);
  const response = await postProviderJson({
    body: {
      ...(validateOnly ? { validate_only: true } : {}),
      message: {
        token,
        notification: {
          title: input.title,
          body: input.body,
        },
        data: input.data,
        android: {
          collapseKey: input.collapseKey,
          priority: "high",
          notification: {
            channelId: input.channelId,
            tag: input.tag,
          },
        },
      },
    },
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json;charset=utf-8",
    },
    url: fcmSendUrl(serviceAccount.project_id),
  });

  if (response.statusCode >= 200 && response.statusCode < 300) {
    return { invalidToken: false, success: true };
  }
  if (response.statusCode === 401 || response.statusCode === 403) {
    accessTokenCache = undefined;
    throw new Error(`FCM HTTP v1 authorization failed with status ${response.statusCode}.`);
  }
  return {
    invalidToken: isInvalidFcmRegistrationToken(response.data),
    success: false,
  };
}

async function getFirebaseAccessToken(serviceAccount: FirebaseServiceAccount) {
  const nowMs = Date.now();
  if (accessTokenCache && accessTokenCache.expiresAtMs - tokenRefreshSkewMs > nowMs) {
    return accessTokenCache.token;
  }

  const tokenUri = serviceAccount.token_uri?.trim() || googleOauthTokenUrl;
  const assertion = signFirebaseServiceAccountJwt(serviceAccount, tokenUri, new Date(nowMs));
  const response = await postProviderForm({
    body: new URLSearchParams({
      grant_type: firebaseOauthGrantType,
      assertion,
    }).toString(),
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    url: tokenUri,
  });
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`Firebase OAuth token request failed with status ${response.statusCode}.`);
  }

  const data = asRecord(response.data);
  const token = typeof data?.access_token === "string" ? data.access_token : "";
  const expiresInSeconds = typeof data?.expires_in === "number" ? data.expires_in : Number(data?.expires_in);
  if (!token || !Number.isFinite(expiresInSeconds) || expiresInSeconds <= 0) {
    throw new Error("Firebase OAuth token response did not include a usable access token.");
  }

  accessTokenCache = {
    expiresAtMs: nowMs + expiresInSeconds * 1_000,
    token,
  };
  return token;
}

function signFirebaseServiceAccountJwt(serviceAccount: FirebaseServiceAccount, tokenUri: string, now: Date) {
  const issuedAt = Math.floor(now.getTime() / 1_000);
  const expiresAt = issuedAt + 3_600;
  const header = base64UrlJson({ alg: "RS256", typ: "JWT" });
  const payload = base64UrlJson({
    aud: tokenUri,
    exp: expiresAt,
    iat: issuedAt,
    iss: serviceAccount.client_email,
    scope: firebaseMessagingScope,
  });
  const unsigned = `${header}.${payload}`;
  const signature = createSign("RSA-SHA256").update(unsigned).end().sign(serviceAccount.private_key).toString("base64url");
  return `${unsigned}.${signature}`;
}

function base64UrlJson(value: Record<string, unknown>) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

async function postProviderJson(input: { body: unknown; headers: Record<string, string>; url: string }) {
  return withPushProviderDeadline(
    (signal) => sendProviderRequest({
      body: JSON.stringify(input.body),
      headers: input.headers,
      signal,
      url: input.url,
    }),
    PUSH_PROVIDER_TIMEOUT_MS,
  );
}

async function postProviderForm(input: { body: string; headers: Record<string, string>; url: string }) {
  return withPushProviderDeadline(
    (signal) => sendProviderRequest({
      body: input.body,
      headers: input.headers,
      signal,
      url: input.url,
    }),
    PUSH_PROVIDER_TIMEOUT_MS,
  );
}

function sendProviderRequest(input: {
  body: string;
  headers: Record<string, string>;
  signal: AbortSignal;
  url: string;
}): Promise<PushProviderHttpResponse> {
  return new Promise((resolve, reject) => {
    if (input.signal.aborted) {
      reject(abortReason(input.signal));
      return;
    }

    const endpoint = new URL(input.url);
    const bodyBuffer = Buffer.from(input.body, "utf8");
    const request = httpsRequest({
      agent: resolveFirebaseHttpAgent(),
      headers: {
        ...input.headers,
        accept: "application/json",
        "content-length": String(bodyBuffer.length),
      },
      hostname: endpoint.hostname,
      method: "POST",
      path: `${endpoint.pathname}${endpoint.search}`,
      port: endpoint.port ? Number(endpoint.port) : 443,
      protocol: endpoint.protocol,
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      response.on("end", () => {
        settle(() => {
          const bodyText = Buffer.concat(chunks).toString("utf8");
          resolve({
            bodyText,
            data: parseJsonResponseBody(bodyText),
            statusCode: response.statusCode ?? 0,
          });
        });
      });
      response.on("error", (error) => settle(() => reject(error)));
    });

    let settled = false;
    const cleanup = () => input.signal.removeEventListener("abort", abort);
    const settle = (finish: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      finish();
    };
    const abort = () => {
      const reason = abortReason(input.signal);
      settle(() => reject(reason));
      request.destroy(reason);
    };

    request.on("error", (error) => settle(() => reject(error)));
    input.signal.addEventListener("abort", abort, { once: true });
    if (input.signal.aborted) {
      abort();
      return;
    }
    request.end(bodyBuffer);
  });
}

function parseJsonResponseBody(bodyText: string) {
  if (!bodyText.trim()) return null;
  try {
    return JSON.parse(bodyText) as unknown;
  } catch {
    return null;
  }
}

function abortReason(signal: AbortSignal) {
  return signal.reason instanceof Error ? signal.reason : new Error("Push provider request aborted.");
}

function fcmSendUrl(projectId: string) {
  return `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`;
}

function resolveFirebaseServiceAccount(): FirebaseServiceAccount {
  if (serviceAccountCache) return serviceAccountCache;

  const inlineJson = env.ORF_FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  const credentialsPath = env.ORF_FIREBASE_SERVICE_ACCOUNT_PATH?.trim() || process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  const raw = inlineJson || (credentialsPath ? readFileSync(credentialsPath, "utf8") : "");
  if (!raw) {
    throw new Error("Firebase service account is not configured.");
  }

  serviceAccountCache = normalizeFirebaseServiceAccount(JSON.parse(raw));
  return serviceAccountCache;
}

function normalizeFirebaseServiceAccount(value: unknown): FirebaseServiceAccount {
  const input = asRecord(value);
  const serviceAccount = {
    client_email: typeof input?.client_email === "string" ? input.client_email.trim() : "",
    private_key: typeof input?.private_key === "string" ? input.private_key : "",
    project_id: typeof input?.project_id === "string" ? input.project_id.trim() : "",
    token_uri: typeof input?.token_uri === "string" ? input.token_uri.trim() : undefined,
  };
  if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error("Firebase service account JSON must include project_id, client_email and private_key.");
  }
  return serviceAccount;
}

function resolveFirebaseHttpAgent(): Agent | undefined {
  if (firebaseHttpAgent) return firebaseHttpAgent;

  const proxyUrl = env.ORF_FIREBASE_HTTP_PROXY?.trim();
  if (!proxyUrl) return undefined;

  try {
    firebaseHttpAgent = new HttpsProxyAgent(proxyUrl);
    return firebaseHttpAgent;
  } catch (error) {
    throw new Error(`Invalid Firebase HTTP proxy configuration: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function isInvalidFcmRegistrationToken(data: unknown) {
  const error = asRecord(asRecord(data)?.error);
  const details = Array.isArray(error?.details) ? error.details : [];
  const fcmCodes = details
    .map((detail) => asRecord(detail))
    .filter((detail) => detail?.["@type"] === "type.googleapis.com/google.firebase.fcm.v1.FcmError")
    .map((detail) => typeof detail?.errorCode === "string" ? detail.errorCode : "");
  return fcmCodes.includes("UNREGISTERED") || fcmCodes.includes("INVALID_ARGUMENT");
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
