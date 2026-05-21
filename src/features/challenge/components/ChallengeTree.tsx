import { clsx } from "clsx";
import { CalendarDays, CheckCircle2, Clock3, MessageSquare, Send, UserPlus, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { HIERARCHY_TREE_METRICS, HierarchyCell, HierarchyRootCell, HierarchyTreeOverlay } from "../../../components/OrfHierarchyTree";
import { CompletionCircleIcon, MetricSquareIcon, ObjectiveFlagIcon } from "../../../components/OrfIconAssets";
import { canReviewObjectiveChallengeApplications, shouldRenderObjectiveAsFrozen } from "../../../domain/orfLifecycle";
import type { ObjectiveContributionReview, OrfUser, Result, Task, TaskChecklistItem } from "../../../types/orf";
import { avatarStyleForName } from "../../../utils/avatar";
import { initials } from "../../../utils/format";
import { remainingTime } from "../model/challengeDates";
import {
  actionDropTargetForEvent,
  bountyDropTargetForEvent,
  dropTargetClass,
  handleRowDragLeave,
  handleRowDragOver,
  handleRowDrop,
  objectiveActionsDropTargetForEvent,
  subActionDropTargetForEvent,
} from "../model/challengeDragDrop";
import { commentCountFor } from "../model/challengeComments";
import { canFreezeObjectiveAfterReestimate, workbenchActionForObjective } from "../model/orfFlowCapabilities";
import { actionVisualStatus, bountyStatusLabel, objectiveComplete, objectiveStatusLabel, objectiveStatusTone, subActionVisualStatus } from "../model/challengeStatus";
import type { BountyNode, ChallengeRowAction, ChallengeScope, ChallengeTarget, DragDropController, ObjectiveNode } from "../model/types";
import { ChallengeRowActions, DisclosureAction, rowActionLeft } from "./ChallengeRowActions";
import { handleRowDoubleClick, InlineTitleEditor, isSameTarget } from "./InlineTitleEditor";

type RowHandlers = {
  activeActionId: string | null;
  collapsedActionIds: Set<string>;
  collapsedBountyIds: Set<string>;
  commentCounts: Map<string, number>;
  dragDrop: DragDropController;
  editingTarget: ChallengeTarget | null;
  contributionReviews: ObjectiveContributionReview[];
  canManageFlow: boolean;
  canMutateMetrics: (objectiveId: string) => boolean;
  canMutateWorkItems: (objectiveId: string) => boolean;
  currentUser: OrfUser | null;
  draftObjectiveId?: string;
  metricActionLabel: (objective: ObjectiveNode["objective"]) => string | null;
  canRecruitObjective: (objective: ObjectiveNode["objective"]) => boolean;
  onActionDoneChange: (actionId: string, done: boolean) => void;
  onActionRowAction: (action: ChallengeRowAction, target: ChallengeTarget) => void;
  onActiveActionChange: (id: string | null) => void;
  onAddAction: (objectiveId: string) => void;
  onAddBounty: (objectiveId: string) => void;
  onAddSubAction: (actionId: string, afterItemId?: string) => void;
  onApproveApplication: (objectiveId: string, applicationId: string) => Promise<boolean>;
  onCancelEdit: () => void;
  onEditTarget: (target: ChallengeTarget) => void;
  onFreezeObjective: (objectiveId: string) => Promise<boolean>;
  onOpenActionChange: (id: string | null) => void;
  onPublishObjective: (objectiveId: string) => Promise<boolean>;
  onRecruitObjective: (objectiveId: string) => void;
  onRejectApplication: (objectiveId: string, applicationId: string) => Promise<boolean>;
  onSaveTitle: (target: ChallengeTarget, title: string) => boolean | void;
  onSubActionDoneChange: (actionId: string, itemId: string, done: boolean) => void;
  onToggleAction: (actionId: string) => void;
  onToggleBounty: (bountyId: string) => void;
  openActionId: string | null;
};

export function ChallengeTree({
  emptyText,
  groups,
  handlers,
  now,
  scope,
}: {
  emptyText: string;
  groups: ObjectiveNode[];
  handlers: RowHandlers;
  now: Date;
  scope: ChallengeScope;
}) {
  return (
    <div className="grid gap-3">
      {groups.map((group) => (
        <ObjectivePanel
          key={group.objective.id}
          group={group}
          handlers={handlers}
          now={now}
          scope={scope}
        />
      ))}
      {groups.length === 0 && <div className="orf-card orf-card-padding text-center text-sm orf-text-secondary">{emptyText}</div>}
    </div>
  );
}

function ObjectivePanel({
  group,
  handlers,
  now,
  scope,
}: {
  group: ObjectiveNode;
  handlers: RowHandlers;
  now: Date;
  scope: ChallengeScope;
}) {
  const target: ChallengeTarget = { type: "objective", id: group.objective.id, title: group.objective.title };
  const [objectiveElement, setObjectiveElement] = useState<HTMLElement | null>(null);
  const complete = objectiveComplete(group.objective);
  const actionId = `objective:${group.objective.id}`;
  const anchorId = `objective:${group.objective.id}`;
  const rowActive = handlers.activeActionId === actionId || handlers.openActionId === actionId;
  const hasOpenRowMenu = objectivePanelHasOpenRowMenu(group, handlers.openActionId);
  const isDraftObjective = group.objective.id === handlers.draftObjectiveId;
  const isFrozen = shouldRenderObjectiveAsFrozen(group.objective);
  const pendingApplications = group.objective.challengeApplications.filter((application) => application.status === "pending");
  const workbenchAction = workbenchActionForObjective({
    objective: group.objective,
    currentUser: handlers.currentUser,
    contributionReviews: handlers.contributionReviews,
  });
  const showApplicationReview =
    handlers.canManageFlow &&
    canReviewObjectiveChallengeApplications(group.objective) &&
    pendingApplications.length > 0;
  const layoutKey = [
    ...group.bounties.map((bounty) => bounty.result.id),
    ...group.actions.map((action) => (handlers.collapsedActionIds.has(action.id) ? `${action.id}:closed` : `${action.id}:${action.checklist.map((item) => item.id).join(",")}`)),
  ].join(";");
  const metricAddLabel = isDraftObjective ? null : handlers.metricActionLabel(group.objective);
  const objectiveAddActions = [
    ...(metricAddLabel ? [{ label: metricAddLabel, onAdd: () => handlers.onAddBounty(group.objective.id) }] : []),
    ...(isDraftObjective || !handlers.canMutateWorkItems(group.objective.id) ? [] : [{ label: "新增行动项", onAdd: () => handlers.onAddAction(group.objective.id) }]),
  ];

  return (
    <section
      ref={setObjectiveElement}
      className={clsx("orf-objective-panel relative", isFrozen ? "orf-objective-panel-frozen" : "orf-objective-panel-editable")}
      data-has-open-row-menu={hasOpenRowMenu ? "true" : undefined}
    >
      <HierarchyTreeOverlay container={objectiveElement} layoutKey={layoutKey} />
      <div
        className={clsx("orf-objective-header orf-challenge-row orf-challenge-row-objective group relative grid min-h-[58px] items-center px-5 text-sm", rowActive && "orf-row-active")}
        data-has-workbench-action={workbenchAction ? "true" : undefined}
        data-scope={scope}
        onDoubleClick={(event) => handleRowDoubleClick(event, target, handlers.onEditTarget)}
        onPointerEnter={() => handlers.onActiveActionChange(actionId)}
        onPointerLeave={() => {
          if (handlers.activeActionId === actionId) handlers.onActiveActionChange(null);
        }}
      >
        <ChallengeRowActions
          actionId={actionId}
          activeActionId={handlers.activeActionId}
          addActions={objectiveAddActions}
          left={rowActionLeft.objective}
          onAction={(action) => handlers.onActionRowAction(action, target)}
          onActiveActionChange={handlers.onActiveActionChange}
          onAdd={() => handlers.onAddBounty(group.objective.id)}
          onOpenActionChange={handlers.onOpenActionChange}
          openActionId={handlers.openActionId}
        />
        <HierarchyRootCell anchor={<ObjectiveFlagIcon complete={complete} />} anchorId={anchorId}>
          {isSameTarget(handlers.editingTarget, target) ? (
            <InlineTitleEditor
              ariaLabel="编辑目标标题"
              className="orf-objective-title text-lg font-bold"
              onCancel={handlers.onCancelEdit}
              onSubmit={(title) => handlers.onSaveTitle(target, title)}
              value={group.objective.title}
            />
          ) : (
            <div className={clsx("orf-objective-title min-w-0 truncate text-lg font-bold", complete ? "text-[#98a2b3] line-through" : "text-[#111827]")}>{group.objective.title}</div>
          )}
          <CommentCountBadge count={commentCountFor(handlers.commentCounts, "objective", group.objective.id)} onClick={() => handlers.onActionRowAction("comment", target)} />
        </HierarchyRootCell>
        {isDraftObjective ? <EmptySlot /> : <ObjectiveFlowAction group={group} handlers={handlers} />}
        <AvatarStack names={group.challengers} />
        {isDraftObjective ? <StatusChip tone="open">草稿</StatusChip> : <StatusChip tone={objectiveStatusTone(group.objective)}>{objectiveStatusLabel(group.objective)}</StatusChip>}
        <TimeValue icon={Clock3} value={remainingTime(group.deadline, now)} />
        <DateStack primary={group.deadline || "未设置"} />
        <ProgressValue value={group.objective.progress} />
        {workbenchAction ? (
          <Link className="orf-row-loot-action orf-control orf-primary-action inline-flex h-9 items-center justify-center gap-2 px-3 text-sm font-semibold" to={workbenchAction.to}>
            {workbenchAction.label}
          </Link>
        ) : null}
      </div>

      {showApplicationReview && (
        <div className="orf-objective-admin-strip">
          <span className="orf-objective-admin-strip-label">挑战申请</span>
          {pendingApplications.map((application) => (
            <span key={application.id} className="orf-objective-application-pill">
              <span className="font-semibold orf-text-primary">{application.applicant}</span>
              <button type="button" className="orf-objective-application-approve" onClick={() => void handlers.onApproveApplication(group.objective.id, application.id)}>
                通过
              </button>
              <button type="button" className="orf-objective-application-reject" onClick={() => void handlers.onRejectApplication(group.objective.id, application.id)}>
                拒绝
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="orf-objective-body">
        {group.bounties.map((bounty) => (
          <BountyRow
            key={bounty.result.id}
            bounty={bounty}
            handlers={handlers}
            now={now}
            parentAnchorId={anchorId}
            scope={scope}
          />
        ))}
        {group.bounties.length === 0 && <ObjectiveMetricEmptyState parentAnchorId={anchorId} />}
        {group.actions.length > 0 ? (
          <div className="pb-2">
            {group.actions.map((action) => (
              <ActionRow
                key={action.id}
                action={action}
                handlers={handlers}
                parentAnchorId={anchorId}
              />
            ))}
          </div>
        ) : (
          <ObjectiveTaskEmptyState
            canAdd={handlers.canMutateWorkItems(group.objective.id)}
            dragDrop={handlers.dragDrop}
            objectiveId={group.objective.id}
            onAdd={() => handlers.onAddAction(group.objective.id)}
            parentAnchorId={anchorId}
          />
        )}
      </div>
    </section>
  );
}

function objectivePanelHasOpenRowMenu(group: ObjectiveNode, openActionId: string | null): boolean {
  if (!openActionId) return false;
  if (openActionId === `objective:${group.objective.id}`) return true;

  if (group.bounties.some((bounty) => openActionId === `bounty:${bounty.result.id}`)) {
    return true;
  }

  return group.actions.some((action) => {
    if (openActionId === `action:${action.id}`) return true;
    return action.checklist.some((item) => openActionId === `subAction:${action.id}:${item.id}`);
  });
}

function ObjectiveTaskEmptyState({
  canAdd,
  dragDrop,
  objectiveId,
  onAdd,
  parentAnchorId,
}: {
  canAdd: boolean;
  dragDrop: DragDropController;
  objectiveId: string;
  onAdd: () => void;
  parentAnchorId: string;
}) {
  const dropTarget = objectiveActionsDropTargetForEvent(dragDrop.dragItem, objectiveId);
  const dropClass = dropTargetClass(dragDrop.dropTarget, [{ type: "objectiveActions", objectiveId }]);

  return (
    <div
      className={clsx("orf-objective-metric-empty", dropClass)}
      onDragLeave={(event) => handleRowDragLeave(event, dragDrop)}
      onDragOver={(event) => handleRowDragOver(event, dragDrop, dropTarget)}
      onDrop={(event) => handleRowDrop(event, dragDrop, dropTarget)}
    >
      <HierarchyCell depth={1}>
        <span
          className="flex h-5 w-5 shrink-0 items-center justify-center"
          data-hierarchy-anchor={`empty-task:${parentAnchorId}`}
          data-hierarchy-branch-end-offset="0"
          data-hierarchy-branch-target={`empty-task:${parentAnchorId}`}
          data-hierarchy-parent={parentAnchorId}
        >
          <CompletionCircleIcon checked={false} />
        </span>
        <div className="grid min-w-0 gap-1">
          <div className="text-base font-semibold text-[#475467]">待创建行动项</div>
          <div className="text-xs orf-text-muted">当前目标还没有技术任务。</div>
        </div>
        {canAdd && (
          <button type="button" className="ml-auto text-sm font-semibold text-[#0d7df2] hover:underline" onClick={onAdd}>
            新增行动项
          </button>
        )}
      </HierarchyCell>
    </div>
  );
}

function ObjectiveMetricEmptyState({ parentAnchorId }: { parentAnchorId: string }) {
  return (
    <div className="orf-objective-metric-empty">
      <HierarchyCell depth={1}>
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center"
          data-hierarchy-anchor={`empty:${parentAnchorId}`}
          data-hierarchy-branch-end-offset="0"
          data-hierarchy-branch-target={`empty:${parentAnchorId}`}
          data-hierarchy-parent={parentAnchorId}
        >
          <MetricSquareIcon tone="todo" />
        </span>
        <div className="grid min-w-0 gap-1">
          <div className="text-base font-semibold text-[#475467]">待定义指标</div>
          <div className="text-xs orf-text-muted">当前目标还没有指标。</div>
        </div>
      </HierarchyCell>
    </div>
  );
}

function ObjectiveFlowAction({ group, handlers }: { group: ObjectiveNode; handlers: RowHandlers }) {
  const objective = group.objective;
  if (!handlers.canManageFlow) return <EmptySlot />;

  const actions: ReactNode[] = [];

  if (objective.flowStatus === "candidate") {
    actions.push(
      <button className="orf-flow-action-button orf-flow-action-secondary" type="button" title="发布到悬赏大厅" onClick={() => void handlers.onPublishObjective(objective.id)}>
        <Send className="h-3.5 w-3.5" />
        发布
      </button>,
    );
  }

  if (handlers.canRecruitObjective(objective)) {
    actions.push(
      <button className="orf-flow-action-button orf-flow-action-secondary" type="button" title="征召挑战者" onClick={() => handlers.onRecruitObjective(objective.id)}>
        <UserPlus className="h-3.5 w-3.5" />
        征召
      </button>,
    );
  }

  if (canFreezeObjectiveAfterReestimate(objective, group.bounties.map((bounty) => bounty.result))) {
    actions.push(
      <button className="orf-flow-action-button orf-flow-action-primary" type="button" title="重估完成并冻结目标" onClick={() => void handlers.onFreezeObjective(objective.id)}>
        <CheckCircle2 className="h-3.5 w-3.5" />
        冻结
      </button>,
    );
  }

  if (actions.length === 0) return <EmptySlot />;

  return <div className="orf-flow-action-group">{actions.map((action, index) => <span key={index}>{action}</span>)}</div>;
}

function BountyRow({
  bounty,
  handlers,
  now,
  parentAnchorId,
  scope,
}: {
  bounty: BountyNode;
  handlers: RowHandlers;
  now: Date;
  parentAnchorId: string;
  scope: ChallengeScope;
}) {
  const target: ChallengeTarget = { type: "bounty", id: bounty.result.id, title: bounty.result.title, objectiveId: bounty.result.objectiveId };
  const complete = bounty.status === "settled";
  const anchorId = `bounty:${bounty.result.id}`;
  const actionId = `bounty:${bounty.result.id}`;
  const rowActive = handlers.activeActionId === actionId || handlers.openActionId === actionId;
  const dropClass = dropTargetClass(handlers.dragDrop.dropTarget, [
    { type: "bounty", bountyId: bounty.result.id },
  ]);
  return (
    <div className="relative">
      <div
        className={clsx(
          "orf-result-row orf-challenge-row orf-challenge-row-bounty orf-row-depth-1 group relative grid min-h-[56px] items-center px-5 text-sm",
          rowActive && "orf-row-active",
          handlers.dragDrop.dragItem?.type === "bounty" && handlers.dragDrop.dragItem.id === bounty.result.id && "orf-row-dragging",
          dropClass,
        )}
        data-scope={scope}
        onDoubleClick={(event) => handleRowDoubleClick(event, target, handlers.onEditTarget)}
        onDragLeave={(event) => handleRowDragLeave(event, handlers.dragDrop)}
        onDragOver={(event) => handleRowDragOver(event, handlers.dragDrop, bountyDropTargetForEvent(handlers.dragDrop.dragItem, bounty.result, event))}
        onDrop={(event) => handleRowDrop(event, handlers.dragDrop, bountyDropTargetForEvent(handlers.dragDrop.dragItem, bounty.result, event))}
        onPointerEnter={() => handlers.onActiveActionChange(actionId)}
        onPointerLeave={() => {
          if (handlers.activeActionId === actionId) handlers.onActiveActionChange(null);
        }}
      >
        <ChallengeRowActions
          actionId={actionId}
          activeActionId={handlers.activeActionId}
          dragItem={handlers.canMutateMetrics(bounty.result.objectiveId) ? { type: "bounty", id: bounty.result.id, objectiveId: bounty.result.objectiveId } : undefined}
          left={rowActionLeft.bounty}
          onAction={(action) => handlers.onActionRowAction(action, target)}
          onActiveActionChange={handlers.onActiveActionChange}
          onAdd={() => undefined}
          onDragEnd={handlers.dragDrop.onDragEnd}
          onDragStart={handlers.dragDrop.onDragStart}
          onOpenActionChange={handlers.onOpenActionChange}
          openActionId={handlers.openActionId}
        />
        <HierarchyCell depth={1}>
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center"
            data-hierarchy-anchor={anchorId}
            data-hierarchy-branch-end-offset="0"
            data-hierarchy-branch-target={anchorId}
            data-hierarchy-parent={parentAnchorId}
          >
            <MetricSquareIcon tone={bounty.status === "settled" ? "done" : bounty.status === "review" ? "review" : bounty.status === "active" ? "active" : "todo"} />
          </span>
          {isSameTarget(handlers.editingTarget, target) ? (
            <InlineTitleEditor
              ariaLabel="编辑指标标题"
              className="orf-result-title text-base font-semibold"
              onCancel={handlers.onCancelEdit}
              onSubmit={(title) => handlers.onSaveTitle(target, title)}
              value={bounty.result.title}
            />
          ) : (
            <div className={clsx("orf-result-title truncate text-base font-semibold", complete ? "text-[#98a2b3] line-through" : "text-[#1d2939]")}>{bounty.result.title}</div>
          )}
          <CommentCountBadge count={commentCountFor(handlers.commentCounts, "result", bounty.result.id)} onClick={() => handlers.onActionRowAction("comment", target)} />
        </HierarchyCell>
        <div className="orf-row-difficulty-cell"><Badge>{bounty.difficulty}</Badge></div>
        <EmptySlot />
        <StatusChip tone={bounty.status}>{bountyStatusLabel[bounty.status]}</StatusChip>
        <TimeValue icon={Clock3} value={remainingTime(bounty.deadline, now)} />
        <DateStack primary={bounty.deadline || "未设置"} secondary={bounty.updatedAt || "未设置"} />
        <ProgressValue value={bounty.progress} />
        {scope === "mine" ? <EmptySlot /> : null}
      </div>
    </div>
  );
}

function ActionRow({
  action,
  handlers,
  parentAnchorId,
}: {
  action: Task;
  handlers: RowHandlers;
  parentAnchorId: string;
}) {
  const target: ChallengeTarget = {
    type: "action",
    id: action.id,
    title: action.title,
    objectiveId: action.linkedObjectiveId,
    hasSubActions: action.checklist.length > 0,
  };
  const open = !handlers.collapsedActionIds.has(action.id);
  const status = actionVisualStatus(action);
  const complete = status === "done";
  const anchorId = `action:${action.id}`;
  const actionId = `action:${action.id}`;
  const rowActive = handlers.activeActionId === actionId || handlers.openActionId === actionId;
  const dropClass = dropTargetClass(handlers.dragDrop.dropTarget, [
    { type: "action", actionId: action.id },
    { type: "actionSubActions", actionId: action.id },
  ]);

  return (
    <div className="relative">
      <div
        className={clsx(
          "orf-task-row orf-challenge-row orf-challenge-row-action orf-row-depth-1 group relative grid min-h-[42px] items-center px-5 text-sm",
          rowActive && "orf-row-active",
          handlers.dragDrop.dragItem?.type === "action" && handlers.dragDrop.dragItem.id === action.id && "orf-row-dragging",
          dropClass,
        )}
        onDoubleClick={(event) => handleRowDoubleClick(event, target, handlers.onEditTarget)}
        onDragLeave={(event) => handleRowDragLeave(event, handlers.dragDrop)}
        onDragOver={(event) => handleRowDragOver(event, handlers.dragDrop, actionDropTargetForEvent(handlers.dragDrop.dragItem, action, event))}
        onDrop={(event) => handleRowDrop(event, handlers.dragDrop, actionDropTargetForEvent(handlers.dragDrop.dragItem, action, event))}
        onPointerEnter={() => handlers.onActiveActionChange(actionId)}
        onPointerLeave={() => {
          if (handlers.activeActionId === actionId) handlers.onActiveActionChange(null);
        }}
      >
        <ChallengeRowActions
          actionId={actionId}
          activeActionId={handlers.activeActionId}
          addLabel={handlers.canMutateWorkItems(action.linkedObjectiveId) ? "新增子行动项" : null}
          dragItem={handlers.canMutateWorkItems(action.linkedObjectiveId) ? { type: "action", id: action.id, objectiveId: action.linkedObjectiveId } : undefined}
          left={rowActionLeft.action}
          onAction={(rowAction) => handlers.onActionRowAction(rowAction, target)}
          onActiveActionChange={handlers.onActiveActionChange}
          onAdd={() => handlers.onAddSubAction(action.id)}
          onDragEnd={handlers.dragDrop.onDragEnd}
          onDragStart={handlers.dragDrop.onDragStart}
          onOpenActionChange={handlers.onOpenActionChange}
          openActionId={handlers.openActionId}
        />
        {action.checklist.length > 0 && (
          <DisclosureAction
            actionId={actionId}
            activeActionId={handlers.activeActionId}
            className="absolute top-1/2 -translate-y-1/2"
            expanded={open}
            label={open ? "折叠行动项" : "展开行动项"}
            left={HIERARCHY_TREE_METRICS.disclosureLeftByDepth[1]}
            onActiveActionChange={handlers.onActiveActionChange}
            onOpenActionChange={handlers.onOpenActionChange}
            onToggle={() => handlers.onToggleAction(action.id)}
            openActionId={handlers.openActionId}
          />
        )}
        <HierarchyCell depth={1}>
          <span
            className="flex h-5 w-5 shrink-0 items-center justify-center"
            data-hierarchy-anchor={anchorId}
            data-hierarchy-branch-end-offset="0"
            data-hierarchy-branch-target={anchorId}
            data-hierarchy-parent={parentAnchorId}
          >
            <CompletionCheckbox checked={complete} onChange={(checked) => handlers.onActionDoneChange(action.id, checked)} />
          </span>
          {isSameTarget(handlers.editingTarget, target) ? (
            <InlineTitleEditor
              ariaLabel="编辑行动项标题"
              className="orf-task-title text-base font-medium"
              onCancel={handlers.onCancelEdit}
              onSubmit={(title) => handlers.onSaveTitle(target, title)}
              value={action.title}
            />
          ) : (
            <div className={clsx("orf-task-title truncate text-base font-medium", complete ? "text-[#98a2b3] line-through" : status === "active" ? "text-[#0d7df2]" : "text-[#1d2939]")}>{action.title}</div>
          )}
          <CommentCountBadge count={commentCountFor(handlers.commentCounts, "task", action.id)} onClick={() => handlers.onActionRowAction("comment", target)} />
        </HierarchyCell>
        <EmptySlot />
        <EmptySlot />
        <EmptySlot />
        <EmptySlot />
        <TimeValue icon={Clock3} value={action.updatedAt || "未设置"} />
        <EmptySlot />
      </div>

      {open &&
        action.checklist.map((item, index) => (
          <SubActionRow
            key={item.id}
            action={action}
            handlers={handlers}
            item={item}
            itemIndex={index}
            parentAnchorId={anchorId}
          />
        ))}
    </div>
  );
}

function SubActionRow({
  action,
  handlers,
  item,
  itemIndex,
  parentAnchorId,
}: {
  action: Task;
  handlers: RowHandlers;
  item: TaskChecklistItem;
  itemIndex: number;
  parentAnchorId: string;
}) {
  const target: ChallengeTarget = {
    type: "subAction",
    id: item.id,
    title: item.label,
    actionId: action.id,
    objectiveId: action.linkedObjectiveId,
  };
  const status = subActionVisualStatus(action, item, itemIndex);
  const complete = status === "done";
  const actionId = `subAction:${action.id}:${item.id}`;
  const rowActive = handlers.activeActionId === actionId || handlers.openActionId === actionId;
  const dropClass = dropTargetClass(handlers.dragDrop.dropTarget, [{ type: "subAction", actionId: action.id, itemId: item.id }]);

  return (
    <div
      className={clsx(
        "orf-subtask-row orf-challenge-row orf-challenge-row-action orf-row-depth-2 group relative grid min-h-[36px] items-center px-5 text-sm",
        rowActive && "orf-row-active",
        handlers.dragDrop.dragItem?.type === "subAction" && handlers.dragDrop.dragItem.id === item.id && "orf-row-dragging",
        dropClass,
      )}
      onDoubleClick={(event) => handleRowDoubleClick(event, target, handlers.onEditTarget)}
      onDragLeave={(event) => handleRowDragLeave(event, handlers.dragDrop)}
      onDragOver={(event) => handleRowDragOver(event, handlers.dragDrop, subActionDropTargetForEvent(handlers.dragDrop.dragItem, action, item, event))}
      onDrop={(event) => handleRowDrop(event, handlers.dragDrop, subActionDropTargetForEvent(handlers.dragDrop.dragItem, action, item, event))}
      onPointerEnter={() => handlers.onActiveActionChange(actionId)}
      onPointerLeave={() => {
        if (handlers.activeActionId === actionId) handlers.onActiveActionChange(null);
      }}
    >
      <ChallengeRowActions
        actionId={actionId}
        activeActionId={handlers.activeActionId}
        addLabel={handlers.canMutateWorkItems(action.linkedObjectiveId) ? "新增同级子行动项" : null}
        dragItem={handlers.canMutateWorkItems(action.linkedObjectiveId) ? { type: "subAction", id: item.id, actionId: action.id } : undefined}
        left={rowActionLeft.subAction}
        onAction={(rowAction) => handlers.onActionRowAction(rowAction, target)}
        onActiveActionChange={handlers.onActiveActionChange}
        onAdd={() => handlers.onAddSubAction(action.id, item.id)}
        onDragEnd={handlers.dragDrop.onDragEnd}
        onDragStart={handlers.dragDrop.onDragStart}
        onOpenActionChange={handlers.onOpenActionChange}
        openActionId={handlers.openActionId}
      />
      <HierarchyCell depth={2}>
        <span
          className="flex h-5 w-5 shrink-0 items-center justify-center"
          data-hierarchy-anchor={`subAction:${item.id}`}
          data-hierarchy-branch-end-offset="0"
          data-hierarchy-branch-target={`subAction:${item.id}`}
          data-hierarchy-parent={parentAnchorId}
        >
          <CompletionCheckbox checked={complete} onChange={(checked) => handlers.onSubActionDoneChange(action.id, item.id, checked)} />
        </span>
        {isSameTarget(handlers.editingTarget, target) ? (
          <InlineTitleEditor
            ariaLabel="编辑子行动项标题"
            className="orf-subtask-title text-sm font-medium"
            onCancel={handlers.onCancelEdit}
            onSubmit={(title) => handlers.onSaveTitle(target, title)}
            value={item.label}
          />
        ) : (
          <div className={clsx("orf-subtask-title truncate text-sm font-medium", complete ? "text-[#98a2b3] line-through" : status === "active" ? "text-[#0d7df2]" : "text-[#344054]")}>{item.label}</div>
        )}
        <CommentCountBadge count={commentCountFor(handlers.commentCounts, "subtask", item.id)} onClick={() => handlers.onActionRowAction("comment", target)} />
      </HierarchyCell>
      <EmptySlot />
      <EmptySlot />
      <EmptySlot />
      <EmptySlot />
      <TimeValue icon={Clock3} value={item.updatedAt || action.updatedAt || "未设置"} />
      <EmptySlot />
    </div>
  );
}

function CompletionCheckbox({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button type="button" aria-pressed={checked} className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full" onClick={() => onChange(!checked)}>
      <CompletionCircleIcon checked={checked} />
    </button>
  );
}

function CommentCountBadge({ count, onClick }: { count: number; onClick: () => void }) {
  if (count <= 0) return null;

  return (
    <button type="button" aria-label={`打开 ${count} 条评论`} className="orf-comment-count-badge" onClick={(event) => { event.stopPropagation(); onClick(); }} title={`打开 ${count} 条评论`}>
      <MessageSquare className="h-3.5 w-3.5" />
      <span>{count}</span>
    </button>
  );
}

function StatusChip({ tone, children }: { tone: "active" | "done" | "open" | "review" | "settled" | "success" | "warning"; children: ReactNode }) {
  const className =
    tone === "settled" || tone === "done" || tone === "success"
      ? "orf-status-chip-done"
      : tone === "review"
        ? "orf-status-chip-review"
        : tone === "active"
          ? "orf-status-chip-accent"
          : tone === "warning"
            ? "orf-status-chip-warning"
            : "orf-status-chip-neutral";

  return (
    <span className={clsx("orf-status-chip inline-flex h-7 w-fit min-w-[62px] items-center justify-center whitespace-nowrap rounded-full px-2 text-xs font-bold leading-none", className)}>
      <span className="orf-status-chip-dot" aria-hidden="true" />
      {children}
    </span>
  );
}

function ProgressValue({ value }: { value: number }) {
  const bounded = Math.max(0, Math.min(100, Math.round(value)));

  return (
    <div className="orf-progress-value orf-progress-value-neutral flex items-center gap-2">
      <div className="orf-progress-track h-1.5 w-16 overflow-hidden rounded-full bg-[#dfe4eb]">
        <div className="h-full rounded-full bg-[#7f8da3]" style={{ width: `${bounded}%` }} />
      </div>
      <span className="w-9 text-right text-sm font-bold text-[#344054]">{bounded}%</span>
    </div>
  );
}

function DateStack({ primary, secondary }: { primary: string; secondary?: string }) {
  return (
    <div className="orf-date-stack">
      <TimeValue icon={CalendarDays} value={primary} />
      {secondary && <TimeValue icon={Clock3} subtle value={secondary} />}
    </div>
  );
}

function TimeValue({ icon: Icon, subtle, value }: { icon: LucideIcon; subtle?: boolean; value: string }) {
  return (
    <span className={clsx("orf-time-value inline-flex h-7 min-w-0 items-center gap-2 whitespace-nowrap text-sm font-medium", subtle ? "text-[#667085]" : "text-[#344054]")} title={value}>
      <Icon className={clsx("h-4 w-4", subtle ? "text-[#98a2b3]" : "text-[#667085]")} />
      <span className="orf-time-value-text">{value}</span>
    </span>
  );
}

function AvatarStack({ names }: { names: string[] }) {
  if (names.length === 0) return <span className="orf-avatar-stack text-sm font-medium text-[#98a2b3]">未分配</span>;

  return (
    <div className="orf-avatar-stack flex items-center">
      {names.slice(0, 4).map((name, index) => (
        <div
          key={name}
          className={clsx("flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-white text-[10px] font-bold text-white shadow-sm", index > 0 && "-ml-2")}
          style={avatarStyleForName(name)}
          title={name}
        >
          {initials(name)}
        </div>
      ))}
      {names.length > 4 && <span className="ml-1 rounded-full bg-[#f2f4f7] px-2 py-1 text-xs font-semibold text-[#475467]">+{names.length - 4}</span>}
    </div>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return <span className="orf-status-tag border orf-border orf-surface-muted px-2 py-0.5 text-xs font-semibold text-[#475467]">{children}</span>;
}

function EmptySlot() {
  return <span className="orf-empty-slot" aria-hidden="true" />;
}
