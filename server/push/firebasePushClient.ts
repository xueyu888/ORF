import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
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

  initializeApp({ credential: resolveFirebaseCredential() });
  firebaseInitialized = true;
}

function resolveFirebaseCredential() {
  const inlineJson = env.ORF_FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (inlineJson) {
    return cert(JSON.parse(inlineJson));
  }

  const serviceAccountPath = env.ORF_FIREBASE_SERVICE_ACCOUNT_PATH?.trim();
  if (serviceAccountPath) {
    return cert(JSON.parse(readFileSync(serviceAccountPath, "utf8")));
  }

  return applicationDefault();
}

function isInvalidRegistrationTokenCode(code: string | undefined) {
  return (
    code === "messaging/invalid-registration-token" ||
    code === "messaging/registration-token-not-registered"
  );
}
