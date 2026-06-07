import { Capacitor } from "@capacitor/core";
import { PushNotifications, type ActionPerformed, type Token } from "@capacitor/push-notifications";
import { orfClientCurrentVersion } from "../client-updates/clientUpdateConfig";
import { detectClientUpdateRuntimeInfo } from "../client-updates/clientUpdateRuntime";
import { registerPushDeviceRequest, revokePushDeviceRequest } from "../../state/apiClient";

type PushOpenHandler = (targetPath: string) => void;

const cachedAndroidPushTokenKey = "orf.android.pushToken";
const pushChannels = [
  {
    id: "orf-chat-messages",
    name: "ORF 聊天消息",
    description: "私聊、群聊和频道新消息",
    importance: 4 as const,
    lights: true,
    lightColor: "#0F9EB5",
    vibration: true,
    visibility: 0 as const,
  },
  {
    id: "orf-client-updates",
    name: "ORF 客户端更新",
    description: "客户端新版本提示",
    importance: 3 as const,
    lights: true,
    lightColor: "#0F9EB5",
    vibration: false,
    visibility: 0 as const,
  },
];

let openHandler: PushOpenHandler | null = null;
let listenersPromise: Promise<void> | null = null;

export async function registerOrfPushNotifications(onOpenTarget: PushOpenHandler) {
  if (!isAndroidNativeRuntime()) return;
  openHandler = onOpenTarget;
  await ensurePushListeners();
  await ensureAndroidPushChannels();

  const cachedToken = readCachedAndroidPushToken();
  if (cachedToken) {
    await registerAndroidPushToken(cachedToken).catch(() => undefined);
  }

  let permission = await PushNotifications.checkPermissions();
  if (permission.receive !== "granted") {
    permission = await PushNotifications.requestPermissions();
  }
  if (permission.receive !== "granted") {
    return;
  }

  await PushNotifications.register();
}

export async function revokeOrfPushNotifications() {
  if (!isAndroidNativeRuntime()) return;
  const token = readCachedAndroidPushToken();
  if (token) {
    await revokePushDeviceRequest({ platform: "android", token }).catch(() => undefined);
    window.localStorage.removeItem(cachedAndroidPushTokenKey);
  }
  await PushNotifications.unregister().catch(() => undefined);
}

async function ensurePushListeners() {
  if (listenersPromise) return listenersPromise;
  listenersPromise = Promise.all([
    PushNotifications.addListener("registration", handleRegistration),
    PushNotifications.addListener("registrationError", () => undefined),
    PushNotifications.addListener("pushNotificationActionPerformed", handleNotificationAction),
  ]).then(() => undefined);
  return listenersPromise;
}

async function handleRegistration(token: Token) {
  const value = token.value.trim();
  if (!value) return;
  window.localStorage.setItem(cachedAndroidPushTokenKey, value);
  await registerAndroidPushToken(value);
}

function handleNotificationAction(action: ActionPerformed) {
  const targetPath = notificationTargetPath(action.notification.data);
  if (targetPath && isSafePushTargetPath(targetPath)) {
    openHandler?.(targetPath);
  }
}

async function registerAndroidPushToken(token: string) {
  const runtime = await detectClientUpdateRuntimeInfo(orfClientCurrentVersion);
  await registerPushDeviceRequest({
    appBuild: null,
    appVersion: runtime.currentVersion || orfClientCurrentVersion,
    deviceLabel: "Android",
    platform: "android",
    token,
  });
}

async function ensureAndroidPushChannels() {
  await Promise.all(pushChannels.map((channel) => PushNotifications.createChannel(channel).catch(() => undefined)));
}

function readCachedAndroidPushToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(cachedAndroidPushTokenKey)?.trim() || null;
}

function notificationTargetPath(data: unknown) {
  if (!data || typeof data !== "object") return null;
  const rawPath = (data as { targetPath?: unknown }).targetPath;
  return typeof rawPath === "string" ? rawPath : null;
}

function isSafePushTargetPath(path: string) {
  return (
    path === "/" ||
    /^\/chat(?:\/[^?#]+)?(?:\?[^#]*)?$/.test(path) ||
    /^\/notifications(?:\?[^#]*)?$/.test(path) ||
    /^\/feedback(?:\/[^?#]+)?(?:\?[^#]*)?$/.test(path) ||
    /^\/tasks(?:\?[^#]*)?$/.test(path) ||
    /^\/bounties(?:\?[^#]*)?$/.test(path)
  );
}

function isAndroidNativeRuntime() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}
