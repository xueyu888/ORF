import { ChevronDown, DatabaseBackup, FileDown, FileUp, UploadCloud } from "lucide-react";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { commitFeedbackImport, preflightFeedbackImport, type FeedbackImportPreflight } from "../api";
import { downloadTextFile } from "../transfer/download";
import { FeedbackButton } from "./controls";

type FeedbackTransferMenuProps = {
  canImportExport: boolean;
  csvDisabled?: boolean;
  notify: (message: string) => void;
  onExportCurrentViewCsv: () => void;
  onImportCommitted: () => void | Promise<void>;
};

export function FeedbackTransferMenu({
  canImportExport,
  csvDisabled = false,
  notify,
  onExportCurrentViewCsv,
  onImportCommitted,
}: FeedbackTransferMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  if (!canImportExport) return null;

  return (
    <div className="feedback-transfer-menu">
      <FeedbackButton
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        className="feedback-transfer-trigger"
        onClick={() => setMenuOpen((value) => !value)}
        variant="secondary"
      >
        <UploadCloud aria-hidden="true" />
        <span>导入/导出</span>
        <ChevronDown aria-hidden="true" />
      </FeedbackButton>
      {menuOpen && (
        <div className="feedback-transfer-popover" role="menu">
          <button
            disabled={csvDisabled}
            role="menuitem"
            type="button"
            onClick={() => {
              setMenuOpen(false);
              onExportCurrentViewCsv();
            }}
          >
            <FileDown aria-hidden="true" />
            <span>导出当前视图 CSV</span>
          </button>
          <a
            href="/api/feedback/exports/backup.zip"
            role="menuitem"
            onClick={() => setMenuOpen(false)}
          >
            <DatabaseBackup aria-hidden="true" />
            <span>导出完整备份 ZIP</span>
          </a>
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              setMenuOpen(false);
              setImportOpen(true);
            }}
          >
            <FileUp aria-hidden="true" />
            <span>导入反馈</span>
          </button>
        </div>
      )}
      {importOpen && (
        <FeedbackImportDialog
          notify={notify}
          onClose={() => setImportOpen(false)}
          onCommitted={onImportCommitted}
        />
      )}
    </div>
  );
}

function FeedbackImportDialog({
  notify,
  onClose,
  onCommitted,
}: {
  notify: (message: string) => void;
  onClose: () => void;
  onCommitted: () => void | Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preflight, setPreflight] = useState<FeedbackImportPreflight | null>(null);
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const canCommit = Boolean(preflight && preflight.errors.length === 0 && preflight.summary.newRecords > 0);

  const runPreflight = async () => {
    if (!file || loading) return;
    setLoading(true);
    setPreflight(null);
    try {
      const response = await preflightFeedbackImport(file);
      setPreflight(response.preflight);
      if (response.preflight.errors.length > 0) {
        notify("导入预检发现错误");
      } else {
        notify(`导入预检通过：${response.preflight.summary.newRecords} 条新反馈`);
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : "导入预检失败");
    } finally {
      setLoading(false);
    }
  };

  const commit = async () => {
    if (!preflight || !canCommit || committing) return;
    setCommitting(true);
    try {
      const response = await commitFeedbackImport(preflight.batchId);
      notify(`导入完成：${response.result.createdFeedbackIds.length} 条新反馈`);
      await onCommitted();
      onClose();
    } catch (error) {
      notify(error instanceof Error ? error.message : "导入提交失败");
    } finally {
      setCommitting(false);
    }
  };

  const dialog = (
    <div className="feedback-transfer-dialog-backdrop" role="presentation">
      <section className="feedback-transfer-dialog" role="dialog" aria-modal="true" aria-labelledby="feedback-import-title">
        <header>
          <div>
            <h2 id="feedback-import-title">导入反馈</h2>
            <p>上传反馈 CSV，先预检字段、项目和处理人，再确认写入。</p>
          </div>
          <FeedbackButton variant="ghost" onClick={onClose}>关闭</FeedbackButton>
        </header>

        <div className="feedback-import-dropzone">
          <input
            ref={inputRef}
            accept=".csv,text/csv"
            type="file"
            onChange={(event) => {
              const selected = event.target.files?.[0] ?? null;
              setFile(selected);
              setPreflight(null);
            }}
          />
          <div>
            <strong>{file?.name ?? "选择 CSV 文件"}</strong>
            <span>{file ? `${Math.ceil(file.size / 1024)} KB` : "支持当前视图 CSV 导入"}</span>
          </div>
          <FeedbackButton variant="secondary" onClick={() => inputRef.current?.click()}>
            <FileUp aria-hidden="true" />
            选择文件
          </FeedbackButton>
        </div>

        {preflight && <FeedbackImportPreflightView preflight={preflight} />}

        <footer>
          <FeedbackButton variant="secondary" onClick={runPreflight} disabled={!file || loading} loading={loading}>
            预检
          </FeedbackButton>
          <FeedbackButton onClick={commit} disabled={!canCommit || committing} loading={committing}>
            确认导入
          </FeedbackButton>
        </footer>
      </section>
    </div>
  );

  const portalTarget = feedbackDialogPortalTarget();
  return portalTarget ? createPortal(dialog, portalTarget) : dialog;
}

