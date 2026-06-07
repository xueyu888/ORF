import { Download, ExternalLink, RefreshCw, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { orfClientCurrentVersion } from "./clientUpdateConfig";
import { getLatestClientRelease } from "./clientUpdateApi";
import { buildClientUpdateDecision, type ClientUpdateDecision } from "./clientUpdateModel";
import { detectClientUpdatePlatform, openClientUpdateUrl } from "./clientUpdateRuntime";

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
  const downloadUrl = asset?.downloadUrl ?? release.htmlUrl;
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
      </div>
      <div className="orf-client-update-actions">
        <button
          type="button"
          className="orf-client-update-primary"
          disabled={openingUrl !== null}
          onClick={() => void openUrl(downloadUrl)}
        >
          <Download className="h-3.5 w-3.5" />
          下载安装包
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
