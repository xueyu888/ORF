import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import {
  PushNotifications,
  type ActionPerformed,
  type PushNotificationSchema,
  type RegistrationError,
  type Token,
} from "@capacitor/push-notifications";
import { orfClientCurrentVersion } from "../client-updates/clientUpdateConfig";
import { detectAndroidNativeRuntimeInfo, detectClientUpdateRuntimeInfo, type NativeRuntimeInfo } from "../client-updates/clientUpdateRuntime";
import {
  registerPushDeviceRequest,
  reportPushRegistrationStatusRequest,
  revokePushDeviceRequest,
  type PushRegistrationStatusInput,
} from "../../state/apiClient";
import {
  buildReceivedPushFallbackNotification,
  orfChatPushChannelId,
  orfClientUpdatePushChannelId,
  orfPushFallbackSource,
  pushNotificationTargetPath,
  targetPathFromPushNotificationExtra,
} from "./orfPushNotificationModel";

type PushOpenHandler = (targetPath: string) => void;

const cachedAndroidFcmPushTokenKey = "orf.android.fcmPushToken";
const cachedAndroidVivoPushRegIdKey = "orf.android.vivoPushRegId";
const pushChannels = [
  {
    id: orfChatPushChannelId,
    name: "ORF 聊天消息",
    description: "私聊、群聊和频道新消息",
    importance: 4 as const,
    lights: true,
    lightColor: "#0F9EB5",
    vibration: true,
    visibility: 0 as const,
  },
  {
    id: orfClientUpdatePushChannelId,
    name: "ORF 客户端更新",
    description: "客户端新版本提示",
    importance: 3 as const,
    lights: true,
    lightColor: "#0F9EB5",
    vibration: false,
    visibility: 0 as const,
  },
];

let androidFcmListenersReady: Promise<void> | null = null;
let androidFcmOpenHandler: PushOpenHandler | null = null;

export async function registerOrfPushNotifications(onOpenTarget: PushOpenHandler) {
  if (!isAndroidNativeRuntime()) return;
  await ensureAndroidPushChannels();
  await reportAndroidPushRegistrationStatus({ status: "starting" });
  androidFcmOpenHandler = onOpenTarget;

  let permission = await readAndroidNotificationPermission();
  if (permission !== "granted") {
    permission = await requestAndroidNotificationPermission();
  }
  if (permission !== "granted") {
    await reportAndroidPushRegistrationStatus({
      detail: `display=${permission}`,
      reason: "notification_permission_denied",
      status: "permission_denied",
    });
    return;
  }

  await registerCurrentAndroidFcmPushDevice().catch((error: unknown) =>
    reportAndroidPushRegistrationStatus({
      detail: errorMessage(error),
      reason: "fcm_register_failed",
      status: "registration_error",
    }),
  );
  clearLegacyAndroidVendorPushCache();
}

export async function revokeOrfPushNotifications() {
  if (!isAndroidNativeRuntime()) return;
  const fcmToken = readCachedAndroidFcmPushToken();
  if (fcmToken) {
    await revokePushDeviceRequest({ platform: "android", token: fcmToken }).catch(() => undefined);
    window.localStorage.removeItem(cachedAndroidFcmPushTokenKey);
  }
  await PushNotifications.unregister().catch(() => undefined);

  clearLegacyAndroidVendorPushCache();
}

async function registerCurrentAndroidFcmPushDevice() {
  let permission = await readAndroidPushReceivePermission();
  if (permission === "plugin_unavailable") {
    await reportAndroidPushRegistrationStatus({
      detail: "Capacitor PushNotifications native plugin is not packaged in this Android build.",
      reason: "fcm_not_packaged",
      status: "unavailable",
    });
    return;
  }
  if (permission !== "granted") {
    permission = await requestAndroidPushReceivePermission();
  }
  if (permission !== "granted") {
    await reportAndroidPushRegistrationStatus({
      detail: `receive=${permission}`,
      reason: "push_permission_denied",
      status: "permission_denied",
    });
    return;
  }

  await ensureAndroidFcmListeners();
  await reportAndroidPushRegistrationStatus({ status: "registering" });
  const cachedToken = readCachedAndroidFcmPushToken();
  if (cachedToken) {
    await registerAndroidFcmPushToken(cachedToken);
  }
  await PushNotifications.register();
}

async function ensureAndroidFcmListeners() {
  androidFcmListenersReady ??= Promise.all([
    PushNotifications.addListener("registration", (token) => {
      void handleAndroidFcmRegistration(token);
    }),
    PushNotifications.addListener("registrationError", (error) => {
      void handleAndroidFcmRegistrationError(error);
    }),
    PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      handleAndroidFcmNotificationAction(action);
    }),
    PushNotifications.addListener("pushNotificationReceived", (notification) => {
      void showAndroidReceivedPushFallbackNotification(notification);
    }),
    LocalNotifications.addListener("localNotificationActionPerformed", (action) => {
      handleAndroidPushFallbackLocalNotificationAction(action.notification.extra);
    }),
  ])
    .then(() => undefined)
    .catch((error: unknown) => {
      androidFcmListenersReady = null;
      throw error;
    });
  return androidFcmListenersReady;
}

