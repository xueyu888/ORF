import { avatarColorForName } from "../../utils/avatar";
import { initials } from "../../utils/format";

export type DesktopNotificationSender = {
  avatarUrl?: string | null;
  name: string;
  userId?: string | null;
};

type NotificationWithSender = {
  avatarDataUrl?: string | null;
  sender?: DesktopNotificationSender;
};

const notificationAvatarSize = 96;
const notificationAvatarLoadTimeoutMs = 1500;
const notificationAvatarCacheLimit = 64;
const preparedAvatarByIdentity = new Map<string, Promise<string>>();

export async function prepareDesktopNotificationAvatar<T extends NotificationWithSender>(notification: T): Promise<T> {
  if (!notification.sender || typeof window === "undefined" || !("orfDesktopShell" in window || "orfNativeNotifications" in window)) {
    return notification;
  }
  return {
    ...notification,
    avatarDataUrl: await avatarDataUrlForSender(notification.sender),
  };
}

function avatarDataUrlForSender(sender: DesktopNotificationSender) {
  const cacheKey = `${sender.userId ?? "anonymous"}:${sender.avatarUrl ?? "fallback"}:${sender.name}`;
  const cached = preparedAvatarByIdentity.get(cacheKey);
  if (cached) return cached;

  const prepared = renderSenderAvatar(sender).catch(() => renderFallbackAvatar(sender.name));
  preparedAvatarByIdentity.set(cacheKey, prepared);
  while (preparedAvatarByIdentity.size > notificationAvatarCacheLimit) {
    const oldestKey = preparedAvatarByIdentity.keys().next().value;
    if (typeof oldestKey !== "string") break;
    preparedAvatarByIdentity.delete(oldestKey);
  }
  return prepared;
}

async function renderSenderAvatar(sender: DesktopNotificationSender) {
  const avatarUrl = safeAvatarUrl(sender.avatarUrl, sender.userId);
  if (!avatarUrl) return renderFallbackAvatar(sender.name);

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), notificationAvatarLoadTimeoutMs);
  try {
    const response = await fetch(avatarUrl, {
      cache: "force-cache",
      credentials: "same-origin",
      signal: controller.signal,
    });
    if (!response.ok) return renderFallbackAvatar(sender.name);
    const image = await createImageBitmap(await response.blob());
    try {
      const canvas = notificationAvatarCanvas();
      const context = canvas.getContext("2d");
      if (!context || image.width <= 0 || image.height <= 0) return renderFallbackAvatar(sender.name);
      const cropSize = Math.min(image.width, image.height);
      context.drawImage(
        image,
        (image.width - cropSize) / 2,
        (image.height - cropSize) / 2,
        cropSize,
        cropSize,
        0,
        0,
        notificationAvatarSize,
        notificationAvatarSize,
      );
      return canvas.toDataURL("image/png");
    } finally {
      image.close();
    }
  } finally {
    window.clearTimeout(timeout);
  }
}

function safeAvatarUrl(value: string | null | undefined, userId: string | null | undefined) {
  if (!value || typeof window === "undefined") return null;
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin || !/^\/api\/users\/[^/]+\/avatar$/.test(url.pathname)) return null;
    if (userId && decodeURIComponent(url.pathname.split("/")[3] ?? "") !== userId) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function renderFallbackAvatar(name: string) {
  const canvas = notificationAvatarCanvas();
  const context = canvas.getContext("2d");
  if (!context) return "";
  context.fillStyle = avatarColorForName(name);
  context.fillRect(0, 0, notificationAvatarSize, notificationAvatarSize);
  context.fillStyle = "#ffffff";
  context.font = '700 42px "Segoe UI", "Microsoft YaHei", sans-serif';
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(initials(name) || "O", notificationAvatarSize / 2, notificationAvatarSize / 2 + 1);
  return canvas.toDataURL("image/png");
}

function notificationAvatarCanvas() {
  const canvas = document.createElement("canvas");
  canvas.height = notificationAvatarSize;
  canvas.width = notificationAvatarSize;
  return canvas;
}
