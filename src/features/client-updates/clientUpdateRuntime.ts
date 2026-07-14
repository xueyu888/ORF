import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import {
  isClientReleaseVersion,
  isTrustedClientUpdateUrl,
  selectClientUpdateMirrorFallbackUrl,
  type ClientReleaseAsset,
  type ClientUpdatePlatform,
} from "./clientUpdateModel";

export type NativeRuntimeInfo = {
  deviceManufacturer?: string | null;
  deviceModel?: string | null;
  googlePlayServicesAvailable?: boolean | null;
  notificationPermission?: string | null;
  osVersion?: string | null;
  platform?: string;
  sdkInt?: number | null;
  version?: string | null;
  versionCode?: number | null;
};

export type ClientUpdateRuntimeInfo = {
  currentVersion: string;
  platform: ClientUpdatePlatform;
  versionSource: "native" | "unknown" | "web";
};

export type ClientUpdateInstallResult = {
  data?: string;
  reason?: string;
  status: "error" | "not_sent" | "success" | "unsupported";
};

export type ClientUpdateInstallProgressStage = "preparing" | "downloading" | "downloaded" | "validating" | "opening" | "closing" | "complete" | "failed";

export type ClientUpdateInstallProgress = {
  assetName?: string;
  downloadedBytes?: number | null;
  error?: string | null;
  installId?: string;
  percent?: number | null;
  stage: ClientUpdateInstallProgressStage;
  totalBytes?: number | null;
};

export type ClientUpdateInstallProgressHandler = (progress: ClientUpdateInstallProgress) => void;

type NativeRuntimeBridge = {
  getInfo?: () => Promise<NativeRuntimeInfo>;
  installUpdate?: (payload: ClientUpdateInstallPayload) => Promise<ClientUpdateInstallResult>;
  onInstallProgress?: (handler: ClientUpdateInstallProgressHandler) => (() => void) | undefined;
  openExternal?: (url: string) => Promise<{ reason?: string; status: "error" | "success" | "unsupported" }>;
};

type ClientUpdateInstallPayload = {
  installId: string;
  name: string;
  url: string;
};

type ClientUpdateInstaller = (payload: ClientUpdateInstallPayload) => Promise<ClientUpdateInstallResult | undefined>;
type ClientUpdateProgressEmitter = (
  progress: Partial<ClientUpdateInstallProgress> & { stage: ClientUpdateInstallProgressStage },
) => void;

type AndroidClientUpdatePlugin = {
  addListener: (eventName: "installProgress", listenerFunc: ClientUpdateInstallProgressHandler) => Promise<PluginListenerHandle>;
  getInfo?: () => Promise<NativeRuntimeInfo>;
  install: (payload: ClientUpdateInstallPayload) => Promise<ClientUpdateInstallResult>;
};

declare global {
  interface Window {
    orfNativeRuntime?: NativeRuntimeBridge;
  }
}

const AndroidClientUpdate = registerPlugin<AndroidClientUpdatePlugin>("OrfClientUpdate");

export async function detectClientUpdatePlatform(): Promise<ClientUpdatePlatform> {
  return (await detectClientUpdateRuntimeInfo("0.0.0")).platform;
}

export async function detectAndroidNativeRuntimeInfo(): Promise<NativeRuntimeInfo | null> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return null;
  return AndroidClientUpdate.getInfo?.().catch(() => null) ?? null;
}

export async function detectClientUpdateRuntimeInfo(webFallbackVersion: string): Promise<ClientUpdateRuntimeInfo> {
  if (typeof window !== "undefined" && window.orfNativeRuntime?.getInfo) {
    const info = await window.orfNativeRuntime.getInfo().catch(() => null);
    return {
      currentVersion: nativeClientVersion(info),
      platform: info?.platform === "win32" ? "desktop-windows" : "desktop-other",
      versionSource: nativeClientVersionSource(info),
    };
  }
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
    const info = await detectAndroidNativeRuntimeInfo();
    return {
      currentVersion: nativeClientVersion(info),
      platform: "android",
      versionSource: nativeClientVersionSource(info),
    };
  }
  return {
    currentVersion: webFallbackVersion,
    platform: "web",
    versionSource: "web",
  };
}

export async function installClientUpdateAsset(
  asset: ClientReleaseAsset,
  options: { onProgress?: ClientUpdateInstallProgressHandler } = {},
): Promise<ClientUpdateInstallResult> {
  if (!isTrustedClientUpdateUrl(asset.downloadUrl)) {
    return { status: "not_sent", reason: "untrusted_url" };
  }

  const installId = createClientUpdateInstallId();
  const payload = {
    installId,
    name: asset.name,
    url: asset.downloadUrl,
  };
  const emitProgress = (progress: Partial<ClientUpdateInstallProgress> & { stage: ClientUpdateInstallProgressStage }) => {
    options.onProgress?.(normalizeClientUpdateInstallProgress(progress, {
      assetName: asset.name,
      installId,
      totalBytes: asset.size ?? null,
    }));
  };

  if (typeof window !== "undefined" && window.orfNativeRuntime?.installUpdate) {
    const removeProgressListener = subscribeDesktopInstallProgress(installId, asset, options.onProgress);
    try {
      emitProgress({ downloadedBytes: 0, stage: "preparing" });
      const result = await installClientUpdateWithMirrorFallback(window.orfNativeRuntime.installUpdate, asset, payload, emitProgress);
      emitTerminalInstallProgress(result, emitProgress);
      return result;
    } finally {
      removeProgressListener?.();
    }
  }
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
    const removeProgressListener = await subscribeAndroidInstallProgress(installId, asset, options.onProgress);
    try {
      emitProgress({ downloadedBytes: 0, stage: "preparing" });
      const result = await installClientUpdateWithMirrorFallback(AndroidClientUpdate.install, asset, payload, emitProgress);
      emitTerminalInstallProgress(result, emitProgress);
      return result;
    } catch (error) {
      const result = { status: "unsupported", reason: "no_native_update_installer", data: String(error) } as const;
      emitTerminalInstallProgress(result, emitProgress);
      return result;
    } finally {
      removeProgressListener?.();
    }
  }
  const result = { status: "unsupported", reason: "no_native_update_installer" } as const;
  emitTerminalInstallProgress(result, emitProgress);
  return result;
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

