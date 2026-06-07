import { Download, ExternalLink, RefreshCw, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { orfClientCurrentVersion } from "./clientUpdateConfig";
import { getLatestClientRelease } from "./clientUpdateApi";
import { buildClientUpdateDecision, type ClientUpdateDecision } from "./clientUpdateModel";
import { detectClientUpdatePlatform, installClientUpdateAsset, openClientUpdateUrl, type ClientUpdateInstallResult } from "./clientUpdateRuntime";

const updateDismissStoragePrefix = "orf-client-update-dismissed:";
const updateCheckIntervalMs = 6 * 60 * 60 * 1000;

type UpdateNoticeState =
  | { status: "checking" }
  | { status: "error"; message: string }
  | { status: "ready"; decision: ClientUpdateDecision };

export function ClientUpdateNotice() {
  const [noticeState, setNoticeState] = useState<UpdateNoticeState>({ status: "checking" });
  const [dismissedVersions, setDismissedVersions] = useState<Set<string>>(() => readDismissedVersions());
  const [openingUrl, setOpeningUrl] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installMessage, setInstallMessage] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const check = () => {
      void checkForClientUpdate(controller.signal)
        .then((decision) => setNoticeState({ status: "ready", decision }))
        .catch((error) => {
          if (!controller.signal.aborted) {
            setNoticeState({ status: "error", message: error instanceof Error ? error.message : "检查更新失败" });
          }
        });
    };

    check();
    const interval = window.setInterval(check, updateCheckIntervalMs);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, []);

  const availableDecision = useMemo(() => {
    if (noticeState.status !== "ready" || noticeState.decision.status !== "available") return null;
    return noticeState.decision;
  }, [noticeState]);

  if (!availableDecision || dismissedVersions.has(availableDecision.release.version)) {
    return null;
  }

  const release = availableDecision.release;
  const asset = availableDecision.asset;
  const secondaryUrl = release.htmlUrl;
  const dateLabel = release.publishedAt ? formatUpdateDate(release.publishedAt) : release.tagName;

  const openUrl = async (url: string) => {
    setOpeningUrl(url);
    try {
      await openClientUpdateUrl(url);
    } finally {
      setOpeningUrl(null);
    }
  };

  const installUpdate = async () => {
    if (!asset) {
      await openUrl(secondaryUrl);
      return;
    }

    setInstalling(true);
    setInstallMessage(null);
    try {
      const result = await installClientUpdateAsset(asset);
      setInstallMessage(clientUpdateInstallMessage(result));
      if (shouldOpenDownloadUrlAfterInstallResult(result)) {
        await openUrl(asset.downloadUrl);
      }
    } catch (error) {
      setInstallMessage(error instanceof Error ? error.message : "更新安装失败");
    } finally {
      setInstalling(false);
    }
  };

  return (
    <section className="orf-client-update-notice" aria-live="polite">
      <div className="orf-client-update-icon" aria-hidden="true">
        <RefreshCw className="h-4 w-4" />
      </div>
      <div className="orf-client-update-copy">
        <div className="orf-client-update-title">发现 ORF 客户端 {release.version}</div>
        <div className="orf-client-update-meta">
          当前 {availableDecision.currentVersion} · {dateLabel}
          {asset ? ` · ${asset.name}` : " · 打开发布页下载"}
        </div>
        {installMessage && <div className="orf-client-update-message">{installMessage}</div>}
      </div>
      <div className="orf-client-update-actions">
        <button
          type="button"
          className="orf-client-update-primary"
          disabled={openingUrl !== null || installing}
          onClick={() => void installUpdate()}
        >
          <Download className="h-3.5 w-3.5" />
          {installing ? "正在下载" : asset ? "下载并安装" : "打开发布页"}
        </button>
        <button
          type="button"
          className="orf-client-update-secondary"
          disabled={openingUrl !== null}
          onClick={() => void openUrl(secondaryUrl)}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          发布说明
        </button>
        <button
          type="button"
          className="orf-client-update-close"
          aria-label="稍后再说"
          title="稍后再说"
          onClick={() => {
            rememberDismissedVersion(release.version);
            setDismissedVersions(readDismissedVersions());
          }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}

async function checkForClientUpdate(signal: AbortSignal) {
  const [platform, release] = await Promise.all([
    detectClientUpdatePlatform(),
    getLatestClientRelease(signal),
  ]);
  return buildClientUpdateDecision({
    currentVersion: orfClientCurrentVersion,
    platform,
    release,
  });
}

function readDismissedVersions() {
  if (typeof window === "undefined") return new Set<string>();
  const versions = new Set<string>();
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(updateDismissStoragePrefix)) {
      versions.add(key.slice(updateDismissStoragePrefix.length));
    }
  }
  return versions;
}

function rememberDismissedVersion(version: string) {
  window.localStorage.setItem(`${updateDismissStoragePrefix}${version}`, new Date().toISOString());
}

function formatUpdateDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function clientUpdateInstallMessage(result: ClientUpdateInstallResult) {
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
  if (result.reason === "unsupported_platform" || result.reason === "no_native_update_installer") {
    return "当前客户端缺少内置安装器，已打开安装包下载地址；安装一次新版后可应用内更新。";
  }
  if (result.reason === "installer_open_failed") {
    return "安装包已下载，但启动安装程序失败。";
  }
  if (result.reason === "installer_download_failed" || result.reason === "apk_install_failed") {
    return "安装包下载或安装启动失败，请稍后重试。";
  }
  return "更新安装启动失败。";
}

function shouldOpenDownloadUrlAfterInstallResult(result: ClientUpdateInstallResult) {
  return result.reason === "unsupported_platform" || result.reason === "no_native_update_installer";
}