function feedbackDialogPortalTarget() {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLElement>(".orf-app-shell") ?? document.body;
}

function FeedbackImportPreflightView({ preflight }: { preflight: FeedbackImportPreflight }) {
  return (
    <div className="feedback-import-preflight">
      <div className="feedback-import-summary">
        <span><strong>{preflight.summary.totalRecords}</strong> 总记录</span>
        <span><strong>{preflight.summary.newRecords}</strong> 可新增</span>
        <span><strong>{preflight.summary.updateRecords}</strong> 可更新</span>
        <span><strong>{preflight.summary.skippedRecords}</strong> 跳过</span>
        <span><strong>{preflight.summary.errors}</strong> 错误</span>
        <span><strong>{formatBytes(preflight.summary.attachmentBytes)}</strong> 附件</span>
      </div>
      <div className="feedback-import-preflight-actions">
        <FeedbackButton
          size="sm"
          variant="secondary"
          onClick={() => downloadFeedbackImportPreflightReport(preflight)}
        >
          下载预检报告
        </FeedbackButton>
      </div>
      {preflight.warnings.length > 0 && (
        <div className="feedback-import-messages" data-tone="warning">
          <strong>警告</strong>
          {preflight.warnings.slice(0, 6).map((item, index) => (
            <p key={`${item.row ?? "file"}-${index}`}>{messageLine(item)}</p>
          ))}
        </div>
      )}
      {preflight.errors.length > 0 && (
        <div className="feedback-import-messages" data-tone="danger">
          <strong>错误</strong>
          {preflight.errors.slice(0, 8).map((item, index) => (
            <p key={`${item.row ?? "file"}-${index}`}>{messageLine(item)}</p>
          ))}
        </div>
      )}
    </div>
  );
}

function downloadFeedbackImportPreflightReport(preflight: FeedbackImportPreflight) {
  downloadTextFile({
    content: buildFeedbackImportPreflightReport(preflight),
    fileName: `orf-feedback-import-preflight-${preflight.batchId}.txt`,
    mimeType: "text/plain;charset=utf-8",
  });
}

function buildFeedbackImportPreflightReport(preflight: FeedbackImportPreflight) {
  const lines = [
    "反馈导入预检报告",
    `文件: ${preflight.fileName}`,
    `批次: ${preflight.batchId}`,
    `类型: ${preflight.sourceKind.toUpperCase()}`,
    "",
    "摘要",
    `总记录: ${preflight.summary.totalRecords}`,
    `可新增: ${preflight.summary.newRecords}`,
    `可更新: ${preflight.summary.updateRecords}`,
    `跳过: ${preflight.summary.skippedRecords}`,
    `错误: ${preflight.summary.errors}`,
    `附件: ${formatBytes(preflight.summary.attachmentBytes)}`,
    "",
    "警告",
    ...preflight.warnings.map(messageLine),
    ...(preflight.warnings.length === 0 ? ["无"] : []),
    "",
    "错误",
    ...preflight.errors.map(messageLine),
    ...(preflight.errors.length === 0 ? ["无"] : []),
  ];
  return `${lines.join("\n")}\n`;
}

function messageLine(item: { field?: string; message: string; row?: number }) {
  const row = item.row ? `第 ${item.row} 行` : "文件";
  const field = item.field ? ` · ${item.field}` : "";
  return `${row}${field}: ${item.message}`;
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB"];
  let size = value / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}
