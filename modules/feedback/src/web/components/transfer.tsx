import { ChevronDown, FileDown, FileUp, UploadCloud } from "lucide-react";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  commitFeedbackImport,
  preflightFeedbackImport,
  type FeedbackImportPreflight,
  type FeedbackImportReferenceMappings,
  type FeedbackImportReferenceOptions,
} from "../api";
import { downloadTextFile } from "../transfer/download";
import { FeedbackButton } from "./controls";

type FeedbackTransferMenuProps = {
  canImportExport: boolean;
  csvDisabled?: boolean;
  notify: (message: string) => void;
  onExportCurrentViewCsv: () => void | Promise<void>;
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
  const unavailableReason = "当前账号没有导入导出权限";

  return (
    <div className="feedback-transfer-menu">
      <FeedbackButton
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        className="feedback-transfer-trigger"
        data-unavailable={canImportExport ? undefined : "true"}
        onClick={() => setMenuOpen((value) => !value)}
        variant="secondary"
      >
        <UploadCloud aria-hidden="true" />
        <span>导入/导出</span>
        <ChevronDown aria-hidden="true" />
      </FeedbackButton>
      {menuOpen && (
        <div className="feedback-transfer-popover" role="menu">
          {!canImportExport && (
            <p className="feedback-transfer-unavailable" role="note">{unavailableReason}</p>
          )}
          <button
            disabled={!canImportExport || csvDisabled}
            role="menuitem"
            type="button"
            onClick={() => {
              if (!canImportExport) return;
              setMenuOpen(false);
              void onExportCurrentViewCsv();
            }}
          >
            <FileDown aria-hidden="true" />
            <span>导出当前视图 CSV</span>
          </button>
          <button
            disabled={!canImportExport}
            role="menuitem"
            type="button"
            onClick={() => {
              if (!canImportExport) return;
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
  const [referenceMappings, setReferenceMappings] = useState<FeedbackImportReferenceMappings>({});
  const [referenceOptions, setReferenceOptions] = useState<FeedbackImportReferenceOptions>({ assignees: [], projects: [] });
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const canCommit = Boolean(preflight?.commitAvailable);

  const runPreflight = async () => {
    if (!file || loading) return;
    setLoading(true);
    setPreflight(null);
    try {
      const response = await preflightFeedbackImport(file, referenceMappings);
      setPreflight(response.preflight);
      setReferenceOptions(response.referenceOptions);
      if (response.preflight.errors.length > 0) {
        notify("导入预检发现错误");
      } else if (!response.preflight.commitAvailable) {
        notify(response.preflight.commitBlockedReason ?? "导入文件已识别");
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
      downloadTextFile(response.result.report);
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
            <p>上传反馈 CSV，先完成预检，再确认写入。</p>
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
              setReferenceMappings({});
            }}
          />
          <div>
            <strong>{file?.name ?? "选择 CSV 文件"}</strong>
            <span>{file ? `${Math.ceil(file.size / 1024)} KB` : "支持当前视图 CSV"}</span>
          </div>
          <FeedbackButton variant="secondary" onClick={() => inputRef.current?.click()}>
            <FileUp aria-hidden="true" />
            选择文件
          </FeedbackButton>
        </div>

        {preflight && (
          <FeedbackImportPreflightView
            preflight={preflight}
            referenceMappings={referenceMappings}
            referenceOptions={referenceOptions}
            onReferenceMappingsChange={setReferenceMappings}
          />
        )}

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

function FeedbackImportPreflightView({
  onReferenceMappingsChange,
  preflight,
  referenceMappings,
  referenceOptions,
}: {
  onReferenceMappingsChange: (mappings: FeedbackImportReferenceMappings) => void;
  preflight: FeedbackImportPreflight;
  referenceMappings: FeedbackImportReferenceMappings;
  referenceOptions: FeedbackImportReferenceOptions;
}) {
  return (
    <div className="feedback-import-preflight">
      <div className="feedback-import-summary">
        <span><strong>{preflight.sourceKind.toUpperCase()}</strong> 类型</span>
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
      {preflight.referenceIssues && preflight.referenceIssues.length > 0 && (
        <FeedbackImportReferenceMappingsView
          mappings={referenceMappings}
          options={referenceOptions}
          issues={preflight.referenceIssues}
          onChange={onReferenceMappingsChange}
        />
      )}
      {preflight.fieldMappings && preflight.fieldMappings.length > 0 && (
        <FeedbackImportFieldMappings mappings={preflight.fieldMappings} />
      )}
      {preflight.updateDiffs && preflight.updateDiffs.length > 0 && (
        <FeedbackImportUpdateDiffs diffs={preflight.updateDiffs} />
      )}
      {preflight.commitBlockedReason && (
        <div className="feedback-import-messages" data-tone="warning">
          <strong>提交状态</strong>
          <p>{preflight.commitBlockedReason}</p>
        </div>
      )}
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

function FeedbackImportUpdateDiffs({
  diffs,
}: {
  diffs: NonNullable<FeedbackImportPreflight["updateDiffs"]>;
}) {
  return (
    <div className="feedback-import-messages" data-tone="warning">
      <strong>更新差异</strong>
      {diffs.slice(0, 5).map((item) => (
        <p key={`${item.externalId}-${item.feedbackId}`}>
          {item.externalId}: {item.fields.map((field) => field.label).join("、")}
        </p>
      ))}
      {diffs.length > 5 && <p>还有 {diffs.length - 5} 条更新差异，请下载预检报告查看。</p>}
    </div>
  );
}

function FeedbackImportReferenceMappingsView({
  issues,
  mappings,
  onChange,
  options,
}: {
  issues: NonNullable<FeedbackImportPreflight["referenceIssues"]>;
  mappings: FeedbackImportReferenceMappings;
  onChange: (mappings: FeedbackImportReferenceMappings) => void;
  options: FeedbackImportReferenceOptions;
}) {
  const changeMapping = (issue: NonNullable<FeedbackImportPreflight["referenceIssues"]>[number], value: string) => {
    const groupKey = issue.kind === "assignee" ? "assigneeUserIds" : "projectIds";
    const nextGroup = { ...(mappings[groupKey] ?? {}) };
    if (value === "__pending__") {
      delete nextGroup[issue.sourceValue];
    } else {
      nextGroup[issue.sourceValue] = value === "__clear__" ? null : value;
    }
    onChange({ ...mappings, [groupKey]: nextGroup });
  };

  return (
    <div className="feedback-import-reference-mappings">
      <strong>引用映射</strong>
      {issues.map((issue) => {
        const group = issue.kind === "assignee" ? mappings.assigneeUserIds : mappings.projectIds;
        const hasMappedValue = Object.prototype.hasOwnProperty.call(group ?? {}, issue.sourceValue);
        const currentValue = hasMappedValue
          ? group?.[issue.sourceValue] ?? (issue.canClear ? "__clear__" : "__pending__")
          : "__pending__";
        const optionItems = issue.kind === "assignee"
          ? options.assignees.map((item) => ({ id: item.id, name: item.name }))
          : options.projects.map((item) => ({ id: item.id, name: item.name }));
        return (
          <label key={`${issue.kind}:${issue.sourceValue}`}>
            <span>
              <b>{issue.kind === "assignee" ? "处理人" : "项目"}</b>
              <em>{issue.sourceValue} · {referenceIssueLocation(issue)}</em>
            </span>
            <select value={currentValue} onChange={(event) => changeMapping(issue, event.target.value)}>
              <option value="__pending__">{issue.canClear ? "选择映射或置空" : "选择映射"}</option>
              {issue.canClear && <option value="__clear__">置空</option>}
              {optionItems.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </label>
        );
      })}
    </div>
  );
}

function FeedbackImportFieldMappings({
  mappings,
}: {
  mappings: NonNullable<FeedbackImportPreflight["fieldMappings"]>;
}) {
  return (
    <div className="feedback-import-field-mappings">
      <strong>字段映射</strong>
      <div>
        {mappings.map((item) => (
          <span key={item.field} data-missing={item.required && !item.sourceColumn ? "true" : undefined}>
            <b>{item.label}</b>
            <em>{item.sourceColumn ?? "未匹配"}</em>
          </span>
        ))}
      </div>
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
    `提交: ${preflight.commitAvailable ? "可提交" : (preflight.commitBlockedReason ?? "不可提交")}`,
    "",
    "字段映射",
    ...(preflight.fieldMappings ?? []).map((item) => `${item.label}: ${item.sourceColumn ?? "未匹配"}`),
    ...((preflight.fieldMappings?.length ?? 0) === 0 ? ["无"] : []),
    "",
    "引用映射",
    ...(preflight.referenceIssues ?? []).map((item) => `${item.kind === "assignee" ? "处理人" : "项目"} ${item.sourceValue}: ${referenceIssueLocation(item)}`),
    ...((preflight.referenceIssues?.length ?? 0) === 0 ? ["无"] : []),
    "",
    "摘要",
    `总记录: ${preflight.summary.totalRecords}`,
    `可新增: ${preflight.summary.newRecords}`,
    `可更新: ${preflight.summary.updateRecords}`,
    `跳过: ${preflight.summary.skippedRecords}`,
    `错误: ${preflight.summary.errors}`,
    `附件: ${formatBytes(preflight.summary.attachmentBytes)}`,
    "",
    "更新差异",
    ...buildFeedbackImportUpdateDiffReport(preflight.updateDiffs ?? []),
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

function buildFeedbackImportUpdateDiffReport(diffs: NonNullable<FeedbackImportPreflight["updateDiffs"]>) {
  if (diffs.length === 0) return ["无"];
  const lines: string[] = [];
  for (const diff of diffs) {
    lines.push(`来源 ${diff.externalId} -> 反馈 ${diff.feedbackId}${diff.row ? `（第 ${diff.row} 行）` : ""}`);
    for (const field of diff.fields) {
      lines.push(`- ${field.label}: 当前「${field.currentValue || "空"}」 -> 导入「${field.incomingValue || "空"}」`);
    }
  }
  return lines;
}

function referenceIssueLocation(item: NonNullable<FeedbackImportPreflight["referenceIssues"]>[number]) {
  return item.rows.length > 0 ? `第 ${item.rows.join("、")} 行` : "CSV 文件";
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
