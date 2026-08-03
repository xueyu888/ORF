import { ShieldAlert, X } from "lucide-react";
import { type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { IconButton } from "../../../components/ui";
import { canApplyForObjectiveChallenge } from "../../../domain/orfLifecycle";
import { resultDetailText } from "../../../domain/orfResultDetails";
import { useDraggableFloating } from "../../../hooks/useDraggableFloating";
import type { Result } from "../../../types/orf";
import { remainingTime } from "../../challenge/model/challengeDates";
import { BountyBadge } from "../BountyHallSkin";
import { bountyPointsLabel, currentUserApplication, publishedDateLabel, resultCountLabel } from "../model/bountyHallItems";
import type { BountyItem, ChallengeAction } from "../model/bountyHallTypes";
import { BountyRowActions } from "./BountyRowActions";
import { ParticipationPreview } from "./ParticipationPreview";

const EMPTY_OBJECTIVE_DESCRIPTION_LABEL = "待补充";

export function BountyObjectiveList({
  activeObjectiveId,
  currentUserId,
  items,
  now,
  onOpenChallengeWork,
  onOpenObjective,
  processingBountyId,
  showDeclinedApplicationState = false,
  onAction,
}: {
  activeObjectiveId: string | null;
  currentUserId: string;
  items: BountyItem[];
  now: Date;
  onOpenChallengeWork: (objectiveId: string) => void;
  onOpenObjective?: (objectiveId: string) => void;
  processingBountyId: string | null;
  showDeclinedApplicationState?: boolean;
  onAction: (item: BountyItem, action: ChallengeAction) => void;
}) {
  const [metricDetailTarget, setMetricDetailTarget] = useState<{ objectiveId: string; resultId: string } | null>(null);
  const selectedMetricDetail = useMemo(() => {
    if (!metricDetailTarget) return null;
    const item = items.find((candidate) => candidate.objective.id === metricDetailTarget.objectiveId);
    const result = item?.results.find((candidate) => candidate.id === metricDetailTarget.resultId);
    return item && result ? { item, result } : null;
  }, [items, metricDetailTarget]);

  useEffect(() => {
    if (metricDetailTarget && !selectedMetricDetail) setMetricDetailTarget(null);
  }, [metricDetailTarget, selectedMetricDetail]);

  return (
    <>
      <div className="bounty-list-table" role="table" aria-label="悬赏目标">
        <div className="bounty-list-head" role="row">
          <span>奖励</span>
          <span>悬赏目标</span>
          <span>参与状态</span>
          <span>指标</span>
          <span>发布时间</span>
          <span>剩余时间</span>
          <span>操作</span>
        </div>
        {items.map((item) => (
          <BountyListRow
            key={item.objective.id}
            active={item.objective.id === activeObjectiveId}
            currentUserId={currentUserId}
            item={item}
            now={now}
            onOpenChallengeWork={onOpenChallengeWork}
            onOpenMetricDetail={(result) => setMetricDetailTarget({ objectiveId: item.objective.id, resultId: result.id })}
            onOpenObjective={onOpenObjective}
            processing={processingBountyId === item.objective.id}
            showDeclinedApplicationState={showDeclinedApplicationState}
            onAction={(action) => onAction(item, action)}
          />
        ))}
      </div>
      {selectedMetricDetail ? (
        <BountyMetricDetailPanel
          item={selectedMetricDetail.item}
          result={selectedMetricDetail.result}
          onClose={() => setMetricDetailTarget(null)}
        />
      ) : null}
    </>
  );
}

function BountyListRow({
  item,
  currentUserId,
  now,
  onOpenChallengeWork,
  onOpenMetricDetail,
  onOpenObjective,
  processing,
  showDeclinedApplicationState,
  onAction,
  active,
}: {
  active: boolean;
  currentUserId: string;
  item: BountyItem;
  now: Date;
  onOpenChallengeWork: (objectiveId: string) => void;
  onOpenMetricDetail: (result: Result) => void;
  onOpenObjective?: (objectiveId: string) => void;
  processing: boolean;
  showDeclinedApplicationState: boolean;
  onAction: (action: ChallengeAction) => void;
}) {
  const currentApplication = currentUserApplication(item, currentUserId, { includeDeclined: showDeclinedApplicationState });
  const canApply = item.isRecruitment || canApplyForObjectiveChallenge(item.objective);
  const openable = Boolean(onOpenObjective);
  const visibleObjectiveDescription = objectiveDescriptionText(item.objective.description);
  const showObjectiveDefiner = item.source === "memberProposed" && Boolean(item.definer);
  const hasRevealedObjectiveInfo = Boolean(visibleObjectiveDescription || showObjectiveDefiner);
  const rowAriaLabel = [
    item.objective.title,
    openable ? "双击打开挑战页目标" : null,
    hasRevealedObjectiveInfo ? "单击、移入或聚焦后显示补充信息" : null,
  ]
    .filter(Boolean)
    .join("，");
  const openObjective = () => onOpenObjective?.(item.objective.id);
  const openChallengeWork = () => onOpenChallengeWork(item.objective.id);
  const handleRowClick = (event: ReactMouseEvent<HTMLElement>) => {
    event.currentTarget.focus();
  };
  const handleRowDoubleClick = () => {
    if (!openable) return;
    openObjective();
  };
  const handleRowKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (!openable || (event.key !== "Enter" && event.key !== " ")) return;

    event.preventDefault();
    openObjective();
  };

  return (
    <article
      className={`bounty-list-row${item.isRecruitment ? " bounty-list-row-priority" : ""}`}
      data-bounty-objective-id={item.objective.id}
      data-linked-target={active ? "true" : undefined}
      data-open-target={openable ? "true" : undefined}
      tabIndex={0}
      aria-label={rowAriaLabel}
      onClick={handleRowClick}
      onDoubleClick={handleRowDoubleClick}
      onKeyDown={handleRowKeyDown}
    >
      <div className="bounty-row-reward" data-label="奖励">
        {item.isRecruitment && (
          <Chip tone="warning">
            <ShieldAlert className="h-3.5 w-3.5" />
            征召令
          </Chip>
        )}
        <Chip tone="gold">{bountyPointsLabel(item)}</Chip>
      </div>
      <div className="bounty-row-main" data-label="悬赏目标">
        <div className="bounty-row-title">
          <h3>{item.objective.title}</h3>
          {hasRevealedObjectiveInfo ? (
            <div className="bounty-row-revealed">
              {visibleObjectiveDescription ? <p>{visibleObjectiveDescription}</p> : null}
              {showObjectiveDefiner ? <span className="bounty-row-definer">提出人：{item.definer}</span> : null}
            </div>
          ) : null}
        </div>
      </div>
      <div className="bounty-row-participants" data-label="参与状态">
        <ParticipationPreview currentUserId={currentUserId} item={item} />
      </div>
      <div className="bounty-row-results" data-label="指标">
        <ResultPreview item={item} onOpenMetricDetail={onOpenMetricDetail} />
      </div>
      <div className="bounty-row-published" data-label="发布时间">
        <span className="bounty-date-value">{publishedDateLabel(item)}</span>
      </div>
      <div className="bounty-row-time" data-label="剩余时间">
        <strong>{item.deadline ? remainingTime(item.deadline, now) : "未设置"}</strong>
      </div>
      <div
        className="bounty-row-actions"
        data-label="操作"
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <BountyRowActions
          canApply={canApply}
          currentApplicationStatus={currentApplication?.status ?? null}
          isCurrentChallenger={item.isCurrentChallenger}
          isRecruitment={item.isRecruitment}
          openable={openable}
          processing={processing}
          onAccept={() => onAction("accept")}
          onApply={() => onAction("apply")}
          applyLabel={currentApplication?.status === "declined" ? "再次申请" : undefined}
          onOpenChallengeWork={openChallengeWork}
          onOpenObjective={openObjective}
        />
      </div>
    </article>
  );
}

