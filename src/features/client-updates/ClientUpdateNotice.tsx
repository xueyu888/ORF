import { Download, ExternalLink, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, IconButton } from "../../components/ui";
import type { ClientUpdateDecision } from "./clientUpdateModel";
import {
  checkForClientUpdate,
  clientUpdateInstallMessage,
  formatCurrentVersionLabel,
  formatUpdateDate,
  reportClientUpdateReceipt,
  shouldOpenDownloadUrlAfterInstallResult,
} from "./clientUpdateController";
import { ClientUpdateInstallProgressView } from "./ClientUpdateInstallProgressView";
import {
  installClientUpdateAsset,
  openClientUpdateUrl,
  type ClientUpdateInstallProgress,
  type ClientUpdateRuntimeInfo,
} from "./clientUpdateRuntime";
import { clientUpdateCheckRequestEvent } from "./clientUpdateCenterEvents";

const updateDismissStoragePrefix = "orf-client-update-dismissed:";
const updatePromptDismissStoragePrefix = "orf-client-update-prompt-dismissed:";
const updateCheckIntervalMs = 10 * 60 * 1000;

type UpdateNoticeState =
  | { status: "checking" }
  | { status: "error"; message: string }
  | { status: "ready"; decision: ClientUpdateDecision; runtime: ClientUpdateRuntimeInfo };

