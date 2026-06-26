import { ShieldAlert } from "lucide-react";
import { type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { canApplyForObjectiveChallenge } from "../../../domain/orfLifecycle";
import { resultDetailPreviewText } from "../../../domain/orfResultDetails";
import { remainingTime } from "../../challenge/model/challengeDates";
import { BountyBadge } from "../BountyHallSkin";
import { bountyPointsLabel, currentUserApplication, highestDifficultyLabel, publishedDateLabel, resultCountLabel } from "../model/bountyHallItems";
import type { BountyItem, ChallengeAction } from "../model/bountyHallTypes";
import { BountyRowActions } from "./BountyRowActions";
import { ParticipationPreview } from "./ParticipationPreview";

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
  return (
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
          onOpenObjective={onOpenObjective}
          processing={processingBountyId === item.objective.id}
          showDeclinedApplicationState={showDeclinedApplicationState}
          onAction={(action) => onAction(item, action)}
        />
      ))}
    </div>
  );
}

function BountyListRow({
  item,
  currentUserId,
  now,
  onOpenChallengeWork,
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
  onOpenObjective?: (objectiveId: string) => void;
  processing: boolean;
  showDeclinedApplicationState: boolean;
  onAction: (action: ChallengeAction) => void;
}) {
  const currentApplication = currentUserApplication(item, currentUserId, { includeDeclined: showDeclinedApplicationState });
  const canApply = item.isRecruitment || canApplyForObjectiveChallenge(item.objective);
  const openable = Boolean(onOpenObjective);
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
      aria-label={`${item.objective.title}，${openable ? "双击打开挑战页目标；" : ""}单击、移入或聚焦后显示完整信息`}
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
        <Chip tone={item.isRecruitment ? "accent" : "neutral"}>{highestDifficultyLabel(item)}</Chip>
        <Chip tone="gold">{bountyPointsLabel(item)}</Chip>
      </div>
      <div className="bounty-row-main" data-label="悬赏目标">
        <div className="bounty-row-title">
          <h3>{item.objective.title}</h3>
          <div className="bounty-row-revealed">
            <p>{item.objective.description}</p>
            {item.source === "memberProposed" && item.definer && <span className="bounty-row-definer">提出人：{item.definer}</span>}
          </div>
        </div>
      </div>
      <div className="bounty-row-participants" data-label="参与状态">
        <ParticipationPreview currentUserId={currentUserId} item={item} />
      </div>
      <div className="bounty-row-results" data-label="指标">
        <ResultPreview item={item} />
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

function ResultPreview({ item }: { item: BountyItem }) {
  return (
    <>
      <span className="bounty-result-summary">{resultCountLabel(item)}</span>
      <div className="bounty-result-preview" aria-label="指标预览">
        {item.results.length > 0 ? (
          item.results.map((result) => (
            <div key={result.id} className="bounty-result-preview-item">
              {resultDetailPreviewText(result) || result.title}
            </div>
          ))
        ) : (
          <div className="bounty-result-preview-item">待定义指标</div>
        )}
      </div>
    </>
  );
}

function Chip({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" | "gold" | "warning" | "success" }) {
  return <BountyBadge tone={tone}>{children}</BountyBadge>;
}
