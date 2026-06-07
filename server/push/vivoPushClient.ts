import { createHash, randomUUID } from "node:crypto";
import { env } from "../env";
import type { PushVendorDeviceRecord } from "./vendorPushRepository";

export type VivoPushMessage = {
  body: string;
  data: Record<string, string>;
  devices: PushVendorDeviceRecord[];
  title: string;
};

export type VivoPushResult = {
  failureCount: number;
  invalidTokens: string[];
  successCount: number;
};

type VivoAuthResponse = {
  authToken?: unknown;
  desc?: unknown;
  result?: unknown;
};

type VivoSendResponse = {
  desc?: unknown;
  result?: unknown;
  taskId?: unknown;
};

const vivoAuthTokenTtlMs = 23 * 60 * 60 * 1000;
let cachedAuthToken: { expiresAt: number; value: string } | null = null;

export function isVivoPushConfigured() {
  return Boolean(
    env.ORF_PUSH_ENABLED &&
      env.ORF_VIVO_PUSH_ENABLED &&
      env.ORF_VIVO_PUSH_APP_ID?.trim() &&
      /^\d+$/.test(env.ORF_VIVO_PUSH_APP_ID.trim()) &&
      env.ORF_VIVO_PUSH_APP_KEY?.trim() &&
      env.ORF_VIVO_PUSH_APP_SECRET?.trim(),
  );
}

export async function sendVivoPushMessage(input: VivoPushMessage): Promise<VivoPushResult> {
  if (!isVivoPushConfigured() || input.devices.length === 0) {
    return { failureCount: 0, invalidTokens: [], successCount: 0 };
  }

  const authToken = await resolveVivoAuthToken();
  const invalidTokens: string[] = [];
  let successCount = 0;
  let failureCount = 0;

  for (const device of uniqueVivoDevices(input.devices)) {
    const response = await postVivo<VivoSendResponse>("/message/send", vivoSendPayload(input, device.token), {
      authToken,
    });
    const resultCode = numericResult(response.result);
    if (resultCode === 0) {
      successCount += 1;
    } else {
      failureCount += 1;
      if (resultCode === 10302) {
        invalidTokens.push(device.token);
      }
    }
  }

  return {
    failureCount,
    invalidTokens,
    successCount,
  };
}

async function resolveVivoAuthToken() {
  if (cachedAuthToken && cachedAuthToken.expiresAt > Date.now()) {
    return cachedAuthToken.value;
  }

  const appId = requiredEnv("ORF_VIVO_PUSH_APP_ID", env.ORF_VIVO_PUSH_APP_ID);
  const appKey = requiredEnv("ORF_VIVO_PUSH_APP_KEY", env.ORF_VIVO_PUSH_APP_KEY);
  const appSecret = requiredEnv("ORF_VIVO_PUSH_APP_SECRET", env.ORF_VIVO_PUSH_APP_SECRET);
  const timestamp = Date.now();
  const response = await postVivo<VivoAuthResponse>("/message/auth", {
    appId: Number(appId),
    appKey,
    timestamp,
    sign: md5(`${appId}${appKey}${timestamp}${appSecret}`),
  });

  if (numericResult(response.result) !== 0 || typeof response.authToken !== "string" || !response.authToken.trim()) {
    cachedAuthToken = null;
    throw new Error(`vivo Push auth failed: result=${String(response.result ?? "unknown")}`);
  }

  cachedAuthToken = {
    expiresAt: Date.now() + vivoAuthTokenTtlMs,
    value: response.authToken.trim(),
  };
  return cachedAuthToken.value;
}

async function postVivo<T>(pathname: string, body: unknown, options?: { authToken?: string }): Promise<T> {
  const response = await fetch(vivoApiUrl(pathname), {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      ...(options?.authToken ? { authToken: options.authToken } : {}),
    },
    method: "POST",
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      cachedAuthToken = null;
    }
    throw new Error(`vivo Push HTTP ${response.status}`);
  }
  return payload as T;
}

function vivoSendPayload(input: VivoPushMessage, regId: string) {
  return {
    appId: Number(requiredEnv("ORF_VIVO_PUSH_APP_ID", env.ORF_VIVO_PUSH_APP_ID)),
    clientCustomMap: safeCustomMap(input.data),
    content: truncateNotificationText(input.body, 100),
    networkType: -1,
    notifyType: 4,
    regId,
    requestId: `orf-${Date.now()}-${randomUUID()}`.slice(0, 64),
    skipType: 1,
    timeToLive: 86400,
    title: truncateNotificationText(input.title, 40),
  };
}

function safeCustomMap(data: Record<string, string>) {
  const entries = Object.entries(data).slice(0, 10);
  const output: Record<string, string> = {};
  let used = 0;
  for (const [key, value] of entries) {
    const cleanKey = key.trim().slice(0, 64);
    const cleanValue = value.trim().slice(0, 256);
    if (!cleanKey || !cleanValue) continue;
    const nextUsed = used + cleanKey.length + cleanValue.length;
    if (nextUsed > 1024) break;
    output[cleanKey] = cleanValue;
    used = nextUsed;
  }
  return output;
}

function uniqueVivoDevices(devices: PushVendorDeviceRecord[]) {
  const seen = new Set<string>();
  return devices.filter((device) => {
    const token = device.token.trim();
    if (!token || seen.has(token)) return false;
    seen.add(token);
    return device.vendor === "vivo";
  });
}

function vivoApiUrl(pathname: string) {
  return new URL(pathname, env.ORF_VIVO_PUSH_API_BASE_URL).toString();
}

function requiredEnv(name: string, value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(`${name} is required`);
  return trimmed;
}

function md5(value: string) {
  return createHash("md5").update(value.trim()).digest("hex");
}

function numericResult(value: unknown) {
  return typeof value === "number" ? value : Number(value);
}

function truncateNotificationText(value: string, maxLength: number) {
  const chars = Array.from(value.trim());
  return chars.slice(0, maxLength).join("");
}
