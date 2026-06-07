import { Capacitor } from "@capacitor/core";
import { PushNotifications, type ActionPerformed, type RegistrationError, type Token } from "@capacitor/push-notifications";
import { orfClientCurrentVersion } from "../client-updates/clientUpdateConfig";
import { detectAndroidNativeRuntimeInfo, detectClientUpdateRuntimeInfo, type NativeRuntimeInfo } from "../client-updates/clientUpdateRuntime";
import {
  registerPushDeviceRequest,
  registerPushVendorDeviceRequest,
  reportPushRegistrationStatusRequest,
  reportPushVendorRegistrationStatusRequest,
  revokePushDeviceRequest,
  revokePushVendorDeviceRequest,
  type PushRegistrationStatusInput,
  type PushVendorRegistrationStatusInput,
} from "../../state/apiClient";

type PushOpenHandler = (targetPath: string) => void;

const cachedAndroidPushTokenKey = "orf.android.pushToken";
const cachedAndroidVivoPushRegIdKey = "orf.android.vivoPushRegId";
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
  await reportAndroidPushRegistrationStatus({ status: "starting" });
  await reportAndroidVivoPushRegistrationStatus({ status: "starting" });

  const cachedToken = readCachedAndroidPushToken();
  if (cachedToken) {
    await registerAndroidPushToken(cachedToken).catch(() => undefined);
  }

  let permission = await PushNotifications.checkPermissions();
  if (permission.receive !== "granted") {
    permission = await PushNotifications.requestPermissions();
  }
  if (permission.receive !== "granted") {
    await reportAndroidPushRegistrationStatus({
      detail: `receive=${permission.receive}`,
      reason: "notification_permission_denied",
      status: "permission_denied",
    });
    return;
  }

  await registerCurrentAndroidVendorPushDevice().catch((error: unknown) =>
    reportAndroidVivoPushRegistrationStatus({
      detail: errorMessage(error),
      reason: "vendor_push_register_failed",
      status: "registration_error",
    }),
  );
  await reportAndroidPushRegistrationStatus({ status: "registering" });
  try {
    await PushNotifications.register();
  } catch (error) {
    await reportAndroidPushRegistrationStatus({
      detail: errorMessage(error),
      reason: "register_call_failed",
      status: "registration_error",
    });
  }
}

export async function revokeOrfPushNotifications() {
  if (!isAndroidNativeRuntime()) return;
  const token = readCachedAndroidPushToken();
  if (token) {
    await revokePushDeviceRequest({ platform: "android", token }).catch(() => undefined);
    window.localStorage.removeItem(cachedAndroidPushTokenKey);
  }
  const vivoRegId = readCachedAndroidVivoPushRegId();
  if (vivoRegId) {
    await revokePushVendorDeviceRequest({ platform: "android", token: vivoRegId, vendor: "vivo" }).catch(() => undefined);
    window.localStorage.removeItem(cachedAndroidVivoPushRegIdKey);
  }
  await PushNotifications.unregister().catch(() => undefined);
}

async function ensurePushListeners() {
  if (listenersPromise) return listenersPromise;
  listenersPromise = Promise.all([
    PushNotifications.addListener("registration", handleRegistration),
    PushNotifications.addListener("registrationError", handleRegistrationError),
    PushNotifications.addListener("pushNotificationActionPerformed", handleNotificationAction),
  ]).then(() => undefined);
  return listenersPromise;
}

async function handleRegistration(token: Token) {
  const value = token.value.trim();
  if (!value) return;
  window.localStorage.setItem(cachedAndroidPushTokenKey, value);
  await registerAndroidPushToken(value).catch((error: unknown) =>
    reportAndroidPushRegistrationStatus({
      detail: errorMessage(error),
      reason: "server_token_register_failed",
      status: "registration_error",
    }),
  );
}

function handleRegistrationError(error: RegistrationError) {
  void reportAndroidPushRegistrationStatus({
    detail: cleanNativeText(error.error),
    reason: "fcm_registration_error",
    status: "registration_error",
  });
}

function handleNotificationAction(action: ActionPerformed) {
  const targetPath = notificationTargetPath(action.notification.data);
  if (targetPath && isSafePushTargetPath(targetPath)) {
    openHandler?.(targetPath);
  }
}

async function registerAndroidPushToken(token: string) {
  const baseInput = await androidPushRegistrationBaseInput();
  await registerPushDeviceRequest({
    ...baseInput,
    token,
  });
}

async function registerCurrentAndroidVendorPushDevice() {
  const nativeInfo = await detectAndroidNativeRuntimeInfo();
  const cachedVivoRegId = readCachedAndroidVivoPushRegId();
  const vivoRegId = cleanNativeText(nativeInfo?.vivoPushRegId) ?? cachedVivoRegId;
  if (!vivoRegId) {
    if (nativeInfo?.vivoPushReason && nativeInfo.vivoPushReason !== "non_vivo_device") {
      await reportAndroidVivoPushRegistrationStatus({
        detail: cleanNativeText(nativeInfo.vivoPushReason),
        reason: "vendor_push_unavailable",
        status: "unavailable",
      });
    } else if (nativeInfo?.vivoPushReason === "non_vivo_device") {
      await reportAndroidVivoPushRegistrationStatus({
        detail: "non_vivo_device",
        reason: "non_vivo_device",
        status: "unavailable",
      });
    }
    return;
  }

  await reportAndroidVivoPushRegistrationStatus({ status: "registering" });
  await registerAndroidVivoPushToken(vivoRegId);
  window.localStorage.setItem(cachedAndroidVivoPushRegIdKey, vivoRegId);
}

async function registerAndroidVivoPushToken(token: string) {
  const { googlePlayServicesAvailable: _googlePlayServicesAvailable, ...baseInput } = await androidPushRegistrationBaseInput();
  await registerPushVendorDeviceRequest({
    ...baseInput,
    token,
    vendor: "vivo",
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

async function reportAndroidVivoPushRegistrationStatus(input: Pick<PushVendorRegistrationStatusInput, "detail" | "reason" | "status">) {
  const { googlePlayServicesAvailable: _googlePlayServicesAvailable, ...baseInput } = await androidPushRegistrationBaseInput();
  await reportPushVendorRegistrationStatusRequest({
    ...baseInput,
    detail: input.detail,
    reason: input.reason,
    status: input.status,
    vendor: "vivo",
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
  await Promise.all(pushChannels.map((channel) => PushNotifications.createChannel(channel).catch(() => undefined)));
}

function readCachedAndroidPushToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(cachedAndroidPushTokenKey)?.trim() || null;
}

function readCachedAndroidVivoPushRegId() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(cachedAndroidVivoPushRegIdKey)?.trim() || null;
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
