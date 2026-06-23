import { clsx } from "clsx";
import { MessageSquare, Pencil, Save, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { FantasySelectMenu, type FantasySelectOption } from "../../../components/FantasySelectMenu";
import { Button, IconButton } from "../../../components/ui";
import {
  normalizeResultDetails,
  normalizeResultDetailsInput,
  resultDetailText,
  resultDetailsEqual,
  type ResultDetailsInput,
} from "../../../domain/orfResultDetails";
import { uncertaintyLevelOptions } from "../../../domain/orfSettlement";
import type { Result, UncertaintyLevel } from "../../../types/orf";
import { metricEditUnavailableMessage, type MetricEditAccess } from "../model/orfFlowCapabilities";

type MetricInspectorPanelProps = {
  access: MetricEditAccess;
  objectiveTitle: string;
  onClose: () => void;
  onComment: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onDiscardPendingSelection: () => void;
  onSaveDetails: (details: ResultDetailsInput) => Promise<boolean>;
  onSaveDifficulty: (uncertaintyLevel: UncertaintyLevel) => Promise<boolean>;
  onSavePendingSelection: () => void;
  onCancelPendingSelection: () => void;
  pendingSelectionTitle: string | null;
  result: Result;
};

export function MetricInspectorPanel({
  access,
  objectiveTitle,
  onClose,
  onComment,
  onDirtyChange,
  onDiscardPendingSelection,
  onSaveDetails,
  onSaveDifficulty,
  onSavePendingSelection,
  onCancelPendingSelection,
  pendingSelectionTitle,
  result,
}: MetricInspectorPanelProps) {
  const persistedDetails = useMemo(
    () => normalizeResultDetails(result),
    [result.id, result.detail],
  );
  const detailText = resultDetailText(result);
  const [draft, setDraft] = useState<ResultDetailsInput>(persistedDetails);
  const [editing, setEditing] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);
  const [savingDifficulty, setSavingDifficulty] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [difficultyError, setDifficultyError] = useState<string | null>(null);
  const [difficultyValue, setDifficultyValue] = useState<UncertaintyLevel | "">(result.uncertaintyLevel ?? "");
  const canEdit = access.status === "allowed";
  const normalizedDraft = useMemo(() => normalizeResultDetailsInput(draft), [draft]);
  const detailsDirty = editing && !resultDetailsEqual(normalizedDraft, persistedDetails);
  const difficultyOptions: Array<FantasySelectOption<UncertaintyLevel | "">> = [
    { label: "待校准", value: "", disabled: true },
    ...uncertaintyLevelOptions.map((level) => ({ label: level, value: level })),
  ];

  useEffect(() => {
    setDraft(persistedDetails);
    setEditing(false);
    setSavingDetails(false);
    setDetailsError(null);
    setDifficultyError(null);
  }, [result.id]);

  useEffect(() => {
    if (!editing) setDraft(persistedDetails);
  }, [editing, persistedDetails]);

  useEffect(() => {
    setDifficultyValue(result.uncertaintyLevel ?? "");
    setSavingDifficulty(false);
  }, [result.id, result.uncertaintyLevel]);

  useEffect(() => {
    onDirtyChange(detailsDirty);
  }, [detailsDirty, onDirtyChange]);

  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const beginEdit = () => {
    if (!canEdit || savingDetails) return;
    setDraft(persistedDetails);
    setDetailsError(null);
    setEditing(true);
  };

  const cancelEdit = () => {
    if (savingDetails) return;
    setDraft(persistedDetails);
    setDetailsError(null);
    setEditing(false);
  };

  const saveDetails = async () => {
    if (!canEdit || savingDetails) return false;
    const nextDetails = normalizeResultDetailsInput(draft);
    if (resultDetailsEqual(nextDetails, persistedDetails)) {
      setDetailsError(null);
      setEditing(false);
      return true;
    }

    setSavingDetails(true);
    setDetailsError(null);
    try {
      const saved = await onSaveDetails(nextDetails);
      if (saved) {
        setEditing(false);
        return true;
      }
      setDetailsError("保存失败，请稍后重试");
      return false;
    } finally {
      setSavingDetails(false);
    }
  };

  const saveDifficulty = async (nextValue: UncertaintyLevel | "") => {
    if (!nextValue || !canEdit || savingDifficulty) return;
    setDifficultyValue(nextValue);
    setDifficultyError(null);
    if (nextValue === result.uncertaintyLevel) return;

    setSavingDifficulty(true);
    try {
      const saved = await onSaveDifficulty(nextValue);
      if (!saved) {
        setDifficultyValue(result.uncertaintyLevel ?? "");
        setDifficultyError("难度保存失败，请稍后重试");
      }
    } finally {
      setSavingDifficulty(false);
    }
  };

  const saveAndSwitchPendingMetric = async () => {
    const saved = await saveDetails();
    if (saved) onSavePendingSelection();
  };

  return (
    <aside className="orf-metric-inspector-panel" data-no-row-edit="true">
      <header className="orf-metric-inspector-header">
        <div className="min-w-0">
          <div className="orf-metric-inspector-kicker">指标详情</div>
          <h2 className="orf-metric-inspector-title" title={result.title}>{result.title}</h2>
          <div className="orf-metric-inspector-objective" title={objectiveTitle}>{objectiveTitle}</div>
        </div>
        <IconButton
          icon={X}
          label="收起指标详情"
          onClick={onClose}
          size="sm"
          type="button"
          variant="ghost"
        />
      </header>

      {pendingSelectionTitle && detailsDirty ? (
        <div className="orf-metric-inspector-pending">
          <div className="orf-metric-inspector-pending-title">当前详情未保存</div>
          <p>切换到「{pendingSelectionTitle}」前，请保存或放弃当前修改。</p>
          <div className="orf-metric-inspector-actions">
            <Button loading={savingDetails} onClick={() => void saveAndSwitchPendingMetric()} size="sm" type="button" variant="primary">
              <Save className="h-3.5 w-3.5" />
              保存并切换
            </Button>
            <Button disabled={savingDetails} onClick={onDiscardPendingSelection} size="sm" type="button" variant="secondary">
              放弃修改
            </Button>
            <Button disabled={savingDetails} onClick={onCancelPendingSelection} size="sm" type="button" variant="ghost">
              继续编辑
            </Button>
          </div>
        </div>
      ) : null}

      <section className="orf-metric-inspector-section">
        <div className="orf-metric-inspector-section-head">
          <div>
            <div className="orf-metric-inspector-label">难度等级</div>
            {difficultyError ? <div className="orf-metric-inspector-error">{difficultyError}</div> : null}
          </div>
        </div>
        {canEdit ? (
          <FantasySelectMenu
            ariaLabel={`编辑指标难度，当前 ${difficultyValue || "待校准"}`}
            className="orf-metric-inspector-difficulty-select"
            disabled={savingDifficulty}
            onChange={(nextValue) => void saveDifficulty(nextValue)}
            options={difficultyOptions}
            stopPropagation
            title="编辑指标难度"
            value={difficultyValue}
            variant="chip"
          />
        ) : (
          <div className="orf-metric-inspector-blocked">{metricEditUnavailableMessage(access)}</div>
        )}
      </section>

      <section className="orf-metric-inspector-section orf-metric-inspector-detail-section">
        <div className="orf-metric-inspector-section-head">
          <div>
            <div className="orf-metric-inspector-label">指标说明</div>
            {detailsError ? <div className="orf-metric-inspector-error">{detailsError}</div> : null}
          </div>
          {canEdit && !editing ? (
            <Button onClick={beginEdit} size="sm" type="button" variant="secondary">
              <Pencil className="h-3.5 w-3.5" />
              编辑
            </Button>
          ) : null}
        </div>

        {editing ? (
          <form
            className="orf-metric-inspector-editor"
            onSubmit={(event) => {
              event.preventDefault();
              void saveDetails();
            }}
          >
            <textarea
              aria-label="编辑指标详情"
              className="orf-metric-inspector-textarea"
              disabled={savingDetails}
              onChange={(event) => setDraft({ detail: event.target.value })}
              rows={8}
              value={draft.detail}
            />
            <div className="orf-metric-inspector-actions">
              <Button loading={savingDetails} size="sm" type="submit" variant="primary">
                <Save className="h-3.5 w-3.5" />
                保存
              </Button>
              <Button disabled={savingDetails} onClick={cancelEdit} size="sm" type="button" variant="secondary">
                取消
              </Button>
            </div>
          </form>
        ) : (
          <div className={clsx("orf-metric-inspector-detail", !detailText && "orf-metric-inspector-detail-empty")}>
            {detailText || "未填写指标说明。"}
          </div>
        )}
      </section>

      <footer className="orf-metric-inspector-footer">
        <Button onClick={onComment} size="sm" type="button" variant="ghost">
          <MessageSquare className="h-3.5 w-3.5" />
          评论
        </Button>
      </footer>
    </aside>
  );
}
