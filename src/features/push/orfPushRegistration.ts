import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { orfClientCurrentVersion } from "../client-updates/clientUpdateConfig";
import { detectAndroidNativeRuntimeInfo, detectClientUpdateRuntimeInfo, type NativeRuntimeInfo } from "../client-updates/clientUpdateRuntime";
import {
  registerPushVendorDeviceRequest,
  reportPushRegistrationStatusRequest,
  reportPushVendorRegistrationStatusRequest,
  revokePushVendorDeviceRequest,
  type PushRegistrationStatusInput,
  type PushVendorRegistrationStatusInput,
} from "../../state/apiClient";

type PushOpenHandler = (targetPath: string) => void;

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

export async function registerOrfPushNotifications(_onOpenTarget: PushOpenHandler) {
  if (!isAndroidNativeRuntime()) return;
  await ensureAndroidPushChannels();
  await reportAndroidPushRegistrationStatus({
    detail: "FCM client plugin is not packaged in this Android build.",
    reason: "fcm_not_packaged",
    status: "unavailable",
  });
  await reportAndroidVivoPushRegistrationStatus({ status: "starting" });

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
    await reportAndroidVivoPushRegistrationStatus({
      detail: `display=${permission}`,
      reason: "notification_permission_denied",
      status: "unavailable",
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
}

export async function revokeOrfPushNotifications() {
  if (!isAndroidNativeRuntime()) return;
  const vivoRegId = readCachedAndroidVivoPushRegId();
  if (vivoRegId) {
    await revokePushVendorDeviceRequest({ platform: "android", token: vivoRegId, vendor: "vivo" }).catch(() => undefined);
    window.localStorage.removeItem(cachedAndroidVivoPushRegIdKey);
  }
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

function isAndroidNativeRuntime() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}
