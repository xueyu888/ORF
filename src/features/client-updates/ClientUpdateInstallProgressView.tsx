import {
  clientUpdateInstallProgressBytes,
  clientUpdateInstallProgressMessage,
  clientUpdateInstallProgressPercent,
} from "./clientUpdateController";
import type { ClientUpdateInstallProgress } from "./clientUpdateRuntime";

export function ClientUpdateInstallProgressView({ progress }: { progress: ClientUpdateInstallProgress | null }) {
  if (!progress) return null;

  const percent = clientUpdateInstallProgressPercent(progress);
  const percentLabel = percent === null ? "处理中" : `${Math.round(percent)}%`;
  const byteLabel = clientUpdateInstallProgressBytes(progress);
  const isIndeterminate = percent === null && progress.stage === "downloading";

  return (
    <div className="orf-client-update-progress" data-stage={progress.stage}>
      <div className="orf-client-update-progress-header">
        <span>{clientUpdateInstallProgressMessage(progress)}</span>
        <strong>{percentLabel}</strong>
      </div>
      <div
        aria-label="更新下载进度"
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={percent === null ? undefined : Math.round(percent)}
        className="orf-client-update-progress-track"
        data-indeterminate={isIndeterminate ? "true" : "false"}
        role="progressbar"
      >
        <span style={percent === null ? undefined : { width: `${percent}%` }} />
      </div>
      {byteLabel && <div className="orf-client-update-progress-bytes">{byteLabel}</div>}
    </div>
  );
}