async function installClientUpdateWithMirrorFallback(
  installUpdate: ClientUpdateInstaller,
  asset: ClientReleaseAsset,
  payload: ClientUpdateInstallPayload,
  emitProgress: ClientUpdateProgressEmitter,
) {
  const primaryResult = await installClientUpdatePayload(installUpdate, payload);
  const fallbackUrl = selectClientUpdateMirrorFallbackUrl(asset, {
    attemptedUrl: payload.url,
    reason: primaryResult.reason,
  });
  if (!fallbackUrl) return primaryResult;

  emitProgress({ downloadedBytes: 0, stage: "preparing" });
  return installClientUpdatePayload(installUpdate, { ...payload, url: fallbackUrl });
}

async function installClientUpdatePayload(installUpdate: ClientUpdateInstaller, payload: ClientUpdateInstallPayload) {
  return normalizeClientUpdateInstallResult(await installUpdate(payload));
}

function createClientUpdateInstallId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `client-update-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function subscribeDesktopInstallProgress(
  installId: string,
  asset: ClientReleaseAsset,
  onProgress?: ClientUpdateInstallProgressHandler,
) {
  if (typeof window === "undefined" || !onProgress || !window.orfNativeRuntime?.onInstallProgress) {
    return undefined;
  }
  try {
    return window.orfNativeRuntime.onInstallProgress((progress) => {
      if (progress.installId !== installId) return;
      onProgress(normalizeClientUpdateInstallProgress(progress, {
        assetName: asset.name,
        installId,
        totalBytes: asset.size ?? null,
      }));
    });
  } catch {
    return undefined;
  }
}

async function subscribeAndroidInstallProgress(
  installId: string,
  asset: ClientReleaseAsset,
  onProgress?: ClientUpdateInstallProgressHandler,
) {
  if (!onProgress || !AndroidClientUpdate.addListener) {
    return undefined;
  }
  try {
    const listener = await AndroidClientUpdate.addListener("installProgress", (progress) => {
      if (progress.installId !== installId) return;
      onProgress(normalizeClientUpdateInstallProgress(progress, {
        assetName: asset.name,
        installId,
        totalBytes: asset.size ?? null,
      }));
    });
    return () => {
      void listener.remove();
    };
  } catch {
    return undefined;
  }
}

function emitTerminalInstallProgress(
  result: ClientUpdateInstallResult,
  emitProgress: ClientUpdateProgressEmitter,
) {
  if (result.status === "success") {
    if (result.reason === "installer_scheduled") {
      emitProgress({ percent: 100, stage: "closing" });
      return;
    }
    emitProgress({ percent: 100, stage: "complete" });
    return;
  }
  if (result.status === "error") {
    emitProgress({ error: result.data ?? result.reason ?? null, stage: "failed" });
  }
}

function normalizeClientUpdateInstallProgress(
  progress: Partial<ClientUpdateInstallProgress> & { stage: ClientUpdateInstallProgressStage },
  fallback: { assetName: string; installId: string; totalBytes: number | null },
): ClientUpdateInstallProgress {
  const downloadedBytes = finiteNonNegative(progress.downloadedBytes);
  const totalBytes = positiveNumber(progress.totalBytes) ?? fallback.totalBytes;
  const percent = boundedPercent(progress.percent ?? calculatePercent(downloadedBytes, totalBytes));
  return {
    assetName: progress.assetName ?? fallback.assetName,
    downloadedBytes,
    error: cleanProgressText(progress.error),
    installId: progress.installId ?? fallback.installId,
    percent,
    stage: progress.stage,
    totalBytes,
  };
}

function calculatePercent(downloadedBytes: number | null, totalBytes: number | null) {
  if (downloadedBytes === null || totalBytes === null || totalBytes <= 0) return null;
  return (downloadedBytes / totalBytes) * 100;
}

function boundedPercent(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, value));
}

function finiteNonNegative(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, value);
}

function positiveNumber(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

function cleanProgressText(value: string | null | undefined) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed ? trimmed.slice(0, 240) : null;
}

function nativeClientVersion(info: NativeRuntimeInfo | null | undefined) {
  return isClientReleaseVersion(info?.version ?? "") ? String(info?.version) : "0.0.0";
}

function nativeClientVersionSource(info: NativeRuntimeInfo | null | undefined): ClientUpdateRuntimeInfo["versionSource"] {
  return isClientReleaseVersion(info?.version ?? "") ? "native" : "unknown";
}
