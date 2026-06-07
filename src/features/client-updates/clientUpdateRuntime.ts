import { Capacitor, registerPlugin } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { isTrustedClientUpdateUrl, type ClientReleaseAsset, type ClientUpdatePlatform } from "./clientUpdateModel";

type NativeRuntimeInfo = {
  platform?: string;
};

export type ClientUpdateInstallResult = {
  data?: string;
  reason?: string;
  status: "error" | "not_sent" | "success" | "unsupported";
};

type NativeRuntimeBridge = {
  getInfo?: () => Promise<NativeRuntimeInfo>;
  installUpdate?: (payload: ClientUpdateInstallPayload) => Promise<ClientUpdateInstallResult>;
  openExternal?: (url: string) => Promise<{ reason?: string; status: "error" | "success" | "unsupported" }>;
};

type ClientUpdateInstallPayload = {
  name: string;
  url: string;
};

type AndroidClientUpdatePlugin = {
  install: (payload: ClientUpdateInstallPayload) => Promise<ClientUpdateInstallResult>;
};

declare global {
  interface Window {
    orfNativeRuntime?: NativeRuntimeBridge;
  }
}

const AndroidClientUpdate = registerPlugin<AndroidClientUpdatePlugin>("OrfClientUpdate");

export async function detectClientUpdatePlatform(): Promise<ClientUpdatePlatform> {
  if (typeof window !== "undefined" && window.orfNativeRuntime?.getInfo) {
    const info = await window.orfNativeRuntime.getInfo().catch(() => null);
    return info?.platform === "win32" ? "desktop-windows" : "desktop-other";
  }
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
    return "android";
  }
  return "web";
}

export async function installClientUpdateAsset(asset: ClientReleaseAsset): Promise<ClientUpdateInstallResult> {
  if (!isTrustedClientUpdateUrl(asset.downloadUrl)) {
    return { status: "not_sent", reason: "untrusted_url" };
  }

  const payload = {
    name: asset.name,
    url: asset.downloadUrl,
  };

  if (typeof window !== "undefined" && window.orfNativeRuntime?.installUpdate) {
    return normalizeClientUpdateInstallResult(await window.orfNativeRuntime.installUpdate(payload));
  }
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
    try {
      return normalizeClientUpdateInstallResult(await AndroidClientUpdate.install(payload));
    } catch (error) {
      return { status: "unsupported", reason: "no_native_update_installer", data: String(error) };
    }
  }
  return { status: "unsupported", reason: "no_native_update_installer" };
}

export async function openClientUpdateUrl(url: string) {
  if (!isTrustedClientUpdateUrl(url)) {
    throw new Error("更新下载地址不可信");
  }
  if (typeof window !== "undefined" && window.orfNativeRuntime?.openExternal) {
    const result = await window.orfNativeRuntime.openExternal(url);
    if (result.status === "success") return;
    throw new Error(result.reason ?? "打开下载地址失败");
  }
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
    await Browser.open({ url });
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

function normalizeClientUpdateInstallResult(result: ClientUpdateInstallResult | undefined): ClientUpdateInstallResult {
  return result?.status ? result : { status: "success" };
}