export function ClientUpdateNotice() {
  const [noticeState, setNoticeState] = useState<UpdateNoticeState>({ status: "checking" });
  const [dismissedVersions, setDismissedVersions] = useState<Set<string>>(() => readDismissedVersions());
  const [promptDismissedVersions, setPromptDismissedVersions] = useState<Set<string>>(() => readPromptDismissedVersions());
  const [openingUrl, setOpeningUrl] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installMessage, setInstallMessage] = useState<string | null>(null);
  const [installProgress, setInstallProgress] = useState<ClientUpdateInstallProgress | null>(null);
  const runCheck = useCallback((signal?: AbortSignal) => {
    void checkForClientUpdate(signal)
      .then(({ decision, runtime }) => setNoticeState({ status: "ready", decision, runtime }))
      .catch((error) => {
        if (!signal?.aborted) {
          setNoticeState({ status: "error", message: error instanceof Error ? error.message : "检查更新失败" });
        }
      });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const check = () => runCheck(controller.signal);

    check();
    const interval = window.setInterval(check, updateCheckIntervalMs);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [runCheck]);

  useEffect(() => {
    const handleClientUpdateCheckRequest = () => runCheck();
    window.addEventListener(clientUpdateCheckRequestEvent, handleClientUpdateCheckRequest);
    return () => window.removeEventListener(clientUpdateCheckRequestEvent, handleClientUpdateCheckRequest);
  }, [runCheck]);

  const availableDecision = useMemo(() => {
    if (noticeState.status !== "ready" || noticeState.decision.status !== "available") return null;
    return { decision: noticeState.decision, runtime: noticeState.runtime };
  }, [noticeState]);

  const availableReleaseVersion = availableDecision?.decision.release.version ?? null;
  const showUpdateNotice = Boolean(
    availableDecision &&
    availableReleaseVersion &&
    !dismissedVersions.has(availableReleaseVersion),
  );
  const showUpdatePrompt = Boolean(
    showUpdateNotice && availableReleaseVersion && !promptDismissedVersions.has(availableReleaseVersion),
  );
  useEffect(() => {
    if (availableDecision && showUpdateNotice) {
      void reportClientUpdateReceipt(availableDecision, "prompted");
    }
  }, [availableDecision, showUpdateNotice]);

  if (!availableDecision || dismissedVersions.has(availableDecision.decision.release.version)) {
    return null;
  }

  const { decision, runtime } = availableDecision;
  const release = decision.release;
  const asset = decision.asset;
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
    setInstallProgress(null);
    await reportClientUpdateReceipt(availableDecision, "install_started");
    try {
      const result = await installClientUpdateAsset(asset, { onProgress: setInstallProgress });
      setInstallMessage(clientUpdateInstallMessage(result, runtime.platform));
      if (shouldOpenDownloadUrlAfterInstallResult(result)) {
        await openUrl(asset.downloadUrl);
      }
    } catch (error) {
      setInstallProgress({
        error: error instanceof Error ? error.message : "更新安装失败",
        stage: "failed",
      });
      setInstallMessage(error instanceof Error ? error.message : "更新安装失败");
    } finally {
      setInstalling(false);
    }
  };

  return (
    <>
      {showUpdatePrompt && (
        <section aria-labelledby="orf-client-update-dialog-title" aria-modal="true" className="orf-client-update-dialog-backdrop" role="dialog">
          <div className="orf-client-update-dialog">
            <header className="orf-client-update-dialog-header">
              <div className="orf-client-update-dialog-icon" aria-hidden="true">
                <RefreshCw className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="orf-client-update-dialog-kicker">发现新版本</p>
                <h2 id="orf-client-update-dialog-title">ORF 客户端 {release.version} 可以更新</h2>
              </div>
              <IconButton
                type="button"
                icon={X}
                label="稍后提醒"
                size="sm"
                onClick={() => {
                  rememberPromptDismissedVersion(release.version);
                  setPromptDismissedVersions(readPromptDismissedVersions());
                }}
              />
            </header>
            <div className="orf-client-update-dialog-body">
              <p className="orf-client-update-dialog-summary">
                {clientUpdatePromptSummary(decision, runtime)}
              </p>
              <p className="orf-client-update-dialog-meta">
                {dateLabel}
                {asset ? ` · ${asset.name}` : " · 打开发布页下载"}
              </p>
              <ClientUpdateInstallProgressView progress={installProgress} />
              {installMessage && <p className="orf-client-update-dialog-message">{installMessage}</p>}
            </div>
            <footer className="orf-client-update-dialog-actions">
              <Button
                type="button"
                size="sm"
                disabled={openingUrl !== null || installing}
                onClick={() => void installUpdate()}
              >
                <Download className="h-3.5 w-3.5" />
                {installing ? "正在更新" : asset ? "立即更新" : "打开发布页"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={openingUrl !== null}
                onClick={() => void openUrl(secondaryUrl)}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                发布说明
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  rememberPromptDismissedVersion(release.version);
                  setPromptDismissedVersions(readPromptDismissedVersions());
                }}
              >
                稍后再说
              </Button>
            </footer>
          </div>
        </section>
      )}
      <section className="orf-client-update-notice" aria-live="polite">
        <div className="orf-client-update-icon" aria-hidden="true">
          <RefreshCw className="h-4 w-4" />
        </div>
        <div className="orf-client-update-copy">
          <div className="orf-client-update-title">发现 ORF 客户端 {release.version}</div>
          <div className="orf-client-update-meta">
            {formatCurrentVersionLabel(decision, runtime)} · {dateLabel}
            {asset ? ` · ${asset.name}` : " · 打开发布页下载"}
          </div>
          <ClientUpdateInstallProgressView progress={installProgress} />
          {installMessage && <div className="orf-client-update-message">{installMessage}</div>}
        </div>
        <div className="orf-client-update-actions">
          <Button
            type="button"
            size="sm"
            disabled={openingUrl !== null || installing}
            onClick={() => void installUpdate()}
          >
            <Download className="h-3.5 w-3.5" />
            {installing ? "正在更新" : asset ? "立即更新" : "打开发布页"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={openingUrl !== null}
            onClick={() => void openUrl(secondaryUrl)}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            发布说明
          </Button>
          <IconButton
            type="button"
            icon={X}
            label="关闭本版本更新提醒"
            size="sm"
            onClick={() => {
              rememberDismissedVersion(release.version);
              setDismissedVersions(readDismissedVersions());
            }}
          />
        </div>
      </section>
    </>
  );
}

function clientUpdatePromptSummary(decision: ClientUpdateDecision, runtime: ClientUpdateRuntimeInfo) {
  const currentVersion = formatCurrentVersionLabel(decision, runtime);
  if (runtime.platform === "desktop-windows") {
    return `${currentVersion}，新版本已经发布。下载完成后会先关闭 ORF，再显示 Windows 安装进度，完成后自动重新打开。`;
  }
  if (runtime.platform === "android") {
    return `${currentVersion}，新版本已经发布。下载完成后将进入 Android 系统安装流程。`;
  }
  return `${currentVersion}，新版本已经发布。建议尽快更新，保持客户端体验最新。`;
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

function readPromptDismissedVersions() {
  if (typeof window === "undefined") return new Set<string>();
  const versions = new Set<string>();
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(updatePromptDismissStoragePrefix)) {
      versions.add(key.slice(updatePromptDismissStoragePrefix.length));
    }
  }
  return versions;
}

function rememberPromptDismissedVersion(version: string) {
  window.localStorage.setItem(`${updatePromptDismissStoragePrefix}${version}`, new Date().toISOString());
}
