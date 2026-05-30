import { clsx } from "clsx";
import { CalendarDays, CheckCircle2, Clock3, MessageSquare, Send, UserPlus, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { HIERARCHY_TREE_METRICS, HierarchyCell, HierarchyRootCell, HierarchyTreeOverlay } from "../../../components/OrfHierarchyTree";
import { CompletionCircleIcon, MetricSquareIcon, ObjectiveFlagIcon } from "../../../components/OrfIconAssets";
import { minimumObjectiveDeadlineValue, type ObjectiveDeadlineEditState } from "../../../domain/orfDeadline";
import { canPublishObjectiveByFlow, canReviewObjectiveChallengeApplications, shouldRenderObjectiveAsFrozen } from "../../../domain/orfLifecycle";
import type { ObjectiveTrialReview, OrfUser, Task, TaskChecklistItem } from "../../../types/orf";
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
import { temporaryChildRowId, temporaryChildTarget } from "../model/types";
import type { BountyNode, ChallengeRowAction, ChallengeScope, ChallengeTarget, DragDropController, ObjectiveNode, TemporaryChildRow } from "../model/types";
import { ChallengeRowActions, DisclosureAction, rowActionLeft } from "./ChallengeRowActions";
import { handleRowDoubleClick, InlineTitleEditor, isSameTarget } from "./InlineTitleEditor";

type RowHandlers = {
  activeActionId: string | null;
  collapsedActionIds: Set<string>;
  collapsedBountyIds: Set<string>;
  commentCounts: Map<string, number>;
  temporaryChildRow: TemporaryChildRow | null;
  dragDrop: DragDropController;
  editingTarget: ChallengeTarget | null;
  trialReviews: ObjectiveTrialReview[];
  canManageFlow: boolean;
  objectiveDeadlineEditState: (objective: ObjectiveNode["objective"]) => ObjectiveDeadlineEditState;
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
  onTemporaryChildTitleChange: (title: string) => void;
  onDraftTitleChange: (title: string) => void;
  onEditTarget: (target: ChallengeTarget) => void;
  onFreezeObjective: (objectiveId: string) => Promise<boolean>;
  onOpenActionChange: (id: string | null) => void;
  onPublishObjective: (objectiveId: string) => Promise<boolean>;
  onRecruitObjective: (objectiveId: string) => void;
  onRejectApplication: (objectiveId: string, applicationId: string) => Promise<boolean>;
  onSaveObjectiveDeadline: (objectiveId: string, finalDueAt: string) => Promise<boolean>;
  onUnavailableObjectiveDeadline: (objective: ObjectiveNode["objective"]) => void;
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
  const rowActive = handlers.activeActionId === actionId || isRowActionOpen(handlers.openActionId, actionId);
  const hasOpenRowMenu = objectivePanelHasOpenRowMenu(group, handlers.openActionId);
  const isDraftObjective = group.objective.id === handlers.draftObjectiveId;
  const isEditingTarget = isSameTarget(handlers.editingTarget, target);
  const draftObjectiveIsSubmitting = isDraftObjective && !isEditingTarget;
  const isFrozen = shouldRenderObjectiveAsFrozen(group.objective);
  const activeTemporaryChild = handlers.temporaryChildRow?.objectiveId === group.objective.id ? handlers.temporaryChildRow : null;
  const metricAddLabel = isDraftObjective ? null : handlers.metricActionLabel(group.objective);
  const canCreateAction = !isDraftObjective && handlers.canMutateWorkItems(group.objective.id);
  const metricTemporaryRow = activeTemporaryChild?.kind === "metric" ? activeTemporaryChild : null;
  const actionTemporaryRow = activeTemporaryChild?.kind === "action" ? activeTemporaryChild : null;
  const pendingApplications = group.objective.challengeApplications.filter((application) => application.status === "pending");
  const statusChip = isDraftObjective ? (
    <StatusChip tone="open">{draftObjectiveIsSubmitting ? "保存中" : "草稿"}</StatusChip>
  ) : (
    <StatusChip tone={objectiveStatusTone(group.objective)}>{objectiveStatusLabel(group.objective)}</StatusChip>
  );
  const workbenchAction = workbenchActionForObjective({
    objective: group.objective,
    currentUser: handlers.currentUser,
    trialReviews: handlers.trialReviews,
  });
  const showApplicationReview =
    handlers.canManageFlow &&
    canReviewObjectiveChallengeApplications(group.objective) &&
    pendingApplications.length > 0;
  const layoutKey = [
    ...group.bounties.map((bounty) => bounty.result.id),
    ...(metricTemporaryRow ? [metricTemporaryRow.id] : []),
    ...group.actions.map((action) => {
      const temporarySubtaskKey = activeTemporaryChild?.kind === "subtask" && activeTemporaryChild.taskId === action.id ? `,${activeTemporaryChild.id}` : "";
      return handlers.collapsedActionIds.has(action.id)
        ? `${action.id}:closed${temporarySubtaskKey}`
        : `${action.id}:${action.checklist.map((item) => item.id).join(",")}${temporarySubtaskKey}`;
    }),
    ...(actionTemporaryRow ? [actionTemporaryRow.id] : []),
  ].join(";");
  const objectiveAddActions =
    activeTemporaryChild || isDraftObjective
      ? []
      : [
          ...(metricAddLabel ? [{ label: metricAddLabel, onAdd: () => handlers.onAddBounty(group.objective.id) }] : []),
          ...(canCreateAction ? [{ label: "新增行动项", onAdd: () => handlers.onAddAction(group.objective.id) }] : []),
        ];

  return (
    <section
      ref={setObjectiveElement}
      className={clsx("orf-objective-panel relative", isFrozen ? "orf-objective-panel-frozen" : "orf-objective-panel-editable", isDraftObjective && "orf-objective-panel-draft")}
      data-objective-panel-id={group.objective.id}
      data-has-open-row-menu={hasOpenRowMenu ? "true" : undefined}
    >
      <HierarchyTreeOverlay container={objectiveElement} layoutKey={layoutKey} />
      <div
        className={clsx("orf-objective-header orf-challenge-row orf-challenge-row-objective group relative grid items-center px-5", rowActive && "orf-row-active")}
        data-challenge-row-target={anchorId}
        data-has-workbench-action={workbenchAction ? "true" : undefined}
        data-scope={scope}
        aria-busy={draftObjectiveIsSubmitting ? "true" : undefined}
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
          addForceMenu
          left={rowActionLeft.objective}
          onAction={(action) => handlers.onActionRowAction(action, target)}
          onActiveActionChange={handlers.onActiveActionChange}
          onOpenActionChange={handlers.onOpenActionChange}
          openActionId={handlers.openActionId}
        />
        <HierarchyRootCell anchor={<ObjectiveFlagIcon complete={complete} />} anchorId={anchorId}>
          {isEditingTarget ? (
            <InlineTitleEditor
              ariaLabel="编辑目标标题"
              className="orf-objective-title font-bold"
              onDraftChange={isDraftObjective ? handlers.onDraftTitleChange : undefined}
              onCancel={handlers.onCancelEdit}
              onSubmit={(title) => handlers.onSaveTitle(target, title)}
              value={group.objective.title}
            />
          ) : (
            <div className={clsx("orf-objective-title min-w-0 truncate font-bold", complete ? "text-[#98a2b3] line-through" : "text-[#111827]")}>{group.objective.title}</div>
          )}
          <CommentCountBadge count={commentCountFor(handlers.commentCounts, "objective", group.objective.id)} onClick={() => handlers.onActionRowAction("comment", target)} />
        </HierarchyRootCell>
        <ObjectiveFlowAction disabled={isDraftObjective} group={group} handlers={handlers} />
        <AvatarStack names={group.challengers} />
        {statusChip}
        <TimeValue icon={Clock3} value={remainingTime(group.deadline, now)} />
        <ObjectiveDeadlineCell
          editState={handlers.objectiveDeadlineEditState(group.objective)}
          objective={group.objective}
          onSave={handlers.onSaveObjectiveDeadline}
          onUnavailable={handlers.onUnavailableObjectiveDeadline}
        />
        <ProgressValue value={group.objective.progress} />
        {workbenchAction ? (
          <Link className="orf-row-loot-action orf-control orf-primary-action inline-flex items-center justify-center gap-2 px-3 font-semibold" to={workbenchAction.to}>
            {workbenchAction.label}
          </Link>
        ) : null}
      </div>

      {showApplicationReview && (
        <div className="orf-objective-admin-strip">
          <span className="orf-objective-admin-strip-label">挑战申请</span>
          {pendingApplications.map((application) => (
            <span key={application.id} className="orf-objective-application-pill">
              <span className="orf-objective-application-main">
                <span className="font-semibold orf-text-primary">{application.applicant}</span>
                {application.reason && <span className="orf-objective-application-reason">{application.reason}</span>}
              </span>
              <span className="orf-objective-application-actions">
                <button type="button" className="orf-objective-application-approve" onClick={() => void handlers.onApproveApplication(group.objective.id, application.id)}>
                  通过
                </button>
                <button type="button" className="orf-objective-application-reject" onClick={() => void handlers.onRejectApplication(group.objective.id, application.id)}>
                  拒绝
                </button>
              </span>
            </span>
          ))}
        </div>
      )}

      <div className="orf-objective-body">
        {group.bounties.map((bounty) => (
          <MetricRow
            key={bounty.result.id}
            handlers={handlers}
            parentAnchorId={anchorId}
            row={{ bounty, persistence: "persisted" }}
            scope={scope}
          />
        ))}
        {metricTemporaryRow && (
          <MetricRow
            handlers={handlers}
            parentAnchorId={anchorId}
            row={{ persistence: "temporary", placeholderTitle: metricAddLabel ?? "新增指标", temporary: metricTemporaryRow }}
            scope={scope}
          />
        )}
        {(group.actions.length > 0 || actionTemporaryRow) && (
          <div className="pb-2">
            {group.actions.map((action) => (
              <ActionRow
                key={action.id}
                handlers={handlers}
                parentAnchorId={anchorId}
                row={{ action, persistence: "persisted" }}
              />
            ))}
            {actionTemporaryRow && (
              <ActionRow
                handlers={handlers}
                parentAnchorId={anchorId}
                row={{ persistence: "temporary", placeholderTitle: "新增行动项", temporary: actionTemporaryRow }}
              />
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function objectivePanelHasOpenRowMenu(group: ObjectiveNode, openActionId: string | null): boolean {
  if (!openActionId) return false;
  if (isRowActionOpen(openActionId, `objective:${group.objective.id}`)) return true;
  if (isRowActionOpen(openActionId, `temporary-metric:${temporaryChildRowId("metric", group.objective.id)}`)) return true;
  if (isRowActionOpen(openActionId, `temporary-action:${temporaryChildRowId("action", group.objective.id)}`)) return true;

  if (group.bounties.some((bounty) => isRowActionOpen(openActionId, `bounty:${bounty.result.id}`))) {
    return true;
  }

  return group.actions.some((action) => {
    if (isRowActionOpen(openActionId, `action:${action.id}`)) return true;
    if (isRowActionOpen(openActionId, `temporary-subtask:${temporaryChildRowId("subtask", action.id)}`)) return true;
    return action.checklist.some((item) => isRowActionOpen(openActionId, `subAction:${action.id}:${item.id}`));
  });
}

function isRowActionOpen(openActionId: string | null, actionId: string) {
  return openActionId === actionId || openActionId === `${actionId}:add`;
}

function ObjectiveFlowAction({ disabled = false, group, handlers }: { disabled?: boolean; group: ObjectiveNode; handlers: RowHandlers }) {
  const objective = group.objective;
  if (!handlers.canManageFlow) return <EmptySlot />;

  const actions: ReactNode[] = [];

  if (canPublishObjectiveByFlow(objective)) {
    actions.push(
      <button className="orf-flow-action-button orf-flow-action-secondary" disabled={disabled} type="button" title={disabled ? "完成目标标题后可发布" : "发布到悬赏大厅"} onClick={() => void handlers.onPublishObjective(objective.id)}>
        <Send className="h-3.5 w-3.5" />
        发布
      </button>,
    );
  }

  if (handlers.canRecruitObjective(objective)) {
    actions.push(
      <button className="orf-flow-action-button orf-flow-action-secondary" disabled={disabled} type="button" title={disabled ? "完成目标标题后可征召" : "征召挑战者"} onClick={() => handlers.onRecruitObjective(objective.id)}>
        <UserPlus className="h-3.5 w-3.5" />
        征召
      </button>,
    );
  }

  if (canFreezeObjectiveAfterReestimate(objective, group.bounties.map((bounty) => bounty.result))) {
    actions.push(
      <button className="orf-flow-action-button orf-flow-action-primary" disabled={disabled} type="button" title={disabled ? "完成目标标题后可冻结" : "重估完成并冻结目标"} onClick={() => void handlers.onFreezeObjective(objective.id)}>
        <CheckCircle2 className="h-3.5 w-3.5" />
        冻结
      </button>,
    );
  }

  if (actions.length === 0) return <EmptySlot />;

  return <div className="orf-flow-action-group">{actions.map((action, index) => <span key={index}>{action}</span>)}</div>;
}

type MetricTreeRow =
  | { bounty: BountyNode; persistence: "persisted" }
  | { persistence: "temporary"; placeholderTitle: string; temporary: TemporaryChildRow };

type ActionTreeRow =
  | { action: Task; persistence: "persisted" }
  | { persistence: "temporary"; placeholderTitle: string; temporary: TemporaryChildRow };

type SubActionTreeRow =
  | { item: TaskChecklistItem; itemIndex: number; persistence: "persisted" }
  | { persistence: "temporary"; placeholderTitle: string; temporary: TemporaryChildRow };

function MetricRow({
  row,
  handlers,
  parentAnchorId,
  scope,
}: {
  row: MetricTreeRow;
  handlers: RowHandlers;
  parentAnchorId: string;
  scope: ChallengeScope;
}) {
  const temporary = row.persistence === "temporary" ? row.temporary : null;
  const placeholderTitle = row.persistence === "temporary" ? row.placeholderTitle : "";
  const bounty = row.persistence === "persisted" ? row.bounty : null;
  const target: ChallengeTarget = temporary
    ? temporaryChildTarget(temporary)
    : { type: "bounty", id: bounty!.result.id, title: bounty!.result.title, objectiveId: bounty!.result.objectiveId };
  const complete = bounty?.status === "settled";
  const anchorId = temporary ? `temporary-metric:${temporary.id}` : `bounty:${bounty!.result.id}`;
  const actionId = anchorId;
  const rowActive = handlers.activeActionId === actionId || isRowActionOpen(handlers.openActionId, actionId);
  const isEditingTarget = isSameTarget(handlers.editingTarget, target);
  const dropClass = bounty
    ? dropTargetClass(handlers.dragDrop.dropTarget, [
        { type: "bounty", bountyId: bounty.result.id },
      ])
    : "";
  const disabled = temporary?.status === "submitting";
  const title = temporary ? temporary.title || placeholderTitle : bounty!.result.title;
  const statusLabel = temporary
    ? temporary.status === "submitting"
      ? "保存中"
      : temporary.status === "idle"
        ? "待创建"
        : "草稿"
    : bountyStatusLabel[bounty!.status];

  return (
    <div className="relative">
      <div
        className={clsx(
          "orf-result-row orf-challenge-row orf-challenge-row-bounty orf-row-depth-1 group relative grid items-center px-5",
          rowActive && "orf-row-active",
          bounty && handlers.dragDrop.dragItem?.type === "bounty" && handlers.dragDrop.dragItem.id === bounty.result.id && "orf-row-dragging",
          dropClass,
        )}
        data-challenge-row-target={anchorId}
        data-scope={scope}
        onDoubleClick={(event) => {
          if (!disabled) handleRowDoubleClick(event, target, handlers.onEditTarget);
        }}
        onDragLeave={bounty ? (event) => handleRowDragLeave(event, handlers.dragDrop) : undefined}
        onDragOver={bounty ? (event) => handleRowDragOver(event, handlers.dragDrop, bountyDropTargetForEvent(handlers.dragDrop.dragItem, bounty.result, event)) : undefined}
        onDrop={bounty ? (event) => handleRowDrop(event, handlers.dragDrop, bountyDropTargetForEvent(handlers.dragDrop.dragItem, bounty.result, event)) : undefined}
        onPointerEnter={() => handlers.onActiveActionChange(actionId)}
        onPointerLeave={() => {
          if (handlers.activeActionId === actionId) handlers.onActiveActionChange(null);
        }}
      >
        {!disabled && (
          <ChallengeRowActions
            actionId={actionId}
            activeActionId={handlers.activeActionId}
            dragItem={bounty && handlers.canMutateMetrics(bounty.result.objectiveId) ? { type: "bounty", id: bounty.result.id, objectiveId: bounty.result.objectiveId } : undefined}
            left={rowActionLeft.bounty}
            onAction={(action) => handlers.onActionRowAction(action, target)}
            onActiveActionChange={handlers.onActiveActionChange}
            onDragEnd={handlers.dragDrop.onDragEnd}
            onDragStart={handlers.dragDrop.onDragStart}
            onOpenActionChange={handlers.onOpenActionChange}
            openActionId={handlers.openActionId}
          />
        )}
        <HierarchyCell depth={1}>
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center"
            data-hierarchy-anchor={anchorId}
            data-hierarchy-branch-end-offset="0"
            data-hierarchy-branch-target={anchorId}
            data-hierarchy-parent={parentAnchorId}
          >
            <MetricSquareIcon tone={bounty ? (bounty.status === "settled" ? "done" : bounty.status === "review" ? "review" : bounty.status === "active" ? "active" : "todo") : "todo"} />
          </span>
          {isEditingTarget ? (
            <InlineTitleEditor
              ariaLabel="编辑指标标题"
              className="orf-result-title font-semibold"
              onCancel={handlers.onCancelEdit}
              onDraftChange={temporary ? handlers.onTemporaryChildTitleChange : undefined}
              onSubmit={(title) => handlers.onSaveTitle(target, title)}
              value={temporary ? temporary.title : bounty!.result.title}
            />
          ) : (
            <div className={clsx("orf-result-title truncate font-semibold", complete ? "text-[#98a2b3] line-through" : temporary ? "text-[#475467]" : "text-[#1d2939]")}>{title}</div>
          )}
          {bounty && <CommentCountBadge count={commentCountFor(handlers.commentCounts, "result", bounty.result.id)} onClick={() => handlers.onActionRowAction("comment", target)} />}
        </HierarchyCell>
        {bounty ? <div className="orf-row-difficulty-cell"><Badge>{bounty.difficulty}</Badge></div> : <EmptySlot />}
        <EmptySlot />
        <StatusChip tone={bounty ? bounty.status : "open"}>{statusLabel}</StatusChip>
        <EmptySlot />
        <DateStack primary={bounty ? bounty.updatedAt || "未设置" : "未设置"} />
        <ProgressValue value={bounty ? bounty.progress : 0} />
        {scope === "mine" ? <EmptySlot /> : null}
      </div>
    </div>
  );
}

function ActionRow({
  row,
  handlers,
  parentAnchorId,
}: {
  row: ActionTreeRow;
  handlers: RowHandlers;
  parentAnchorId: string;
}) {
  const temporary = row.persistence === "temporary" ? row.temporary : null;
  const placeholderTitle = row.persistence === "temporary" ? row.placeholderTitle : "";
  const action = row.persistence === "persisted" ? row.action : null;
  const temporarySubtask =
    action && handlers.temporaryChildRow?.kind === "subtask" && handlers.temporaryChildRow.taskId === action.id
      ? handlers.temporaryChildRow
      : null;
  const target: ChallengeTarget = temporary
    ? temporaryChildTarget(temporary)
    : {
        type: "action",
        id: action!.id,
        title: action!.title,
        objectiveId: action!.linkedObjectiveId,
        hasSubActions: action!.checklist.length > 0,
      };
  const open = action ? !handlers.collapsedActionIds.has(action.id) || Boolean(temporarySubtask) : false;
  const status = action ? actionVisualStatus(action) : "todo";
  const complete = status === "done";
  const anchorId = temporary ? `temporary-action:${temporary.id}` : `action:${action!.id}`;
  const actionId = anchorId;
  const rowActive = handlers.activeActionId === actionId || isRowActionOpen(handlers.openActionId, actionId);
  const dropClass = action
    ? dropTargetClass(handlers.dragDrop.dropTarget, [
        { type: "action", actionId: action.id },
        { type: "actionSubActions", actionId: action.id },
      ])
    : dropTargetClass(handlers.dragDrop.dropTarget, [{ type: "objectiveActions", objectiveId: temporary!.objectiveId }]);
  const disabled = temporary?.status === "submitting";
  const title = temporary ? temporary.title || placeholderTitle : action!.title;
  const statusLabel = temporary
    ? temporary.status === "submitting"
      ? "保存中"
      : temporary.status === "idle"
        ? "待创建"
        : "草稿"
    : null;

  return (
    <div className="relative">
      <div
        className={clsx(
          "orf-task-row orf-challenge-row orf-challenge-row-action orf-row-depth-1 group relative grid items-center px-5",
          rowActive && "orf-row-active",
          action && handlers.dragDrop.dragItem?.type === "action" && handlers.dragDrop.dragItem.id === action.id && "orf-row-dragging",
          dropClass,
        )}
        data-challenge-row-target={anchorId}
        onDoubleClick={(event) => {
          if (!disabled) handleRowDoubleClick(event, target, handlers.onEditTarget);
        }}
        onDragLeave={(event) => handleRowDragLeave(event, handlers.dragDrop)}
        onDragOver={(event) =>
          handleRowDragOver(
            event,
            handlers.dragDrop,
            action ? actionDropTargetForEvent(handlers.dragDrop.dragItem, action, event) : objectiveActionsDropTargetForEvent(handlers.dragDrop.dragItem, temporary!.objectiveId),
          )
        }
        onDrop={(event) =>
          handleRowDrop(
            event,
            handlers.dragDrop,
            action ? actionDropTargetForEvent(handlers.dragDrop.dragItem, action, event) : objectiveActionsDropTargetForEvent(handlers.dragDrop.dragItem, temporary!.objectiveId),
          )
        }
        onPointerEnter={() => handlers.onActiveActionChange(actionId)}
        onPointerLeave={() => {
          if (handlers.activeActionId === actionId) handlers.onActiveActionChange(null);
        }}
      >
        {!disabled && (
          <ChallengeRowActions
            actionId={actionId}
            activeActionId={handlers.activeActionId}
            addLabel={action && handlers.canMutateWorkItems(action.linkedObjectiveId) ? "新增子行动项" : null}
            dragItem={action && handlers.canMutateWorkItems(action.linkedObjectiveId) ? { type: "action", id: action.id, objectiveId: action.linkedObjectiveId } : undefined}
            left={rowActionLeft.action}
            onAction={(rowAction) => handlers.onActionRowAction(rowAction, target)}
            onActiveActionChange={handlers.onActiveActionChange}
            onAdd={() => {
              if (action) handlers.onAddSubAction(action.id);
            }}
            onDragEnd={handlers.dragDrop.onDragEnd}
            onDragStart={handlers.dragDrop.onDragStart}
            onOpenActionChange={handlers.onOpenActionChange}
            openActionId={handlers.openActionId}
          />
        )}
        {action && action.checklist.length > 0 && (
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
            {action ? <CompletionCheckbox checked={complete} onChange={(checked) => handlers.onActionDoneChange(action.id, checked)} /> : <CompletionCircleIcon checked={false} />}
          </span>
          {isSameTarget(handlers.editingTarget, target) ? (
            <InlineTitleEditor
              ariaLabel="编辑行动项标题"
              className="orf-task-title font-medium"
              onCancel={handlers.onCancelEdit}
              onDraftChange={temporary ? handlers.onTemporaryChildTitleChange : undefined}
              onSubmit={(title) => handlers.onSaveTitle(target, title)}
              value={temporary ? temporary.title : action!.title}
            />
          ) : (
            <div className={clsx("orf-task-title truncate font-medium", complete ? "text-[#98a2b3] line-through" : status === "active" ? "text-[#0d7df2]" : temporary ? "text-[#475467]" : "text-[#1d2939]")}>{title}</div>
          )}
          {action && <CommentCountBadge count={commentCountFor(handlers.commentCounts, "task", action.id)} onClick={() => handlers.onActionRowAction("comment", target)} />}
        </HierarchyCell>
        <EmptySlot />
        <EmptySlot />
        {temporary ? <StatusChip tone="open">{statusLabel}</StatusChip> : <EmptySlot />}
        <EmptySlot />
        <TimeValue icon={Clock3} value={action?.updatedAt || "未设置"} />
        <EmptySlot />
      </div>

      {action && open &&
        subActionRows(action.checklist, temporarySubtask).map((subActionRow) => (
          <SubActionRow
            key={subActionRow.persistence === "persisted" ? subActionRow.item.id : subActionRow.temporary.id}
            action={action}
            handlers={handlers}
            parentAnchorId={anchorId}
            row={subActionRow}
          />
        ))}
    </div>
  );
}

function subActionRows(items: TaskChecklistItem[], temporarySubtask: TemporaryChildRow | null): SubActionTreeRow[] {
  if (!temporarySubtask) {
    return items.map((item, itemIndex) => ({ item, itemIndex, persistence: "persisted" }));
  }

  const rows: SubActionTreeRow[] = [];
  let inserted = false;
  items.forEach((item, itemIndex) => {
    rows.push({ item, itemIndex, persistence: "persisted" });
    if (temporarySubtask.afterItemId === item.id) {
      rows.push({ persistence: "temporary", placeholderTitle: "新增子行动项", temporary: temporarySubtask });
      inserted = true;
    }
  });
  if (!inserted) {
    rows.push({ persistence: "temporary", placeholderTitle: "新增子行动项", temporary: temporarySubtask });
  }
  return rows;
}

function SubActionRow({
  action,
  handlers,
  parentAnchorId,
  row,
}: {
  action: Task;
  handlers: RowHandlers;
  parentAnchorId: string;
  row: SubActionTreeRow;
}) {
  const temporary = row.persistence === "temporary" ? row.temporary : null;
  const item = row.persistence === "persisted" ? row.item : null;
  const itemIndex = row.persistence === "persisted" ? row.itemIndex : -1;
  const target: ChallengeTarget = temporary
    ? temporaryChildTarget(temporary)
    : {
        type: "subAction",
        id: item!.id,
        title: item!.label,
        actionId: action.id,
        objectiveId: action.linkedObjectiveId,
      };
  const status = item ? subActionVisualStatus(action, item, itemIndex) : "todo";
  const complete = status === "done";
  const actionId = temporary ? `temporary-subtask:${temporary.id}` : `subAction:${action.id}:${item!.id}`;
  const anchorId = temporary ? `temporary-subtask:${temporary.id}` : `subAction:${item!.id}`;
  const rowActive = handlers.activeActionId === actionId || isRowActionOpen(handlers.openActionId, actionId);
  const dropClass = item ? dropTargetClass(handlers.dragDrop.dropTarget, [{ type: "subAction", actionId: action.id, itemId: item.id }]) : "";
  const disabled = temporary?.status === "submitting";
  const title = temporary ? temporary.title || "新增子行动项" : item!.label;

  return (
    <div
      className={clsx(
        "orf-subtask-row orf-challenge-row orf-challenge-row-action orf-row-depth-2 group relative grid items-center px-5",
        rowActive && "orf-row-active",
        item && handlers.dragDrop.dragItem?.type === "subAction" && handlers.dragDrop.dragItem.id === item.id && "orf-row-dragging",
        dropClass,
      )}
      data-challenge-row-target={anchorId}
      onDoubleClick={(event) => {
        if (!disabled) handleRowDoubleClick(event, target, handlers.onEditTarget);
      }}
      onDragLeave={item ? (event) => handleRowDragLeave(event, handlers.dragDrop) : undefined}
      onDragOver={item ? (event) => handleRowDragOver(event, handlers.dragDrop, subActionDropTargetForEvent(handlers.dragDrop.dragItem, action, item, event)) : undefined}
      onDrop={item ? (event) => handleRowDrop(event, handlers.dragDrop, subActionDropTargetForEvent(handlers.dragDrop.dragItem, action, item, event)) : undefined}
      onPointerEnter={() => handlers.onActiveActionChange(actionId)}
      onPointerLeave={() => {
        if (handlers.activeActionId === actionId) handlers.onActiveActionChange(null);
      }}
    >
      {!disabled && (
        <ChallengeRowActions
          actionId={actionId}
          activeActionId={handlers.activeActionId}
          dragItem={item && handlers.canMutateWorkItems(action.linkedObjectiveId) ? { type: "subAction", id: item.id, actionId: action.id } : undefined}
          left={rowActionLeft.subAction}
          onAction={(rowAction) => handlers.onActionRowAction(rowAction, target)}
          onActiveActionChange={handlers.onActiveActionChange}
          onDragEnd={handlers.dragDrop.onDragEnd}
          onDragStart={handlers.dragDrop.onDragStart}
          onOpenActionChange={handlers.onOpenActionChange}
          openActionId={handlers.openActionId}
        />
      )}
      <HierarchyCell depth={2}>
        <span
          className="flex h-5 w-5 shrink-0 items-center justify-center"
          data-hierarchy-anchor={anchorId}
          data-hierarchy-branch-end-offset="0"
          data-hierarchy-branch-target={anchorId}
          data-hierarchy-parent={parentAnchorId}
        >
            {item ? <CompletionCheckbox checked={complete} onChange={(checked) => handlers.onSubActionDoneChange(action.id, item.id, checked)} /> : <CompletionCircleIcon checked={false} />}
          </span>
        {isSameTarget(handlers.editingTarget, target) ? (
          <InlineTitleEditor
            ariaLabel="编辑子行动项标题"
            className="orf-subtask-title font-medium"
            onCancel={handlers.onCancelEdit}
            onDraftChange={temporary ? handlers.onTemporaryChildTitleChange : undefined}
            onSubmit={(title) => handlers.onSaveTitle(target, title)}
            value={temporary ? temporary.title : item!.label}
          />
        ) : (
          <div className={clsx("orf-subtask-title truncate font-medium", complete ? "text-[#98a2b3] line-through" : status === "active" ? "text-[#0d7df2]" : temporary ? "text-[#475467]" : "text-[#344054]")}>{title}</div>
        )}
        {item && <CommentCountBadge count={commentCountFor(handlers.commentCounts, "subtask", item.id)} onClick={() => handlers.onActionRowAction("comment", target)} />}
      </HierarchyCell>
      <EmptySlot />
      <EmptySlot />
      {temporary ? <StatusChip tone="open">{temporary.status === "submitting" ? "保存中" : temporary.status === "idle" ? "待创建" : "草稿"}</StatusChip> : <EmptySlot />}
      <EmptySlot />
      <TimeValue icon={Clock3} value={item?.updatedAt || action.updatedAt || "未设置"} />
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
      <span className="orf-progress-value-label w-9 text-right font-bold text-[#344054]">{bounded}%</span>
    </div>
  );
}

function ObjectiveDeadlineCell({
  editState,
  objective,
  onSave,
  onUnavailable,
}: {
  editState: ObjectiveDeadlineEditState;
  objective: ObjectiveNode["objective"];
  onSave: (objectiveId: string, finalDueAt: string) => Promise<boolean>;
  onUnavailable: (objective: ObjectiveNode["objective"]) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(objective.finalDueAt);
  const [isSaving, setIsSaving] = useState(false);
  const minimumValue = minimumObjectiveDeadlineValue(objective);
  const canEdit = editState.status === "editable";

  useEffect(() => {
    if (!isEditing) setValue(objective.finalDueAt);
  }, [isEditing, objective.finalDueAt]);

  const saveSelectedDate = async (nextValue: string) => {
    if (!nextValue || isSaving) return;
    setValue(nextValue);

    setIsSaving(true);
    try {
      const saved = await onSave(objective.id, nextValue);
      if (saved) setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  if (canEdit && isEditing) {
    return (
      <div
        className="orf-objective-deadline-editor"
        data-no-row-edit="true"
        onDoubleClick={(event) => event.stopPropagation()}
      >
        <input
          aria-label="目标截止日期"
          autoFocus
          className="orf-objective-deadline-input"
          disabled={isSaving}
          min={minimumValue}
          onChange={(event) => void saveSelectedDate(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setIsEditing(false);
          }}
          type="date"
          value={value}
        />
      </div>
    );
  }

  return (
    <button
      className={clsx("orf-objective-deadline-display", canEdit ? "orf-objective-deadline-display-editable" : "orf-objective-deadline-display-blocked")}
      data-no-row-edit="true"
      onClick={() => {
        if (canEdit) {
          setIsEditing(true);
          return;
        }
        onUnavailable(objective);
      }}
      onDoubleClick={(event) => event.stopPropagation()}
      title={objectiveDeadlineTitle(editState)}
      type="button"
    >
      <DateStack primary={objective.finalDueAt || "未设置"} />
    </button>
  );
}

function objectiveDeadlineTitle(editState: ObjectiveDeadlineEditState) {
  if (editState.status === "editable") {
    return editState.mode === "extendFrozen" ? "点击延后冻结目标截止日期" : "点击修改目标截止日期";
  }

  if (editState.reason === "noPermission") {
    return "只有指挥官可以修改截止日期";
  }

  if (editState.reason === "lifecycleLocked") {
    return "当前状态不允许修改截止日期";
  }

  return "目标不可用，不能修改截止日期";
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
  if (names.length === 0) return <span className="orf-avatar-stack font-medium text-[#98a2b3]">未分配</span>;

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
