import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import type { ChatNativeNotificationPayload } from "./chatNativeNotificationModel";
import { prepareDesktopNotificationAvatar } from "../desktop/desktopNotificationAvatar";

type NativeChatNotificationResult = {
  data?: string;
  reason?: string;
  status: "error" | "not_sent" | "success" | "unsupported";
};

type OrfNativeNotificationBridge = {
  onOpenChatTarget?: (handler: (targetPath: string) => void) => (() => void);
  showChatMessage?: (payload: ChatNativeNotificationPayload & { avatarDataUrl?: string | null }) => Promise<NativeChatNotificationResult>;
};

declare global {
  interface Window {
    orfNativeNotifications?: OrfNativeNotificationBridge;
  }
}

const androidChatNotificationChannelId = "orf-chat-messages";
let androidLocalNotificationReady: Promise<NativeChatNotificationResult> | null = null;

export async function sendNativeChatNotification(payload: ChatNativeNotificationPayload): Promise<NativeChatNotificationResult> {
  if (typeof window !== "undefined" && window.orfNativeNotifications?.showChatMessage) {
    try {
      const desktopPayload = await prepareDesktopNotificationAvatar(payload);
      return normalizeNativeChatNotificationResult(await window.orfNativeNotifications.showChatMessage(desktopPayload));
    } catch (error) {
      return { status: "error", reason: "desktop_bridge", data: String(error) };
    }
  }

  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
    return sendAndroidLocalChatNotification(payload);
  }

  return { status: "unsupported", reason: "no_native_notification_bridge" };
}

export function prepareNativeChatNotifications(): Promise<NativeChatNotificationResult> {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
    return ensureAndroidLocalNotificationsReady();
  }
  return Promise.resolve({ status: "unsupported", reason: "no_native_notification_setup_required" });
}

export function subscribeNativeChatNotificationOpen(handler: (targetPath: string) => void) {
  let cancelled = false;
  const cleanups: Array<() => void> = [];
  const desktopCleanup = typeof window !== "undefined" ? window.orfNativeNotifications?.onOpenChatTarget?.(handler) : undefined;
  if (desktopCleanup) cleanups.push(desktopCleanup);

  let androidListener: Promise<PluginListenerHandle> | null = null;
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
    androidListener = LocalNotifications.addListener("localNotificationActionPerformed", (action) => {
      const targetPath = chatNotificationTargetPathFromExtra(action.notification.extra);
      if (targetPath) handler(targetPath);
    });
    void androidListener.then((listener) => {
      if (cancelled) void listener.remove();
    });
  }

  return () => {
    cancelled = true;
    for (const cleanup of cleanups) cleanup();
    if (androidListener) void androidListener.then((listener) => listener.remove());
  };
}

async function sendAndroidLocalChatNotification(payload: ChatNativeNotificationPayload): Promise<NativeChatNotificationResult> {
  const ready = await ensureAndroidLocalNotificationsReady();
  if (ready.status !== "success") return ready;
  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id: numericNotificationId(payload.id),
          title: payload.title,
          body: payload.body,
          largeBody: payload.body,
          channelId: androidChatNotificationChannelId,
          iconColor: "#0F9EB5",
          smallIcon: "ic_stat_orf_notification",
          extra: {
            channelId: payload.channelId,
            messageId: payload.messageId,
            targetPath: payload.targetPath,
          },
        },
      ],
    });
    return { status: "success" };
  } catch (error) {
    return { status: "error", reason: "android_local_notification", data: String(error) };
  }
}

function ensureAndroidLocalNotificationsReady() {
  androidLocalNotificationReady ??= (async () => {
    try {
      let permission = (await LocalNotifications.checkPermissions()).display;
      if (permission !== "granted") {
        permission = (await LocalNotifications.requestPermissions()).display;
      }
      if (permission !== "granted") {
        return { status: "not_sent", reason: "permission_denied", data: permission } satisfies NativeChatNotificationResult;
      }
      const enabled = await LocalNotifications.areEnabled();
      if (!enabled.value) {
        return { status: "not_sent", reason: "permission_denied", data: "notifications_disabled" } satisfies NativeChatNotificationResult;
      }
      await LocalNotifications.createChannel({
        id: androidChatNotificationChannelId,
        name: "聊天消息",
        description: "ORF 聊天消息通知",
        importance: 4,
        visibility: 0,
        vibration: true,
      });
      return { status: "success" } satisfies NativeChatNotificationResult;
    } catch (error) {
      androidLocalNotificationReady = null;
      return { status: "error", reason: "android_local_notification_setup", data: String(error) } satisfies NativeChatNotificationResult;
    }
  })();
  return androidLocalNotificationReady;
}

function numericNotificationId(id: string) {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) | 0;
  }
  return (hash & 0x7fffffff) || 1;
}

function chatNotificationTargetPathFromExtra(extra: unknown) {
  if (!extra || typeof extra !== "object" || !("targetPath" in extra)) return null;
  const targetPath = (extra as { targetPath?: unknown }).targetPath;
  return typeof targetPath === "string" && isSafeChatNotificationTargetPath(targetPath) ? targetPath : null;
}

export function isSafeChatNotificationTargetPath(targetPath: string) {
  return /^\/chat(?:\/[^?#]+)?(?:\?[^#]*)?$/.test(targetPath);
}

function normalizeNativeChatNotificationResult(result: NativeChatNotificationResult | undefined): NativeChatNotificationResult {
  return result?.status ? result : { status: "success" };
}
