import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import type { ChatNativeNotificationPayload } from "./chatNativeNotificationModel";
import { prepareDesktopNotificationAvatar } from "../desktop/desktopNotificationAvatar";
import { showDesktopToastIntent } from "../desktop/desktopShellRuntime";

type NativeChatNotificationResult = {
  data?: string;
  reason?: string;
  status: "error" | "not_sent" | "success" | "unsupported";
};

const androidChatNotificationChannelId = "orf-chat-messages";
let androidLocalNotificationReady: Promise<NativeChatNotificationResult> | null = null;

export async function sendNativeChatNotification(payload: ChatNativeNotificationPayload): Promise<NativeChatNotificationResult> {
  const desktopResult = await sendDesktopChatNotification(payload);
  if (desktopResult.status !== "unsupported") return desktopResult;

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
    if (androidListener) void androidListener.then((listener) => listener.remove());
  };
}

async function sendDesktopChatNotification(payload: ChatNativeNotificationPayload): Promise<NativeChatNotificationResult> {
  try {
    const desktopPayload = await prepareDesktopNotificationAvatar({ ...payload, avatarDataUrl: null });
    const result = await showDesktopToastIntent({
      avatarDataUrl: desktopPayload.avatarDataUrl,
      body: payload.body,
      duration: "long",
      eventId: `chat:${payload.messageId}`,
      level: payload.level ?? "toast",
      sender: payload.sender,
      source: "chat",
      targetPath: payload.targetPath,
      title: payload.title,
    });
    return result.status ? { reason: result.reason, status: result.status } : { status: "success" };
  } catch (error) {
    return { status: "error", reason: "desktop_bridge", data: String(error) };
  }
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
