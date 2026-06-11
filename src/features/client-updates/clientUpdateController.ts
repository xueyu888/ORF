import { orfClientCurrentVersion } from "./clientUpdateConfig";
import { getLatestClientRelease } from "./clientUpdateApi";
import { buildClientUpdateDecision, type ClientUpdateDecision, type ClientUpdatePlatform } from "./clientUpdateModel";
import {
  detectClientUpdateRuntimeInfo,
  type ClientUpdateInstallProgress,
  type ClientUpdateInstallResult,
  type ClientUpdateRuntimeInfo,
} from "./clientUpdateRuntime";

export type ClientUpdateCheckResult = {
  decision: ClientUpdateDecision;
  runtime: ClientUpdateRuntimeInfo;
};

export async function checkForClientUpdate(signal?: AbortSignal): Promise<ClientUpdateCheckResult> {
  const [runtime, release] = await Promise.all([
    detectClientUpdateRuntimeInfo(orfClientCurrentVersion),
    getLatestClientRelease(signal),
  ]);
  return {
    decision: buildClientUpdateDecision({
      currentVersion: runtime.currentVersion,
      platform: runtime.platform,
      release,
    }),
    runtime,
  };
}

export function formatUpdateDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function formatCurrentVersionLabel(decision: ClientUpdateDecision, runtime: ClientUpdateRuntimeInfo) {
  if (runtime.versionSource === "unknown") {
    return "当前版本未知";
  }
  if (runtime.versionSource === "web") {
    return `当前 ${decision.currentVersion}（Web 版本）`;
  }
  return `当前 ${decision.currentVersion}`;
}

export function clientUpdatePlatformLabel(platform: ClientUpdatePlatform) {
  if (platform === "android") return "Android 移动端";
  if (platform === "desktop-windows") return "Win11 PC 端";
  if (platform === "desktop-other") return "桌面端";
  return "Web 端";
}

export function clientUpdateInstallMessage(result: ClientUpdateInstallResult) {
  if (result.status === "success") {
    return "安装程序已打开，按系统提示完成覆盖安装。";
  }
  if (result.reason === "install_permission_required") {
    return "已打开安装权限页，允许 ORF 安装未知应用后再点一次更新。";
  }
  if (result.reason === "untrusted_url") {
    return "更新安装包地址不可信，已停止。";
  }
  if (result.reason === "invalid_payload") {
    return "更新安装参数无效。";
  }
  if (result.reason === "apk_package_mismatch") {
    return "安装包不是 ORF 客户端，已停止安装。";
  }
  if (result.reason === "apk_signature_mismatch") {
    return "安装包签名和当前已安装版本不一致，Android 不允许覆盖安装；请先卸载旧版 ORF，再安装这一版。";
  }
  if (result.reason === "apk_parse_failed" || result.reason === "apk_signature_check_failed") {
    return "安装包解析或签名校验失败，已停止安装。";
  }
  if (result.reason === "unsupported_platform" || result.reason === "no_native_update_installer") {
    return "当前客户端缺少内置安装器，已打开安装包下载地址；安装一次新版后可应用内更新。";
  }
  if (result.reason === "installer_open_failed") {
    return withClientUpdateErrorDetail("安装包已下载，但启动安装程序失败。", result.data);
  }
  if (result.reason === "installer_download_failed" || result.reason === "apk_download_failed") {
    return withClientUpdateErrorDetail("安装包下载失败，请稍后重试。", result.data);
  }
  if (result.reason === "apk_install_failed") {
    return withClientUpdateErrorDetail("安装包安装启动失败，请稍后重试。", result.data);
  }
  return "更新安装启动失败。";
}

export function shouldOpenDownloadUrlAfterInstallResult(result: ClientUpdateInstallResult) {
  return result.reason === "unsupported_platform" || result.reason === "no_native_update_installer";
}

export function clientUpdateInstallProgressMessage(progress: ClientUpdateInstallProgress) {
  if (progress.stage === "preparing") return "正在准备下载";
  if (progress.stage === "downloading") return "正在下载更新安装包";
  if (progress.stage === "downloaded") return "安装包已下载，正在处理";
  if (progress.stage === "validating") return "正在校验安装包";
  if (progress.stage === "opening") return "正在打开安装程序";
  if (progress.stage === "complete") return "安装程序已打开";
  return progress.error ? `下载或安装失败：${cleanClientUpdateErrorDetail(progress.error)}` : "下载或安装失败";
}

export function clientUpdateInstallProgressPercent(progress: ClientUpdateInstallProgress) {
  if (typeof progress.percent === "number" && Number.isFinite(progress.percent)) {
    return Math.max(0, Math.min(100, progress.percent));
  }
  if (
    typeof progress.downloadedBytes === "number" &&
    typeof progress.totalBytes === "number" &&
    Number.isFinite(progress.downloadedBytes) &&
    Number.isFinite(progress.totalBytes) &&
    progress.totalBytes > 0
  ) {
    return Math.max(0, Math.min(100, (progress.downloadedBytes / progress.totalBytes) * 100));
  }
  return null;
}

export function clientUpdateInstallProgressBytes(progress: ClientUpdateInstallProgress) {
  if (typeof progress.downloadedBytes !== "number" || !Number.isFinite(progress.downloadedBytes)) return null;
  if (typeof progress.totalBytes === "number" && Number.isFinite(progress.totalBytes) && progress.totalBytes > 0) {
    return `${formatClientUpdateBytes(progress.downloadedBytes)} / ${formatClientUpdateBytes(progress.totalBytes)}`;
  }
  return `已下载 ${formatClientUpdateBytes(progress.downloadedBytes)}`;
}

export function formatClientUpdateBytes(value: number) {
  if (value < 1024) return `${Math.max(0, Math.round(value))} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function withClientUpdateErrorDetail(message: string, data: string | undefined) {
  const detail = cleanClientUpdateErrorDetail(data);
  return detail ? `${message}原因：${detail}` : message;
}

function cleanClientUpdateErrorDetail(data: string | undefined) {
  const detail = typeof data === "string" ? data.trim() : "";
  if (!detail) return "";
  return detail
    .replace(/^Error:\s*/i, "")
    .replace(/\s+/g, " ")
    .slice(0, 180);
}
