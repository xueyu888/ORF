import { nativeNotificationPresentationKey } from "../notifications/nativeNotificationPresentationDedupe";

export const orfChatPushChannelId = "orf-chat-messages";
export const orfClientUpdatePushChannelId = "orf-client-updates";
export const orfPushFallbackSource = "orf-push-fallback";

export type OrfReceivedPushNotification = {
  body?: string | null;
  data?: unknown;
  link?: string | null;
  title?: string | null;
};

export type OrfPushDisplayState = {
  documentFocused: boolean;
  visibilityState: "hidden" | "prerender" | "unloaded" | "visible" | "unknown";
};

export type OrfPushFallbackLocalNotification = {
  body: string;
  channelId: string;
  extra: {
    kind?: string;
    messageId?: string;
    presentationKey: string;
    source: typeof orfPushFallbackSource;
    targetPath: string;
  };
  id: number;
  presentationKey: string;
  title: string;
};

export function buildReceivedPushFallbackNotification(
  notification: OrfReceivedPushNotification,
  displayState: OrfPushDisplayState,
): OrfPushFallbackLocalNotification | null {
  if (isFocusedVisibleDocument(displayState)) return null;

  const data = pushNotificationData(notification.data);
  const kind = cleanText(data.kind);
  const messageId = cleanText(data.messageId);
  const targetPath = pushNotificationTargetPath(notification, data) ?? "/";
  const title = cleanText(notification.title) ?? fallbackTitle(kind);
  const body = cleanText(notification.body);
  if (!title || !body) return null;
  const fallbackSeed = numericPushNotificationId([kind, targetPath, title, body].filter(Boolean).join("|")).toString(36);
  const presentationKey = nativeNotificationPresentationKey({ fallbackSeed, kind, messageId });
  if (!presentationKey) return null;

  return {
    body,
    channelId: channelIdForPushKind(kind),
    extra: {
      ...(kind ? { kind } : {}),
      ...(messageId ? { messageId } : {}),
      presentationKey,
      source: orfPushFallbackSource,
      targetPath,
    },
    id: numericPushNotificationId(presentationKey),
    presentationKey,
    title,
  };
}

export function targetPathFromPushNotificationExtra(extra: unknown) {
  const data = pushNotificationData(extra);
  const targetPath = cleanText(data.targetPath);
  return targetPath && isSafePushTargetPath(targetPath) ? targetPath : null;
}

export function pushNotificationTargetPath(notification: OrfReceivedPushNotification, data = pushNotificationData(notification.data)) {
  const targetPath = cleanText(data.targetPath);
  if (targetPath && isSafePushTargetPath(targetPath)) return targetPath;
  const link = cleanText(notification.link);
  if (link && isSafePushTargetPath(link)) return link;
  return null;
}

export function isSafePushTargetPath(targetPath: string) {
  return targetPath.startsWith("/") && !targetPath.startsWith("//");
}

function isFocusedVisibleDocument(displayState: OrfPushDisplayState) {
  return displayState.visibilityState === "visible" && displayState.documentFocused;
}

function channelIdForPushKind(kind: string | null) {
  return kind === "client.update.available" ? orfClientUpdatePushChannelId : orfChatPushChannelId;
}

function fallbackTitle(kind: string | null) {
  if (kind === "client.update.available") return "ORF 客户端更新";
  if (kind === "chat.message.created") return "ORF 聊天消息";
  return "ORF";
}

function pushNotificationData(data: unknown): Record<string, unknown> {
  return data && typeof data === "object" ? (data as Record<string, unknown>) : {};
}

function cleanText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numericPushNotificationId(seed: string) {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) | 0;
  }
  return (hash & 0x7fffffff) || 1;
}
