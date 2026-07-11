import { Download, ExternalLink, Info, RefreshCw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, IconButton } from "../../components/ui";
import {
  checkForClientUpdate,
  clientUpdateInstallMessage,
  clientUpdatePlatformLabel,
  formatClientUpdateBytes,
  formatUpdateDate,
  shouldOpenDownloadUrlAfterInstallResult,
  type ClientUpdateCheckResult,
} from "./clientUpdateController";
import { ClientUpdateInstallProgressView } from "./ClientUpdateInstallProgressView";
import { installClientUpdateAsset, openClientUpdateUrl, type ClientUpdateInstallProgress } from "./clientUpdateRuntime";

type ClientUpdateCenterState =
  | { status: "checking" }
  | { message: string; status: "error" }
  | { result: ClientUpdateCheckResult; status: "ready" };

export function ClientUpdateCenterDialog({ notice, onClose, open }: { notice?: string; onClose: () => void; open: boolean }) {
  const [centerState, setCenterState] = useState<ClientUpdateCenterState>({ status: "checking" });
  const [installing, setInstalling] = useState(false);
  const [installMessage, setInstallMessage] = useState<string | null>(null);
  const [installProgress, setInstallProgress] = useState<ClientUpdateInstallProgress | null>(null);
  const [openingUrl, setOpeningUrl] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const controller = new AbortController();
    void runCheck(controller.signal);
    return () => controller.abort();
  }, [open]);

  if (!open) return null;

  const runCheck = async (signal?: AbortSignal) => {
    setCenterState({ status: "checking" });
    setInstallMessage(null);
    setInstallProgress(null);
    try {
      const result = await checkForClientUpdate(signal);
      if (!signal?.aborted) {
        setCenterState({ status: "ready", result });
      }
    } catch (error) {
      if (!signal?.aborted) {
        setCenterState({ status: "error", message: error instanceof Error ? error.message : "检查更新失败" });
      }
    }
  };

  const openReleasePage = async (url: string) => {
    setOpeningUrl(true);
    try {
      await openClientUpdateUrl(url);
    } finally {
      setOpeningUrl(false);
    }
  };

  const installUpdate = async (result: ClientUpdateCheckResult) => {
    if (result.decision.status !== "available" || !result.decision.asset) {
      await openReleasePage(result.decision.release.htmlUrl);
      return;
    }
    setInstalling(true);
    setInstallMessage(null);
    setInstallProgress(null);
    try {
      const installResult = await installClientUpdateAsset(result.decision.asset, { onProgress: setInstallProgress });
      setInstallMessage(clientUpdateInstallMessage(installResult, result.runtime.platform));
      if (shouldOpenDownloadUrlAfterInstallResult(installResult)) {
        await openReleasePage(result.decision.asset.downloadUrl);
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

  const readyResult = centerState.status === "ready" ? centerState.result : null;
  const decision = readyResult?.decision ?? null;
  const runtime = readyResult?.runtime ?? null;
  const release = decision?.release ?? null;
  const releaseDate = release?.publishedAt ? formatUpdateDate(release.publishedAt) : release?.tagName ?? "-";
  const asset = decision?.status === "available" ? decision.asset : null;
  const canInstall = decision?.status === "available";

  return (
    <div className="orf-client-update-center-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby="orf-client-update-center-title"
        aria-modal="true"
        className="orf-client-update-center"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="orf-client-update-center-header">
          <div className="orf-client-update-center-icon" aria-hidden="true">
            <Info className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="orf-client-update-center-kicker">关于 ORF</p>
            <h2 id="orf-client-update-center-title">版本与更新</h2>
          </div>
          <IconButton icon={X} label="关闭版本与更新" size="sm" type="button" onClick={onClose} />
        </header>

        <div className="orf-client-update-center-body">
          {notice && <p className="orf-client-update-center-message" data-tone="warning">{notice}</p>}
          {centerState.status === "checking" && (
            <div className="orf-client-update-center-status">
              <RefreshCw className="h-4 w-4 animate-spin" />
              正在检查最新版本
            </div>
          )}
          {centerState.status === "error" && <div className="orf-client-update-center-status" data-tone="danger">{centerState.message}</div>}
          {readyResult && decision && runtime && release && (
            <>
              <div className="orf-client-update-center-summary" data-status={decision.status}>
                <strong>{clientUpdateDecisionTitle(decision.status, release.version)}</strong>
                <span>{clientUpdateDecisionDescription(decision.status, runtime.platform)}</span>
              </div>
              <dl className="orf-client-update-center-facts">
                <div>
                  <dt>当前版本</dt>
                  <dd>{runtime.versionSource === "unknown" ? "未知" : runtime.currentVersion}</dd>
                </div>
                <div>
                  <dt>客户端</dt>
                  <dd>{clientUpdatePlatformLabel(runtime.platform)}</dd>
                </div>
                <div>
                  <dt>最新版本</dt>
                  <dd>{release.version}</dd>
                </div>
                <div>
                  <dt>发布时间</dt>
                  <dd>{releaseDate}</dd>
                </div>
                <div>
                  <dt>服务地址</dt>
                  <dd>{window.location.origin}</dd>
                </div>
                <div>
                  <dt>安装包</dt>
                  <dd>{asset ? `${asset.name}${asset.size ? ` · ${formatClientUpdateBytes(asset.size)}` : ""}` : compatibleAssetText(decision.status)}</dd>
                </div>
              </dl>
              <ClientUpdateInstallProgressView progress={installProgress} />
              {installMessage && <p className="orf-client-update-center-message">{installMessage}</p>}
            </>
          )}
        </div>

        <footer className="orf-client-update-center-actions">
          <Button size="sm" variant="secondary" type="button" disabled={centerState.status === "checking"} onClick={() => void runCheck()}>
            <RefreshCw className="h-3.5 w-3.5" />
            检查更新
          </Button>
          {release && (
            <Button size="sm" variant="secondary" type="button" disabled={openingUrl} onClick={() => void openReleasePage(release.htmlUrl)}>
              <ExternalLink className="h-3.5 w-3.5" />
              发布说明
            </Button>
          )}
          {decision && (
            <Button
              size="sm"
              type="button"
              disabled={!canInstall || installing || openingUrl}
              onClick={() => readyResult && void installUpdate(readyResult)}
            >
              <Download className="h-3.5 w-3.5" />
              {installing ? "正在更新" : canInstall ? "立即更新" : "无需安装"}
            </Button>
          )}
        </footer>
      </section>
    </div>
  );
}

function clientUpdateDecisionTitle(status: ClientUpdateCheckResult["decision"]["status"], version: string) {
  if (status === "available") return `发现 ORF 客户端 ${version}`;
  if (status === "not_newer") return "当前已经是最新版本";
  if (status === "no_compatible_asset") return "新版本缺少当前平台安装包";
  return "当前环境不需要客户端安装包";
}

function clientUpdateDecisionDescription(status: ClientUpdateCheckResult["decision"]["status"], platform: ClientUpdateCheckResult["runtime"]["platform"]) {
  if (status === "available" && platform === "desktop-windows") return "点击后将自动完成安装并重新打开 ORF。";
  if (status === "available" && platform === "android") return "点击后下载更新，并进入 Android 系统安装流程。";
  if (status === "available") return "可以在应用内下载并启动安装。";
  if (status === "not_newer") return "后续也可以从这里手动检查新版本。";
  if (status === "no_compatible_asset") return "可以查看发布说明，等待对应平台安装包。";
  return "Web 端会随服务更新，桌面非 Windows 环境暂不提供安装器。";
}

function compatibleAssetText(status: ClientUpdateCheckResult["decision"]["status"]) {
  if (status === "unsupported_platform") return "当前平台无需安装包";
  if (status === "no_compatible_asset") return "没有匹配安装包";
  return "无";
}
