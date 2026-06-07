import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { isTrustedClientUpdateUrl, type ClientUpdatePlatform } from "./clientUpdateModel";

type NativeRuntimeInfo = {
  platform?: string;
};

type NativeRuntimeBridge = {
  getInfo?: () => Promise<NativeRuntimeInfo>;
  openExternal?: (url: string) => Promise<{ reason?: string; status: "error" | "success" | "unsupported" }>;
};

declare global {
  interface Window {
    orfNativeRuntime?: NativeRuntimeBridge;
  }
}

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