async function handleAndroidFcmRegistration(token: Token) {
  const value = cleanNativeText(token.value);
  if (!value) {
    await reportAndroidPushRegistrationStatus({
      detail: "registration event did not include an FCM token",
      reason: "fcm_empty_token",
      status: "registration_error",
    });
    return;
  }

  window.localStorage.setItem(cachedAndroidFcmPushTokenKey, value);
  await registerAndroidFcmPushToken(value).catch((error: unknown) =>
    reportAndroidPushRegistrationStatus({
      detail: errorMessage(error),
      reason: "fcm_token_register_failed",
      status: "registration_error",
    }),
  );
}

async function handleAndroidFcmRegistrationError(error: RegistrationError) {
  await reportAndroidPushRegistrationStatus({
    detail: cleanNativeText(error.error) ?? "FCM registration failed",
    reason: "fcm_registration_error",
    status: "registration_error",
  });
}

function handleAndroidFcmNotificationAction(action: ActionPerformed) {
  const targetPath = pushNotificationTargetPath(action.notification);
  if (targetPath) {
    androidFcmOpenHandler?.(targetPath);
  }
}

function handleAndroidPushFallbackLocalNotificationAction(extra: unknown) {
  const data = extra && typeof extra === "object" ? (extra as Record<string, unknown>) : {};
  if (data.source !== orfPushFallbackSource) return;
  const targetPath = targetPathFromPushNotificationExtra(data);
  if (targetPath) {
    androidFcmOpenHandler?.(targetPath);
  }
}

async function showAndroidReceivedPushFallbackNotification(notification: PushNotificationSchema) {
  const fallback = buildReceivedPushFallbackNotification(notification, readAndroidPushDisplayState());
  if (!fallback) return;

  await LocalNotifications.schedule({
    notifications: [
      {
        id: fallback.id,
        title: fallback.title,
        body: fallback.body,
        largeBody: fallback.body,
        channelId: fallback.channelId,
        iconColor: "#0F9EB5",
        smallIcon: "ic_stat_orf_notification",
        extra: fallback.extra,
      },
    ],
  }).catch(() => undefined);
}

async function registerAndroidFcmPushToken(token: string) {
  await registerPushDeviceRequest({
    ...(await androidPushRegistrationBaseInput()),
    token,
  });
}

async function reportAndroidPushRegistrationStatus(input: Pick<PushRegistrationStatusInput, "detail" | "reason" | "status">) {
  const baseInput = await androidPushRegistrationBaseInput();
  await reportPushRegistrationStatusRequest({
    ...baseInput,
    detail: input.detail,
    reason: input.reason,
    status: input.status,
  }).catch(() => undefined);
}

async function androidPushRegistrationBaseInput(): Promise<Omit<PushRegistrationStatusInput, "detail" | "reason" | "status">> {
  const [runtime, nativeInfo] = await Promise.all([
    detectClientUpdateRuntimeInfo(orfClientCurrentVersion),
    detectAndroidNativeRuntimeInfo(),
  ]);
  return {
    appBuild: nativeInfo?.versionCode ? String(nativeInfo.versionCode) : null,
    appVersion: runtime.currentVersion || orfClientCurrentVersion,
    deviceLabel: androidDeviceLabel(nativeInfo),
    deviceManufacturer: cleanNativeText(nativeInfo?.deviceManufacturer),
    deviceModel: cleanNativeText(nativeInfo?.deviceModel),
    googlePlayServicesAvailable: typeof nativeInfo?.googlePlayServicesAvailable === "boolean" ? nativeInfo.googlePlayServicesAvailable : null,
    notificationPermission: cleanNativeText(nativeInfo?.notificationPermission),
    osVersion: cleanNativeText(nativeInfo?.osVersion),
    platform: "android",
    sdkInt: typeof nativeInfo?.sdkInt === "number" ? nativeInfo.sdkInt : null,
  };
}

async function ensureAndroidPushChannels() {
  await Promise.all(pushChannels.map((channel) => LocalNotifications.createChannel(channel).catch(() => undefined)));
}

async function readAndroidNotificationPermission() {
  const permission = await LocalNotifications.checkPermissions().catch(() => null);
  return cleanNativeText(permission?.display) ?? "unknown";
}

async function requestAndroidNotificationPermission() {
  const permission = await LocalNotifications.requestPermissions().catch(() => null);
  return cleanNativeText(permission?.display) ?? "unknown";
}

async function readAndroidPushReceivePermission() {
  const permission = await PushNotifications.checkPermissions().catch(() => null);
  return cleanNativeText(permission?.receive) ?? "plugin_unavailable";
}

async function requestAndroidPushReceivePermission() {
  const permission = await PushNotifications.requestPermissions().catch(() => null);
  return cleanNativeText(permission?.receive) ?? "plugin_unavailable";
}

function readCachedAndroidFcmPushToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(cachedAndroidFcmPushTokenKey)?.trim() || null;
}

function clearLegacyAndroidVendorPushCache() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(cachedAndroidVivoPushRegIdKey);
}

function androidDeviceLabel(nativeInfo: NativeRuntimeInfo | null) {
  const parts = [nativeInfo?.deviceManufacturer, nativeInfo?.deviceModel]
    .map((item) => cleanNativeText(item))
    .filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "Android";
}

function cleanNativeText(value: string | null | undefined) {
  return value?.trim() || null;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isAndroidNativeRuntime() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

function readAndroidPushDisplayState() {
  if (typeof document === "undefined") {
    return { documentFocused: false, visibilityState: "unknown" as const };
  }
  return {
    documentFocused: document.hasFocus(),
    visibilityState: document.visibilityState,
  };
}
