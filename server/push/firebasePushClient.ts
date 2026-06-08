import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { HttpsProxyAgent } from "https-proxy-agent";
import type { Agent } from "node:http";
import { readFileSync } from "node:fs";
import { env } from "../env";

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

const maxFcmBatchSize = 500;

let firebaseInitialized = false;
let firebaseHttpAgent: Agent | undefined;

export function isFirebasePushConfigured() {
  return Boolean(
    env.ORF_PUSH_ENABLED &&
      (env.ORF_FIREBASE_SERVICE_ACCOUNT_JSON?.trim() ||
        env.ORF_FIREBASE_SERVICE_ACCOUNT_PATH?.trim() ||
        process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()),
  );
}

export async function sendFcmPushMessage(input: FcmPushMessage): Promise<FcmPushResult> {
  if (!isFirebasePushConfigured()) {
    return { failureCount: 0, invalidTokens: [], successCount: 0 };
  }

  ensureFirebaseApp();
  const messaging = getMessaging();
  messaging.enableLegacyHttpTransport();
  const invalidTokens: string[] = [];
  let successCount = 0;
  let failureCount = 0;
  const uniqueTokens = Array.from(new Set(input.tokens.map((token) => token.trim()).filter(Boolean)));

  for (let index = 0; index < uniqueTokens.length; index += maxFcmBatchSize) {
    const tokens = uniqueTokens.slice(index, index + maxFcmBatchSize);
    const response = await messaging.sendEachForMulticast({
      tokens,
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
    });

    successCount += response.successCount;
    failureCount += response.failureCount;
    response.responses.forEach((item, responseIndex) => {
      if (item.success) return;
      if (isInvalidRegistrationTokenCode(item.error?.code)) {
        invalidTokens.push(tokens[responseIndex] ?? "");
      }
    });
  }

  return {
    failureCount,
    invalidTokens: invalidTokens.filter(Boolean),
    successCount,
  };
}

function ensureFirebaseApp() {
  if (firebaseInitialized || getApps().length > 0) {
    firebaseInitialized = true;
    return;
  }

  const httpAgent = resolveFirebaseHttpAgent();
  initializeApp({
    credential: resolveFirebaseCredential(httpAgent),
    ...(httpAgent ? { httpAgent } : {}),
  });
  firebaseInitialized = true;
}

function resolveFirebaseCredential(httpAgent?: Agent) {
  const inlineJson = env.ORF_FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (inlineJson) {
    return cert(JSON.parse(inlineJson), httpAgent);
  }

  const serviceAccountPath = env.ORF_FIREBASE_SERVICE_ACCOUNT_PATH?.trim();
  if (serviceAccountPath) {
    return cert(JSON.parse(readFileSync(serviceAccountPath, "utf8")), httpAgent);
  }

  return applicationDefault(httpAgent);
}

function resolveFirebaseHttpAgent(): Agent | undefined {
  if (firebaseHttpAgent) return firebaseHttpAgent;

  const proxyUrl = [
    env.ORF_FIREBASE_HTTP_PROXY,
    process.env.HTTPS_PROXY,
    process.env.https_proxy,
    process.env.HTTP_PROXY,
    process.env.http_proxy,
  ].find((value) => typeof value === "string" && value.trim().length > 0)?.trim();

  if (!proxyUrl) return undefined;

  try {
    firebaseHttpAgent = new HttpsProxyAgent(proxyUrl);
    return firebaseHttpAgent;
  } catch (error) {
    throw new Error(`Invalid Firebase HTTP proxy configuration: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function isInvalidRegistrationTokenCode(code: string | undefined) {
  return (
    code === "messaging/invalid-registration-token" ||
    code === "messaging/registration-token-not-registered"
  );
}