function objectiveDescriptionText(description: string) {
  const normalizedDescription = description.trim();
  return normalizedDescription === EMPTY_OBJECTIVE_DESCRIPTION_LABEL ? "" : normalizedDescription;
}

function ResultPreview({ item, onOpenMetricDetail }: { item: BountyItem; onOpenMetricDetail: (result: Result) => void }) {
  return (
    <>
      <span className="bounty-result-summary">{resultCountLabel(item)}</span>
      <div className="bounty-result-preview" aria-label="指标预览">
        {item.results.length > 0 ? (
          item.results.map((result) => (
            <button
              key={result.id}
              type="button"
              className="bounty-result-preview-item"
              aria-label={`查看指标详情：${result.title}`}
              title={result.title}
              onClick={(event) => {
                event.stopPropagation();
                onOpenMetricDetail(result);
              }}
            >
              <strong>{result.title}</strong>
            </button>
          ))
        ) : (
          <div className="bounty-result-preview-empty">待定义指标</div>
        )}
      </div>
    </>
  );
}

function BountyMetricDetailPanel({ item, onClose, result }: { item: BountyItem; onClose: () => void; result: Result }) {
  const panelDrag = useDraggableFloating<HTMLElement>({ resetKey: result.id });
  const detailText = resultDetailText(result);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <aside
      ref={panelDrag.ref}
      className="orf-metric-inspector-panel orf-draggable-floating bounty-metric-detail-panel"
      data-no-row-edit="true"
      style={panelDrag.style}
    >
      <header className="orf-metric-inspector-header orf-drag-handle" {...panelDrag.handleProps}>
        <div className="min-w-0">
          <div className="orf-metric-inspector-kicker">指标详情</div>
          <h2 className="orf-metric-inspector-title" title={result.title}>{result.title}</h2>
          <div className="orf-metric-inspector-objective" title={item.objective.title}>{item.objective.title}</div>
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

      <section className="orf-metric-inspector-section orf-metric-inspector-detail-section">
        <div className="orf-metric-inspector-section-head">
          <div className="orf-metric-inspector-label">指标说明</div>
        </div>
        <div className={detailText ? "orf-metric-inspector-detail" : "orf-metric-inspector-detail orf-metric-inspector-detail-empty"}>
          {detailText || "未填写指标说明。"}
        </div>
      </section>
    </aside>
  );
}

function Chip({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" | "gold" | "warning" | "success" }) {
  return <BountyBadge tone={tone}>{children}</BountyBadge>;
}
