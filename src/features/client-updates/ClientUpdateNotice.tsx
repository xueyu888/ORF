import { Download, ExternalLink, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ClientUpdateDecision } from "./clientUpdateModel";
import {
  checkForClientUpdate,
  clientUpdateInstallMessage,
  formatCurrentVersionLabel,
  formatUpdateDate,
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

  if (!availableDecision || dismissedVersions.has(availableDecision.decision.release.version)) {
    return null;
  }

  const { decision, runtime } = availableDecision;
  const release = decision.release;
  const asset = decision.asset;
  const secondaryUrl = release.htmlUrl;
  const dateLabel = release.publishedAt ? formatUpdateDate(release.publishedAt) : release.tagName;
  const showUpdatePrompt = !promptDismissedVersions.has(release.version);

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
    try {
      const result = await installClientUpdateAsset(asset, { onProgress: setInstallProgress });
      setInstallMessage(clientUpdateInstallMessage(result));
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
              <button
                className="orf-client-update-dialog-close"
                type="button"
                aria-label="稍后提醒"
                onClick={() => {
                  rememberPromptDismissedVersion(release.version);
                  setPromptDismissedVersions(readPromptDismissedVersions());
                }}
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="orf-client-update-dialog-body">
              <p className="orf-client-update-dialog-summary">
                当前正在使用 {formatCurrentVersionLabel(decision, runtime)}，新版本已经发布。建议尽快覆盖安装，保持聊天通知、自动更新和客户端体验最新。
              </p>
              <p className="orf-client-update-dialog-meta">
                {dateLabel}
                {asset ? ` · ${asset.name}` : " · 打开发布页下载"}
              </p>
              <ClientUpdateInstallProgressView progress={installProgress} />
              {installMessage && <p className="orf-client-update-dialog-message">{installMessage}</p>}
            </div>
            <footer className="orf-client-update-dialog-actions">
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
                className="orf-client-update-later"
                onClick={() => {
                  rememberPromptDismissedVersion(release.version);
                  setPromptDismissedVersions(readPromptDismissedVersions());
                }}
              >
                稍后再说
              </button>
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
            aria-label="关闭本版本更新提醒"
            title="关闭本版本更新提醒"
            onClick={() => {
              rememberDismissedVersion(release.version);
              setDismissedVersions(readDismissedVersions());
            }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </section>
    </>
  );
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
