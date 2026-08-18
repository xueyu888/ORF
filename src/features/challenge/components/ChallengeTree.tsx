import { clsx } from "clsx";
import { CalendarDays, CheckCircle2, Clock3, FolderKanban, MessageSquare, Plus, Send, Trash2, UserPlus, type LucideIcon } from "lucide-react";
import { createPortal } from "react-dom";
import type { CSSProperties, FormEvent, MouseEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { DatePicker } from "../../../components/DatePicker";
import { useConfirmDialog } from "../../../components/ConfirmDialog";
import { HIERARCHY_TREE_METRICS, HierarchyCell, HierarchyRootCell, HierarchyTreeOverlay } from "../../../components/OrfHierarchyTree";
import { CompletionCircleIcon, MetricSquareIcon, ObjectiveFlagIcon, type MetricIconTone } from "../../../components/OrfIconAssets";
import { UserAvatar } from "../../../components/UserAvatar";
import { Button, IconButton, actionButtonClassName } from "../../../components/ui";
import {
  canRequestObjectiveAlignment,
  isOpenObjectiveAlignmentRequest,
  latestOpenObjectiveAlignmentRequest,
  objectiveAlignmentNeedsWorkActionLabel,
  objectiveAlignmentNeedsWorkFeedback,
  objectiveAlignmentRequestActionLabel,
  objectiveAlignmentRequestKindLabel,
  objectiveAlignmentRequestStatusLabel,
} from "../../../domain/orfAlignment";
import { minimumObjectiveDeadlineValue, type ObjectiveDeadlineEditState } from "../../../domain/orfDeadline";
import {
  canPublishObjectiveByFlow,
  canReviewObjectiveChallengeApplications,
  isObjectiveReestimatingByFlow,
  objectiveFreezeReadinessAfterReestimate,
  shouldRenderObjectiveAsFrozen,
} from "../../../domain/orfLifecycle";
import { objectiveChallengerUserIds } from "../../../domain/orfObjectiveParticipants";
import { canEditObjectiveBasePointsByFlow, objectiveBasePointsLabel } from "../../../domain/orfSettlement";
import type {
  ObjectiveAlignmentRequest,
  ObjectiveAlignmentRequestKind,
  ObjectiveAlignmentRequestStatus,
  ObjectiveSettlementEvent,
  ObjectiveTrialReview,
  OrfProject,
  OrfUser,
  Task,
  TaskChecklistItem,
} from "../../../types/orf";
import { deadlineRemainingTime, formatDateTimeMinute, reestimateWindowRemainingTime, remainingTime, type RelativeTime } from "../model/challengeDates";
import {
  actionDropTargetForEvent,
  bountyDropTargetForEvent,
  dropTargetClass,
  handleRowDragLeave,
  handleRowDragOver,
  handleRowDrop,
  objectiveActionsDropTargetForEvent,
  projectDropTargetForEvent,
  subActionDropTargetForEvent,
} from "../model/challengeDragDrop";
import { commentCountFor } from "../model/challengeComments";
import { objectiveFreezeUnavailableMessage, workbenchActionForObjective } from "../model/orfFlowCapabilities";
import { actionVisualStatus, bountyStatusLabel, objectiveComplete, objectiveStatusLabel, objectiveStatusTone, subActionVisualStatus } from "../model/challengeStatus";
import { childCreationDraftId, childCreationTarget, type ChildCreationTemporaryRow } from "../model/childCreationSession";
import { groupChallengeGroupsByProject, unassignedObjectiveProjectName, type ObjectiveProjectGroup } from "../model/projectGroups";
import type { TitleSubmissionContext } from "../model/titleSubmission";
import type { BountyNode, ChallengeRowAction, ChallengeScope, ChallengeTarget, DragDropController, ObjectiveNode } from "../model/types";
import { ChallengeRowActions, DisclosureAction, rowActionLeft, type ChallengeRowMenuItem } from "./ChallengeRowActions";
import { handleRowDoubleClick, InlineTitleEditor, isSameTarget } from "./InlineTitleEditor";

type RowHandlers = {
  activeActionId: string | null;
  alignmentRequests: ObjectiveAlignmentRequest[];
  collapsedActionIds: Set<string>;
  collapsedBountyIds: Set<string>;
  commentCounts: Map<string, number>;
  temporaryChildRow: ChildCreationTemporaryRow | null;
  dragDrop: DragDropController;
  editingTarget: ChallengeTarget | null;
  trialReviews: ObjectiveTrialReview[];
  canManageFlow: boolean;
  notify: (message: string) => void;
  canEditTargetTitle: (target: ChallengeTarget) => boolean;
  peerReviewActionLabel: (objectiveId: string) => string | null;
  settlementEventsForObjective: (objectiveId: string) => readonly ObjectiveSettlementEvent[];
  today: string;
  objectiveDeadlineEditState: (objective: ObjectiveNode["objective"]) => ObjectiveDeadlineEditState;
  canMutateMetrics: (objectiveId: string) => boolean;
  canToggleMetricCompletion: (objectiveId: string) => boolean;
  canMutateWorkItems: (objectiveId: string) => boolean;
  currentUser: OrfUser | null;
  draftObjectiveId?: string;
  canCreateObjective: boolean;
  canManageProjects: boolean;
  metricActionLabel: (objective: ObjectiveNode["objective"]) => string | null;
  canPublishObjective: (objective: ObjectiveNode["objective"]) => boolean;
  canRecruitObjective: (objective: ObjectiveNode["objective"]) => boolean;
  canReinforceObjective: (objective: ObjectiveNode["objective"]) => boolean;
  onActionDoneChange: (actionId: string, done: boolean) => void;
  onActionRowAction: (action: ChallengeRowAction, target: ChallengeTarget) => void;
  onActiveActionChange: (id: string | null) => void;
  onAddAction: (objectiveId: string) => void;
  onAddBounty: (objectiveId: string) => void;
  onAddObjective: (projectId: string | null) => void;
  onAddSubAction: (actionId: string, afterItemId?: string) => void;
  onApproveApplication: (objectiveId: string, applicationId: string) => Promise<boolean>;
  onCancelEdit: () => void;
  onTemporaryChildTitleChange: (title: string) => void;
  onDraftTitleChange: (title: string) => void;
  onEditTarget: (target: ChallengeTarget) => void;
  onFreezeObjective: (objectiveId: string) => Promise<boolean>;
  onMetricCompletionChange: (resultId: string, completed: boolean) => void;
  onRequestAlignment: (objectiveId: string, input: { kind: ObjectiveAlignmentRequestKind; note?: string | null }) => Promise<boolean>;
  onReviewAlignment: (
    objectiveId: string,
    requestId: string,
    input: {
      status: Extract<ObjectiveAlignmentRequestStatus, "completed" | "needsWork">;
      commanderFeedback?: string | null;
      confirmationDueAt?: string | null;
    },
  ) => Promise<boolean>;
  onOpenActionChange: (id: string | null) => void;
  onPublishObjective: (objectiveId: string) => Promise<boolean>;
  onRecruitObjective: (objectiveId: string) => void;
  onReinforceObjective: (objectiveId: string) => void;
  onRejectApplication: (objectiveId: string, applicationId: string) => Promise<boolean>;
  onCreateProject: (name: string) => Promise<OrfProject | null>;
  onDeleteProject: (projectId: string) => Promise<boolean>;
  onSaveObjectiveDeadline: (objectiveId: string, finalDueAt: string) => Promise<boolean>;
  onSaveObjectiveBasePoints: (objectiveId: string, objectiveBasePoints: number) => Promise<boolean>;
  onSetObjectiveProject: (objectiveId: string, projectId: string | null) => Promise<boolean>;
  onUnavailableObjectiveDeadline: (objective: ObjectiveNode["objective"]) => void;
  onSelectMetric: (target: Extract<ChallengeTarget, { type: "bounty" }>) => void;
  onUnavailableMetricEdit: (objectiveId: string) => void;
  onSaveTitle: (target: ChallengeTarget, title: string, context: TitleSubmissionContext) => boolean | void;
  onSubActionDoneChange: (actionId: string, itemId: string, done: boolean) => void;
  onToggleAction: (actionId: string) => void;
  onToggleBounty: (bountyId: string) => void;
  openActionId: string | null;
  selectedMetricId: string | null;
};

export function ChallengeTree({
  emptyText,
  groups,
  handlers,
  now,
  projects,
  scope,
  visibleProjects,
}: {
  emptyText: string;
  groups: ObjectiveNode[];
  handlers: RowHandlers;
  now: Date;
  projects: OrfProject[];
  scope: ChallengeScope;
  visibleProjects: OrfProject[];
}) {
  const projectGroups = groupChallengeGroupsByProject(groups, visibleProjects);

  return (
    <div className="orf-project-list grid gap-5">
      {projectGroups.map((project, index) => {
        const hasOpenRowMenu = project.objectives.some((group) => objectivePanelHasOpenRowMenu(group, handlers.openActionId));

        return (
          <div
            key={project.id}
            className={clsx(
              "orf-project-section",
              handlers.dragDrop.dragItem?.type === "objective" && dropTargetClass(handlers.dragDrop.dropTarget, [{ type: "project", projectId: project.projectId }]),
            )}
            data-has-open-row-menu={hasOpenRowMenu ? "true" : undefined}
            data-project-group-id={project.id}
            id={projectSectionDomId(project.id)}
            style={projectAccentStyle(project, index)}
            onDragLeave={(event) => handleRowDragLeave(event, handlers.dragDrop)}
            onDragOver={(event) => handleRowDragOver(event, handlers.dragDrop, projectDropTargetForEvent(handlers.dragDrop.dragItem, project.projectId))}
            onDrop={(event) => handleRowDrop(event, handlers.dragDrop, projectDropTargetForEvent(handlers.dragDrop.dragItem, project.projectId))}
          >
            <ProjectHeader
              canCreateObjective={handlers.canCreateObjective}
              canManageProjects={handlers.canManageProjects}
              onAddObjective={handlers.onAddObjective}
              onDeleteProject={handlers.onDeleteProject}
              project={project}
            />
            <div className="orf-project-body grid gap-3">
              {project.objectives.length > 0 ? (
                project.objectives.map((group) => (
                  <ObjectivePanel
                    key={group.objective.id}
                    group={group}
                    handlers={handlers}
                    now={now}
                    projects={projects}
                    scope={scope}
                  />
                ))
              ) : (
                <div className="orf-project-empty">{project.isUnassigned ? "当前没有未归属目标。" : "当前项目还没有目标。"}</div>
              )}
            </div>
          </div>
        );
      })}
      {groups.length === 0 && visibleProjects.length === 0 && <div className="orf-card orf-card-padding text-center text-sm orf-text-secondary">{emptyText}</div>}
    </div>
  );
}

function ProjectHeader({
  canCreateObjective,
  canManageProjects,
  onAddObjective,
  onDeleteProject,
  project,
}: {
  canCreateObjective: boolean;
  canManageProjects: boolean;
  onAddObjective: (projectId: string | null) => void;
  onDeleteProject: (projectId: string) => Promise<boolean>;
  project: ObjectiveProjectGroup;
}) {
  const confirm = useConfirmDialog();
  const handleDeleteProject = async () => {
    if (!project.projectId || project.isUnassigned) return;
    const message =
      project.objectiveCount > 0
        ? `删除项目「${project.name}」？项目下 ${project.objectiveCount} 个目标不会删除，会移到“未归属目标”。`
        : `删除项目「${project.name}」？`;
    if (!await confirm({
      title: "删除项目",
      description: message,
      confirmLabel: "删除项目",
      tone: "danger",
    })) return;
    void onDeleteProject(project.projectId);
  };

  return (
    <div className="orf-project-header">
      <div className="orf-project-heading min-w-0">
        <FolderKanban className="orf-project-heading-icon h-4 w-4" aria-hidden="true" />
        <h2 className="orf-project-title">{project.name}</h2>
        <span className="orf-project-count">{project.objectiveCount} 目标</span>
      </div>
      <div className="orf-project-header-actions">
        {canManageProjects && !project.isUnassigned && project.projectId && (
          <IconButton
            icon={Trash2}
            label={`删除项目${project.name}`}
            size="sm"
            variant="danger"
            type="button"
            onClick={handleDeleteProject}
          />
        )}
        {canCreateObjective && (
          <IconButton
            icon={Plus}
            label={project.isUnassigned ? "新增未归属目标" : `在${project.name}中新增目标`}
            size="sm"
            variant="secondary"
            type="button"
            onClick={() => onAddObjective(project.projectId)}
          />
        )}
      </div>
    </div>
  );
}

function projectSectionDomId(projectId: string) {
  return `orf-project-${encodeURIComponent(projectId)}`;
}

function projectAccentStyle(project: ObjectiveProjectGroup, index: number): ProjectAccentStyle {
  const palette = project.isUnassigned
    ? projectAccentPalette.unassigned
    : projectAccentPalette.projects[index % projectAccentPalette.projects.length];

  return {
    "--orf-project-accent": palette.accent,
    "--orf-project-accent-deep": palette.deep,
    "--orf-project-accent-soft": palette.soft,
  } as ProjectAccentStyle;
}

type ProjectAccentStyle = CSSProperties & {
  "--orf-project-accent": string;
  "--orf-project-accent-deep": string;
  "--orf-project-accent-soft": string;
};

const projectAccentPalette = {
  projects: [
    { accent: "47, 140, 195", deep: "38, 74, 112", soft: "219, 235, 244" },
    { accent: "185, 138, 56", deep: "96, 78, 52", soft: "238, 226, 204" },
    { accent: "69, 184, 191", deep: "43, 103, 118", soft: "218, 238, 235" },
    { accent: "168, 139, 221", deep: "82, 75, 132", soft: "231, 224, 242" },
  ],
  unassigned: { accent: "111, 126, 146", deep: "74, 86, 105", soft: "232, 237, 243" },
} as const;

function ObjectivePanel({
  group,
  handlers,
  now,
  projects,
  scope,
}: {
  group: ObjectiveNode;
  handlers: RowHandlers;
  now: Date;
  projects: OrfProject[];
  scope: ChallengeScope;
}) {
  const target: ChallengeTarget = { type: "objective", id: group.objective.id, title: group.objective.title };
  const [objectiveElement, setObjectiveElement] = useState<HTMLElement | null>(null);
  const complete = objectiveComplete(group.objective);
  const actionId = `objective:${group.objective.id}`;
  const projectPickerActionId = objectiveProjectPickerActionId(group.objective.id);
  const anchorId = `objective:${group.objective.id}`;
  const rowActive = handlers.activeActionId === actionId || isRowActionOpen(handlers.openActionId, actionId);
  const hasOpenRowMenu = objectivePanelHasOpenRowMenu(group, handlers.openActionId);
  const projectPickerOpen = handlers.openActionId === projectPickerActionId;
  const isDraftObjective = group.objective.id === handlers.draftObjectiveId;
  const isEditingTarget = isSameTarget(handlers.editingTarget, target);
  const draftObjectiveIsSubmitting = isDraftObjective && !isEditingTarget;
  const isFrozen = shouldRenderObjectiveAsFrozen(group.objective);
  const activeTemporaryChild = handlers.temporaryChildRow?.objectiveId === group.objective.id ? handlers.temporaryChildRow : null;
  const metricAddLabel = isDraftObjective ? null : handlers.metricActionLabel(group.objective);
  const canCreateAction = !isDraftObjective && handlers.canMutateWorkItems(group.objective.id);
  const metricTemporaryRow = activeTemporaryChild?.kind === "metric" ? activeTemporaryChild : null;
  const actionTemporaryRow = activeTemporaryChild?.kind === "action" ? activeTemporaryChild : null;
  const hasObjectiveChildren =
    group.bounties.length > 0 ||
    group.actions.length > 0 ||
    Boolean(metricTemporaryRow || actionTemporaryRow);
  const objectiveContentCollapsed = hasObjectiveChildren && handlers.collapsedBountyIds.has(group.objective.id) && !activeTemporaryChild;
  const challengerUserIdSet = new Set(objectiveChallengerUserIds(group.objective));
  const assignedChallengers = avatarStackPeople(group.objective.assignedChallengerProfiles, group.objective.assignedChallengers)
    .filter((person) => !person.userId || !challengerUserIdSet.has(person.userId));
  const pendingApplications = group.objective.challengeApplications.filter((application) => application.status === "pending");
  const objectiveAlignmentRequests = (handlers.alignmentRequests ?? []).filter((request) => request.objectiveId === group.objective.id);
  const openAlignmentRequests = objectiveAlignmentRequests.filter(isOpenObjectiveAlignmentRequest);
  const objectiveResults = group.bounties.map((bounty) => bounty.result);
  const freezeReadiness = objectiveFreezeReadinessAfterReestimate(group.objective, objectiveResults);
  const freezeUnavailableMessage = objectiveFreezeUnavailableMessage(freezeReadiness);
  const statusChip = isDraftObjective ? (
    <StatusChip tone="open">{draftObjectiveIsSubmitting ? "保存中" : "草稿"}</StatusChip>
  ) : (
    <StatusChip tone={objectiveStatusTone(group.objective)}>{objectiveStatusLabel(group.objective)}</StatusChip>
  );
  const workbenchAction = workbenchActionForObjective({
    objective: group.objective,
    currentUser: handlers.currentUser,
    settlementEvents: handlers.settlementEventsForObjective(group.objective.id),
    today: handlers.today,
    trialReviews: handlers.trialReviews,
  });
  const workbenchActionLabel =
    workbenchAction?.kind === "submitPeerReview"
      ? handlers.peerReviewActionLabel(group.objective.id) ?? workbenchAction.label
      : workbenchAction?.label;
  const alignmentAction = isDraftObjective ? null : alignmentActionForObjective(group.objective, handlers.currentUser, objectiveAlignmentRequests);
  const frozenReestimateAction = alignmentAction?.kind === "frozenReestimate" ? alignmentAction : null;
  const headerAlignmentAction = alignmentAction?.kind === "frozenReestimate" ? null : alignmentAction;
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
  const objectiveMenuItems: ChallengeRowMenuItem[] =
    !isDraftObjective && handlers.canManageProjects
      ? [
          {
            id: "move-objective-project",
            icon: FolderKanban,
            label: "移动到项目",
            onAction: () => projectPickerActionId,
          },
        ]
      : [];
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
        {hasObjectiveChildren && (
          <DisclosureAction
            actionId={actionId}
            activeActionId={handlers.activeActionId}
            className="absolute top-1/2 -translate-y-1/2"
            expanded={!objectiveContentCollapsed}
            label={objectiveContentCollapsed ? "展开目标内容" : "折叠目标内容"}
            left={HIERARCHY_TREE_METRICS.disclosureLeftByDepth[1]}
            onActiveActionChange={handlers.onActiveActionChange}
            onOpenActionChange={handlers.onOpenActionChange}
            onToggle={() => handlers.onToggleBounty(group.objective.id)}
            openActionId={handlers.openActionId}
          />
        )}
        <ChallengeRowActions
          actionId={actionId}
          activeActionId={handlers.activeActionId}
          addActions={objectiveAddActions}
          addForceMenu
          dragItem={!isDraftObjective && handlers.canManageProjects ? { type: "objective", id: group.objective.id, projectId: group.objective.projectId ?? null } : undefined}
          extraMenuItems={objectiveMenuItems}
          left={rowActionLeft.objective}
          onAction={(action) => handlers.onActionRowAction(action, target)}
          onActiveActionChange={handlers.onActiveActionChange}
          onDragEnd={handlers.dragDrop.onDragEnd}
          onDragStart={handlers.dragDrop.onDragStart}
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
              onSubmit={(title, context) => handlers.onSaveTitle(target, title, context)}
              value={group.objective.title}
            />
          ) : (
            <EditableTitlePreview
              className={clsx("orf-objective-title min-w-0 truncate font-bold", complete ? "orf-text-muted line-through" : "orf-text-primary")}
              editable={handlers.canEditTargetTitle(target)}
              selected={isEditingTarget}
              title={group.objective.title}
            />
          )}
          <CommentCountBadge count={commentCountFor(handlers.commentCounts, "objective", group.objective.id)} onClick={() => handlers.onActionRowAction("comment", target)} />
          <ObjectiveProjectMenu
            objectiveId={group.objective.id}
            onCreateProject={handlers.onCreateProject}
            onSetObjectiveProject={handlers.onSetObjectiveProject}
            open={projectPickerOpen}
            onOpenChange={(open) => {
              handlers.onActiveActionChange(actionId);
              handlers.onOpenActionChange(open ? projectPickerActionId : null);
            }}
            projectId={group.objective.projectId ?? null}
            projects={projects}
          />
          <ObjectiveBasePointsControl
            canManage={handlers.currentUser?.role === "admin"}
            draft={isDraftObjective}
            notify={handlers.notify}
            objective={group.objective}
            onSave={handlers.onSaveObjectiveBasePoints}
          />
        </HierarchyRootCell>
        <ObjectiveFlowAction disabled={isDraftObjective} freezeReadiness={freezeReadiness} group={group} handlers={handlers} />
        <AvatarStack people={avatarStackPeople(group.objective.challengerProfiles, group.challengers)} />
        {statusChip}
        <ObjectiveTimeSummary deadline={group.deadline} now={now} objective={group.objective} />
        <ObjectiveDeadlineCell
          editState={handlers.objectiveDeadlineEditState(group.objective)}
          objective={group.objective}
          onSave={handlers.onSaveObjectiveDeadline}
          onUnavailable={handlers.onUnavailableObjectiveDeadline}
        />
        <ProgressValue value={group.objective.progress} />
        {workbenchAction ? (
          <Link className={actionButtonClassName({ className: "orf-row-loot-action", size: "sm", variant: "primary" })} to={workbenchAction.to}>
            {workbenchActionLabel}
          </Link>
        ) : null}
        {headerAlignmentAction ? (
          <AlignmentActionButton
            action={headerAlignmentAction}
            objectiveId={group.objective.id}
            onRequestAlignment={handlers.onRequestAlignment}
          />
        ) : null}
      </div>

      {frozenReestimateAction ? (
        <FrozenReestimateRequestStrip
          action={frozenReestimateAction}
          objectiveId={group.objective.id}
          onRequestAlignment={handlers.onRequestAlignment}
        />
      ) : null}

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
                <button type="button" className={actionButtonClassName({ size: "sm", variant: "primary" })} onClick={() => void handlers.onApproveApplication(group.objective.id, application.id)}>
                  通过
                </button>
                <button type="button" className={actionButtonClassName({ size: "sm", variant: "danger" })} onClick={() => void handlers.onRejectApplication(group.objective.id, application.id)}>
                  拒绝
                </button>
              </span>
            </span>
          ))}
        </div>
      )}

      {assignedChallengers.length > 0 && (
        <div className="orf-objective-admin-strip">
          <span className="orf-objective-admin-strip-label">待响应征召</span>
          {assignedChallengers.map((person) => (
            <span key={person.userId ?? person.name} className="orf-objective-application-pill orf-objective-readonly-pill">
              <span className="orf-objective-application-main">
                <span className="font-semibold orf-text-primary">{person.name}</span>
                <span className="orf-objective-application-reason">已征召，等待接受</span>
              </span>
            </span>
          ))}
        </div>
      )}

      {handlers.canManageFlow && openAlignmentRequests.length > 0 && (
        <div className="orf-objective-admin-strip">
          <span className="orf-objective-admin-strip-label">阶段对齐</span>
          {openAlignmentRequests.map((request) => (
            <span key={request.id} className="orf-objective-application-pill">
              <span className="orf-objective-application-main">
                <span className="font-semibold orf-text-primary">{objectiveAlignmentRequestKindLabel(request.kind)}</span>
                <span className="orf-objective-application-reason">
                  {request.requestedBy} · {objectiveAlignmentRequestStatusLabel(request.status)}
                  {request.meetingRoom ? ` · ${request.meetingRoom}` : " · 约时间并定会议室"}
                  {request.note ? ` · ${request.note}` : ""}
                </span>
              </span>
              <span className="orf-objective-application-actions">
                {request.kind === "reestimateCompletion" ? (
                  <button
                    type="button"
                    className={actionButtonClassName({ size: "sm", variant: "primary" })}
                    disabled={freezeReadiness.status !== "ready"}
                    title={freezeReadiness.status === "ready" ? "重估完成并冻结目标" : freezeUnavailableMessage}
                    onClick={() => void handlers.onReviewAlignment(group.objective.id, request.id, { status: "completed" })}
                  >
                    完成并冻结
                  </button>
                ) : request.kind === "frozenReestimate" ? (
                  <FrozenReestimateApprovalControl
                    now={now}
                    objective={group.objective}
                    onReviewAlignment={handlers.onReviewAlignment}
                    request={request}
                  />
                ) : (
                  <Link className={actionButtonClassName({ size: "sm", variant: "primary" })} to={`/tasks/objectives/${group.objective.id}/loot`}>
                    去验收
                  </Link>
                )}
                <button
                  type="button"
                  className={actionButtonClassName({ size: "sm", variant: "danger" })}
                  onClick={() =>
                    void handlers.onReviewAlignment(group.objective.id, request.id, {
                      status: "needsWork",
                      commanderFeedback: objectiveAlignmentNeedsWorkFeedback(request.kind),
                    })
                  }
                >
                  {objectiveAlignmentNeedsWorkActionLabel(request.kind)}
                </button>
              </span>
            </span>
          ))}
        </div>
      )}

      {!objectiveContentCollapsed && (
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
      )}
    </section>
  );
}

function objectivePanelHasOpenRowMenu(group: ObjectiveNode, openActionId: string | null): boolean {
  if (!openActionId) return false;
  if (isRowActionOpen(openActionId, `objective:${group.objective.id}`)) return true;
  if (isRowActionOpen(openActionId, `temporary-metric:${childCreationDraftId("metric", group.objective.id)}`)) return true;
  if (isRowActionOpen(openActionId, `temporary-action:${childCreationDraftId("action", group.objective.id)}`)) return true;

  if (group.bounties.some((bounty) => isRowActionOpen(openActionId, `bounty:${bounty.result.id}`))) {
    return true;
  }

  return group.actions.some((action) => {
    if (isRowActionOpen(openActionId, `action:${action.id}`)) return true;
    if (isRowActionOpen(openActionId, `temporary-subtask:${childCreationDraftId("subtask", action.id)}`)) return true;
    return action.checklist.some((item) => isRowActionOpen(openActionId, `subAction:${action.id}:${item.id}`));
  });
}

function isRowActionOpen(openActionId: string | null, actionId: string) {
  return openActionId === actionId || openActionId === `${actionId}:add` || openActionId === `${actionId}:project`;
}

function objectiveProjectPickerActionId(objectiveId: string) {
  return `objective:${objectiveId}:project`;
}

type AlignmentAction = {
  kind: ObjectiveAlignmentRequestKind;
  label: string;
};

function alignmentActionForObjective(
  objective: ObjectiveNode["objective"],
  currentUser: OrfUser | null,
  requests: ObjectiveAlignmentRequest[],
): AlignmentAction | null {
  const kind =
    objective.flowStatus === "reestimating"
      ? "reestimateCompletion"
      : objective.flowStatus === "submitted"
        ? "acceptance"
        : objective.flowStatus === "frozen"
          ? "frozenReestimate"
          : null;
  if (!kind) return null;

  const existing = latestOpenObjectiveAlignmentRequest(objective.id, kind, requests);
  if (!canRequestObjectiveAlignment(objective, currentUser, kind, existing)) return null;

  return { kind, label: objectiveAlignmentRequestActionLabel(kind) };
}

function AlignmentActionButton({
  action,
  objectiveId,
  onRequestAlignment,
}: {
  action: AlignmentAction;
  objectiveId: string;
  onRequestAlignment: RowHandlers["onRequestAlignment"];
}) {
  return (
    <button
      className={actionButtonClassName({ className: "orf-row-loot-action", size: "sm", variant: "secondary" })}
      type="button"
      title="申请与指挥官对齐，请约时间并定好会议室"
      onClick={() =>
        void onRequestAlignment(objectiveId, {
          kind: action.kind,
          note: "请和指挥官约时间，并定好会议室。",
        })
      }
    >
      {action.label}
    </button>
  );
}

function FrozenReestimateRequestStrip({
  action,
  objectiveId,
  onRequestAlignment,
}: {
  action: AlignmentAction;
  objectiveId: string;
  onRequestAlignment: RowHandlers["onRequestAlignment"];
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const trimmedReason = reason.trim();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!trimmedReason || submitting) return;

    setSubmitting(true);
    try {
      const requested = await onRequestAlignment(objectiveId, {
        kind: action.kind,
        note: trimmedReason,
      });
      if (requested) setReason("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="orf-objective-admin-strip orf-objective-reestimate-request-strip" data-no-row-edit="true">
      <span className="orf-objective-admin-strip-label">重新重估</span>
      <form className="orf-objective-reestimate-request-form" onSubmit={(event) => void submit(event)}>
        <input
          aria-label="重新重估理由"
          className="orf-objective-reestimate-reason-input"
          maxLength={200}
          onChange={(event) => setReason(event.target.value)}
          placeholder="说明需要重新重估的原因"
          type="text"
          value={reason}
        />
        <button
          className={actionButtonClassName({ size: "sm", variant: "secondary" })}
          disabled={!trimmedReason || submitting}
          type="submit"
        >
          {submitting ? "提交中" : objectiveAlignmentRequestActionLabel(action.kind)}
        </button>
      </form>
    </div>
  );
}

function FrozenReestimateApprovalControl({
  now,
  objective,
  onReviewAlignment,
  request,
}: {
  now: Date;
  objective: ObjectiveNode["objective"];
  onReviewAlignment: RowHandlers["onReviewAlignment"];
  request: ObjectiveAlignmentRequest;
}) {
  const [value, setValue] = useState(() => request.confirmationDueAt ? isoToDateTimeLocalInput(request.confirmationDueAt) : defaultFrozenReestimateDueAtInput(objective.finalDueAt, now));
  const max = finalDueAtDateTimeLocalMax(objective.finalDueAt);
  const disabled = !value;

  return (
    <span className="orf-objective-reestimate-approval">
      <input
        className="orf-objective-reestimate-due-input"
        max={max}
        min={dateToDateTimeLocalInput(now)}
        onChange={(event) => setValue(event.target.value)}
        type="datetime-local"
        value={value}
        aria-label="新的重估截止时间"
        title="新的重估截止时间，不能超过目标验收截止时间"
      />
      <button
        type="button"
        className={actionButtonClassName({ size: "sm", variant: "primary" })}
        disabled={disabled}
        title={disabled ? "先设置新的重估截止时间" : "批准并重新进入重估"}
        onClick={() => {
          const confirmationDueAt = dateTimeLocalInputToIso(value);
          void onReviewAlignment(objective.id, request.id, {
            status: "completed",
            confirmationDueAt,
          });
        }}
      >
        批准重开
      </button>
    </span>
  );
}

function padDateTimePart(value: number) {
  return String(value).padStart(2, "0");
}

function dateToDateTimeLocalInput(value: Date) {
  return [
    value.getFullYear(),
    "-",
    padDateTimePart(value.getMonth() + 1),
    "-",
    padDateTimePart(value.getDate()),
    "T",
    padDateTimePart(value.getHours()),
    ":",
    padDateTimePart(value.getMinutes()),
  ].join("");
}

function isoToDateTimeLocalInput(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : dateToDateTimeLocalInput(date);
}

function finalDueAtDateTimeLocalMax(finalDueAt: string | null | undefined) {
  return finalDueAt ? `${finalDueAt}T23:59` : undefined;
}

function defaultFrozenReestimateDueAtInput(finalDueAt: string | null | undefined, now: Date) {
  const maxDate = finalDueAt ? new Date(`${finalDueAt}T23:59:00`) : null;
  if (!maxDate || Number.isNaN(maxDate.getTime()) || maxDate.getTime() <= now.getTime()) return "";

  const proposed = new Date(now.getTime() + 60 * 60 * 1000);
  return dateToDateTimeLocalInput(proposed.getTime() <= maxDate.getTime() ? proposed : maxDate);
}

function dateTimeLocalInputToIso(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

type ObjectiveProjectMenuPosition = {
  left: number;
  maxHeight: number;
  placement: "bottom" | "top";
  top: number;
  width: number;
};

function objectiveProjectMenuPosition(anchor: HTMLElement, menu: HTMLElement | null, projectCount: number): ObjectiveProjectMenuPosition {
  const viewportPadding = 12;
  const gap = 8;
  const anchorRect = anchor.getBoundingClientRect();
  const width = Math.max(188, Math.min(260, window.innerWidth - viewportPadding * 2));
  const fallbackHeight = Math.min(360, Math.max(156, (projectCount + 1) * 36 + 54));
  const popoverHeight = menu?.offsetHeight ?? fallbackHeight;
  const belowTop = anchorRect.bottom + gap;
  const belowSpace = window.innerHeight - belowTop - viewportPadding;
  const aboveSpace = anchorRect.top - gap - viewportPadding;
  const placement = belowSpace < Math.min(popoverHeight, 180) && aboveSpace > belowSpace ? "top" : "bottom";
  const maxHeight = Math.max(156, Math.min(360, placement === "top" ? aboveSpace : belowSpace));
  const top =
    placement === "top"
      ? Math.max(viewportPadding, anchorRect.top - gap - Math.min(popoverHeight, maxHeight))
      : Math.min(belowTop, window.innerHeight - viewportPadding - Math.min(popoverHeight, maxHeight));
  const left = Math.min(
    Math.max(viewportPadding, anchorRect.left),
    Math.max(viewportPadding, window.innerWidth - viewportPadding - width),
  );

  return { left, maxHeight, placement, top, width };
}

function ObjectiveProjectMenu({
  objectiveId,
  onCreateProject,
  onOpenChange,
  onSetObjectiveProject,
  open,
  projectId,
  projects,
}: {
  objectiveId: string;
  onCreateProject: (name: string) => Promise<OrfProject | null>;
  onOpenChange: (open: boolean) => void;
  onSetObjectiveProject: (objectiveId: string, projectId: string | null) => Promise<boolean>;
  open: boolean;
  projectId: string | null;
  projects: OrfProject[];
}) {
  const [newProjectName, setNewProjectName] = useState("");
  const [position, setPosition] = useState<ObjectiveProjectMenuPosition | null>(null);
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const menuRef = useRef<HTMLSpanElement | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setPosition(null);
      return undefined;
    }

    const syncPosition = () => {
      if (!anchorRef.current || typeof window === "undefined") return;
      setPosition(objectiveProjectMenuPosition(anchorRef.current, menuRef.current, projects.length));
    };
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (anchorRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      onOpenChange(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };

    syncPosition();
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", syncPosition);
    window.addEventListener("scroll", syncPosition, true);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", syncPosition);
      window.removeEventListener("scroll", syncPosition, true);
    };
  }, [onOpenChange, open, projects.length]);

  const setProject = async (nextProjectId: string | null) => {
    setSaving(true);
    try {
      const ok = await onSetObjectiveProject(objectiveId, nextProjectId);
      if (ok) onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };
  const createAndAssign = async () => {
    const name = newProjectName.trim();
    if (!name) return;
    setSaving(true);
    try {
      const project = await onCreateProject(name);
      if (project) {
        const ok = await onSetObjectiveProject(objectiveId, project.id);
        if (ok) {
          setNewProjectName("");
          onOpenChange(false);
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const menuStyle: CSSProperties = {
    left: position?.left ?? -9999,
    maxHeight: position?.maxHeight,
    top: position?.top ?? -9999,
    width: position?.width,
  };
  const menu = open && typeof document !== "undefined"
    ? createPortal(
        <span
          ref={menuRef}
          className="orf-popover orf-objective-project-menu"
          data-challenge-row-actions="true"
          data-no-row-edit="true"
          data-placement={position?.placement}
          style={menuStyle}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button className="orf-objective-project-menu-item" disabled={saving || projectId === null} type="button" onClick={() => void setProject(null)}>
            移出项目
          </button>
          {projects.map((project) => (
            <button
              key={project.id}
              className="orf-objective-project-menu-item"
              disabled={saving || project.id === projectId}
              type="button"
              onClick={() => void setProject(project.id)}
            >
              {project.name}
            </button>
          ))}
          <span className="orf-objective-project-create">
            <input
              aria-label="新项目名称"
              disabled={saving}
              onChange={(event) => setNewProjectName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void createAndAssign();
                }
              }}
              placeholder="新建并放入"
              value={newProjectName}
            />
            <IconButton icon={Plus} label="新建并放入项目" disabled={saving || !newProjectName.trim()} size="sm" type="button" onClick={() => void createAndAssign()} />
          </span>
        </span>,
        document.body,
      )
    : null;

  return (
    <span ref={anchorRef} className="orf-objective-project-menu-anchor" data-challenge-row-actions="true" data-no-row-edit="true" onPointerDown={(event) => event.stopPropagation()}>
      {menu}
    </span>
  );
}

function ObjectiveFlowAction({
  disabled = false,
  freezeReadiness,
  group,
  handlers,
}: {
  disabled?: boolean;
  freezeReadiness: ReturnType<typeof objectiveFreezeReadinessAfterReestimate>;
  group: ObjectiveNode;
  handlers: RowHandlers;
}) {
  const objective = group.objective;
  if (!handlers.canManageFlow) return <EmptySlot />;

  const actions: ReactNode[] = [];

  if (handlers.canPublishObjective(objective) && canPublishObjectiveByFlow(objective)) {
    actions.push(
      <Button size="sm" variant="secondary" disabled={disabled} type="button" title={disabled ? "完成目标标题后可发布" : "发布到悬赏大厅"} onClick={() => void handlers.onPublishObjective(objective.id)}>
        <Send className="h-3.5 w-3.5" />
        发布
      </Button>,
    );
  }

  if (handlers.canRecruitObjective(objective)) {
    actions.push(
      <Button size="sm" variant="secondary" disabled={disabled} type="button" title={disabled ? "完成目标标题后可征召" : "征召挑战者"} onClick={() => handlers.onRecruitObjective(objective.id)}>
        <UserPlus className="h-3.5 w-3.5" />
        征召
      </Button>,
    );
  }

  if (handlers.canReinforceObjective(objective)) {
    actions.push(
      <Button size="sm" variant="secondary" disabled={disabled} type="button" title={disabled ? "完成目标标题后可加派" : "加派挑战者"} onClick={() => handlers.onReinforceObjective(objective.id)}>
        <UserPlus className="h-3.5 w-3.5" />
        加派
      </Button>,
    );
  }

  if (freezeReadiness.status === "ready") {
    actions.push(
      <Button size="sm" disabled={disabled} type="button" title={disabled ? "完成目标标题后可冻结" : "重估完成并冻结目标"} onClick={() => void handlers.onFreezeObjective(objective.id)}>
        <CheckCircle2 className="h-3.5 w-3.5" />
        冻结
      </Button>,
    );
  }

  if (actions.length === 0) return <EmptySlot />;

  return <div className="orf-flow-action-group">{actions.map((action, index) => <span key={index}>{action}</span>)}</div>;
}

type MetricTreeRow =
  | { bounty: BountyNode; persistence: "persisted" }
  | { persistence: "temporary"; placeholderTitle: string; temporary: ChildCreationTemporaryRow };

type ActionTreeRow =
  | { action: Task; persistence: "persisted" }
  | { persistence: "temporary"; placeholderTitle: string; temporary: ChildCreationTemporaryRow };

type SubActionTreeRow =
  | { item: TaskChecklistItem; itemIndex: number; persistence: "persisted" }
  | { persistence: "temporary"; placeholderTitle: string; temporary: ChildCreationTemporaryRow };

function metricToneForBountyStatus(status: BountyNode["status"]): MetricIconTone {
  if (status === "settled") return "done";
  if (status === "review" || status === "accepted") return "review";
  if (status === "active") return "active";
  return "todo";
}

function MetricCompletionToggle({
  checked,
  onChange,
  title,
  tone,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  tone: MetricIconTone;
}) {
  const label = checked ? `取消标记指标已完成：${title}` : `标记指标已完成：${title}`;

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={checked}
      className="orf-metric-icon-button"
      title={label}
      onClick={(event) => {
        event.stopPropagation();
        onChange(!checked);
      }}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <MetricSquareIcon checked={checked} interactive tone={tone} />
    </button>
  );
}

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
    ? childCreationTarget(temporary)
    : { type: "bounty", id: bounty!.result.id, title: bounty!.result.title, objectiveId: bounty!.result.objectiveId };
  const complete = bounty?.status === "settled";
  const anchorId = temporary ? `temporary-metric:${temporary.id}` : `bounty:${bounty!.result.id}`;
  const actionId = anchorId;
  const rowActive = handlers.activeActionId === actionId || isRowActionOpen(handlers.openActionId, actionId);
  const isEditingTarget = isSameTarget(handlers.editingTarget, target);
  const selected = bounty ? handlers.selectedMetricId === bounty.result.id : false;
  const dropClass = bounty
    ? dropTargetClass(handlers.dragDrop.dropTarget, [
        { type: "bounty", bountyId: bounty.result.id },
      ])
    : "";
  const disabled = temporary?.status === "submitting";
  const title = temporary ? temporary.title || placeholderTitle : bounty!.result.title;
  const statusLabel = temporary ? (temporary.status === "submitting" ? "保存中" : "草稿") : bountyStatusLabel[bounty!.status];
  const metricTone = bounty ? metricToneForBountyStatus(bounty.status) : "todo";
  const metricChecked = Boolean(complete || bounty?.result.executionCompleted);
  const canToggleMetricCompletion = Boolean(bounty && handlers.canToggleMetricCompletion(bounty.result.objectiveId) && !disabled && !complete);

  return (
    <div className="orf-result-row-frame relative">
      <div
        className={clsx(
          "orf-result-row orf-challenge-row orf-challenge-row-bounty orf-row-depth-1 group relative grid items-center px-5",
          rowActive && "orf-row-active",
          selected && "orf-row-selected",
          bounty && handlers.dragDrop.dragItem?.type === "bounty" && handlers.dragDrop.dragItem.id === bounty.result.id && "orf-row-dragging",
          dropClass,
        )}
        data-challenge-row-target={anchorId}
        data-selected={selected ? "true" : undefined}
        data-scope={scope}
        onClick={(event) => {
          if (disabled || !bounty || shouldIgnoreMetricSelection(event)) return;
          handlers.onSelectMetric(target as Extract<ChallengeTarget, { type: "bounty" }>);
        }}
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
            className="orf-hierarchy-anchor-slot flex h-7 w-7 shrink-0 items-center justify-center"
            data-hierarchy-anchor={anchorId}
            data-hierarchy-branch-end-offset="0"
            data-hierarchy-branch-target={anchorId}
            data-hierarchy-parent={parentAnchorId}
          >
            {canToggleMetricCompletion && bounty ? (
              <MetricCompletionToggle
                checked={metricChecked}
                onChange={(checked) => handlers.onMetricCompletionChange(bounty.result.id, checked)}
                title={bounty.result.title}
                tone={metricTone}
              />
            ) : (
              <MetricSquareIcon checked={metricChecked} tone={metricTone} />
            )}
          </span>
          {isEditingTarget ? (
            <InlineTitleEditor
              ariaLabel="编辑指标标题"
              className="orf-result-title font-semibold"
              onCancel={handlers.onCancelEdit}
              onDraftChange={temporary ? handlers.onTemporaryChildTitleChange : undefined}
              onSubmit={(title, context) => handlers.onSaveTitle(target, title, context)}
              value={temporary ? temporary.title : bounty!.result.title}
            />
          ) : (
            <EditableTitlePreview
              className={clsx("orf-result-title truncate font-semibold", complete ? "orf-text-muted line-through" : temporary ? "orf-text-secondary" : "orf-text-primary")}
              editable={handlers.canEditTargetTitle(target)}
              selected={selected || isEditingTarget}
              title={title}
            />
          )}
          {bounty && <CommentCountBadge count={commentCountFor(handlers.commentCounts, "result", bounty.result.id)} onClick={() => handlers.onActionRowAction("comment", target)} />}
        </HierarchyCell>
        <EmptySlot />
        <EmptySlot />
        <StatusChip tone={bounty ? bounty.status : "open"}>{statusLabel}</StatusChip>
        <EmptySlot />
        <TimeValue icon={Clock3} value={bounty ? bounty.updatedAt || "未设置" : "未设置"} />
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
    ? childCreationTarget(temporary)
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
  const statusLabel = temporary ? (temporary.status === "submitting" ? "保存中" : "草稿") : null;
  const definitionContributors = action ? avatarStackPeople(action.definitionContributorProfiles, []) : [];

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
            className="orf-hierarchy-anchor-slot flex h-7 w-7 shrink-0 items-center justify-center"
            data-hierarchy-anchor={anchorId}
            data-hierarchy-branch-end-offset="4"
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
              onSubmit={(title, context) => handlers.onSaveTitle(target, title, context)}
              value={temporary ? temporary.title : action!.title}
            />
          ) : (
            <EditableTitlePreview
              className={clsx("orf-task-title min-w-0 truncate font-medium", complete ? "orf-text-muted line-through" : status === "active" ? "orf-accent-text" : temporary ? "orf-text-secondary" : "orf-text-primary")}
              editable={handlers.canEditTargetTitle(target)}
              selected={isSameTarget(handlers.editingTarget, target)}
              title={title}
            />
          )}
          {action && <CommentCountBadge count={commentCountFor(handlers.commentCounts, "task", action.id)} onClick={() => handlers.onActionRowAction("comment", target)} />}
        </HierarchyCell>
        <EmptySlot />
        {definitionContributors.length > 0 ? <AvatarStack people={definitionContributors} /> : <EmptySlot />}
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

function subActionRows(items: TaskChecklistItem[], temporarySubtask: ChildCreationTemporaryRow | null): SubActionTreeRow[] {
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
    ? childCreationTarget(temporary)
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
          className="orf-hierarchy-anchor-slot flex h-7 w-7 shrink-0 items-center justify-center"
          data-hierarchy-anchor={anchorId}
          data-hierarchy-branch-end-offset="4"
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
            onSubmit={(title, context) => handlers.onSaveTitle(target, title, context)}
            value={temporary ? temporary.title : item!.label}
          />
        ) : (
          <EditableTitlePreview
            className={clsx("orf-subtask-title truncate font-medium", complete ? "orf-text-muted line-through" : status === "active" ? "orf-accent-text" : temporary ? "orf-text-secondary" : "orf-text-secondary")}
            editable={handlers.canEditTargetTitle(target)}
            selected={isSameTarget(handlers.editingTarget, target)}
            title={title}
          />
        )}
        {item && <CommentCountBadge count={commentCountFor(handlers.commentCounts, "subtask", item.id)} onClick={() => handlers.onActionRowAction("comment", target)} />}
      </HierarchyCell>
      <EmptySlot />
      <EmptySlot />
      {temporary ? <StatusChip tone="open">{temporary.status === "submitting" ? "保存中" : "草稿"}</StatusChip> : <EmptySlot />}
      <EmptySlot />
      <TimeValue icon={Clock3} value={item?.updatedAt || action.updatedAt || "未设置"} />
      <EmptySlot />
    </div>
  );
}

function CompletionCheckbox({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button type="button" aria-label={checked ? "标记为未完成" : "标记为已完成"} aria-pressed={checked} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full" onClick={() => onChange(!checked)}>
      <CompletionCircleIcon checked={checked} />
    </button>
  );
}

function CommentCountBadge({ count, onClick }: { count: number; onClick: () => void }) {
  const hasComments = count > 0;
  const label = hasComments ? `打开 ${count} 条评论` : "添加评论";

  return (
    <button
      type="button"
      aria-label={label}
      className="orf-comment-count-badge"
      data-empty={hasComments ? undefined : "true"}
      onClick={(event) => { event.stopPropagation(); onClick(); }}
      title={label}
    >
      <MessageSquare className="h-3.5 w-3.5" />
      {hasComments && <span>{count}</span>}
    </button>
  );
}

function StatusChip({ tone, children }: { tone: "accepted" | "active" | "done" | "open" | "review" | "settled" | "success" | "warning"; children: ReactNode }) {
  const className =
    tone === "settled" || tone === "done" || tone === "success"
      ? "orf-status-chip-done"
      : tone === "review" || tone === "accepted"
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

function EditableTitlePreview({
  className,
  editable,
  selected = false,
  title,
}: {
  className: string;
  editable: boolean;
  selected?: boolean;
  title: string;
}) {
  return (
    <div
      className={clsx("orf-editable-title-preview", className)}
      data-editable={editable ? "true" : undefined}
      data-selected={selected ? "true" : undefined}
      data-title-edit-target="true"
      title={editable ? `${title}\n双击编辑标题` : title}
    >
      {title}
    </div>
  );
}

function shouldIgnoreMetricSelection(event: MouseEvent<HTMLElement>) {
  const target = event.target;
  return target instanceof Element && Boolean(
    target.closest(
      [
        "[data-challenge-row-actions]",
        "[data-challenge-disclosure-action]",
        "[data-no-row-edit]",
        "[data-no-row-select]",
        "button",
        "a",
        "input",
        "textarea",
        "select",
        "[role='button']",
        "[role='menuitem']",
      ].join(","),
    ),
  );
}

function ProgressValue({ value }: { value: number }) {
  const bounded = Math.max(0, Math.min(100, Math.round(value)));

  return (
    <div className="orf-progress-value orf-progress-value-neutral flex items-center gap-2">
      <div className="orf-progress-track h-1.5 w-16 overflow-hidden rounded-full">
        <div className="orf-progress-fill h-full rounded-full" style={{ width: `${bounded}%` }} />
      </div>
      <span className="orf-progress-value-label orf-text-primary w-9 text-right font-semibold">{bounded}%</span>
    </div>
  );
}

function ObjectiveBasePointsControl({
  canManage,
  draft,
  notify,
  objective,
  onSave,
}: {
  canManage: boolean;
  draft: boolean;
  notify: (message: string) => void;
  objective: ObjectiveNode["objective"];
  onSave: (objectiveId: string, objectiveBasePoints: number) => Promise<boolean>;
}) {
  const persistedValue = objective.objectiveBasePoints > 0 ? String(objective.objectiveBasePoints) : "";
  const [value, setValue] = useState(persistedValue);
  const [editing, setEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const lifecycleEditable = canEditObjectiveBasePointsByFlow(objective);
  const canEdit = canManage && !draft && lifecycleEditable;
  const label = objectiveBasePointsLabel(objective);

  useEffect(() => {
    setValue(persistedValue);
    setEditing(false);
    setIsSaving(false);
  }, [objective.id, persistedValue]);

  const unavailableMessage = objectiveBasePointsUnavailableMessage({ canManage, draft, lifecycleEditable });

  const startEditing = () => {
    if (!canEdit) {
      notify(unavailableMessage);
      return;
    }
    setValue(persistedValue);
    setEditing(true);
  };

  const cancelEditing = () => {
    setValue(persistedValue);
    setEditing(false);
  };

  const saveValue = async () => {
    if (!canEdit || isSaving) return;

    const trimmedValue = value.trim();
    if (!trimmedValue) {
      cancelEditing();
      return;
    }

    const nextValue = Number(trimmedValue);
    if (!Number.isInteger(nextValue) || nextValue < 1) {
      notify("目标分数必须是正整数");
      cancelEditing();
      return;
    }
    if (nextValue === objective.objectiveBasePoints) {
      setEditing(false);
      return;
    }

    setIsSaving(true);
    try {
      const saved = await onSave(objective.id, nextValue);
      if (!saved) setValue(persistedValue);
      setEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  if (canEdit && editing) {
    return (
      <form
        className="orf-objective-base-points-editor"
        data-challenge-row-actions="true"
        data-no-row-edit="true"
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          void saveValue();
        }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <input
          aria-label={`目标分数，当前 ${label}`}
          autoFocus
          className="orf-objective-base-points-input"
          disabled={isSaving}
          inputMode="numeric"
          min={1}
          onBlur={() => void saveValue()}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              cancelEditing();
            }
          }}
          pattern="[0-9]*"
          placeholder="待定"
          title="目标分数"
          type="number"
          value={value}
        />
        <span className="orf-objective-base-points-unit">分</span>
      </form>
    );
  }

  return (
    <button
      aria-label={`目标分数 ${label}`}
      className={clsx("orf-objective-base-points-chip", canEdit && "orf-objective-base-points-chip-editable")}
      data-no-row-edit="true"
      onClick={startEditing}
      onDoubleClick={(event) => event.stopPropagation()}
      title={canEdit ? "点击编辑目标分数" : unavailableMessage}
      type="button"
    >
      {label}
    </button>
  );
}

function objectiveBasePointsUnavailableMessage({
  canManage,
  draft,
  lifecycleEditable,
}: {
  canManage: boolean;
  draft: boolean;
  lifecycleEditable: boolean;
}) {
  if (draft) return "请先完成目标标题，再设置目标分数";
  if (!canManage) return "只有指挥官可以修改目标分数";
  if (!lifecycleEditable) return "目标完成结算后，目标分数已锁定";
  return "当前不能修改目标分数";
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
  const [value, setValue] = useState(objective.finalDueAt);
  const [isSaving, setIsSaving] = useState(false);
  const minimumValue = minimumObjectiveDeadlineValue(objective);
  const canEdit = editState.status === "editable";

  useEffect(() => {
    setValue(objective.finalDueAt);
  }, [objective.finalDueAt]);

  const saveSelectedDate = async (nextValue: string) => {
    if (!nextValue || isSaving) return;
    setValue(nextValue);
    if (nextValue === objective.finalDueAt) return;

    setIsSaving(true);
    try {
      const saved = await onSave(objective.id, nextValue);
      if (!saved) setValue(objective.finalDueAt);
    } finally {
      setIsSaving(false);
    }
  };

  if (canEdit) {
    return (
      <DatePicker
        ariaLabel={`修改目标截止日期，当前 ${value || "未设置"}`}
        disabled={isSaving}
        min={minimumValue}
        onChange={(nextValue) => void saveSelectedDate(nextValue)}
        stopPropagation
        title={objectiveDeadlineTitle(editState)}
        triggerClassName="orf-objective-deadline-display orf-objective-deadline-display-editable"
        value={value}
      >
        <DateStack primary={value || "未设置"} />
      </DatePicker>
    );
  }

  return (
    <button
      className={clsx("orf-objective-deadline-display", canEdit ? "orf-objective-deadline-display-editable" : "orf-objective-deadline-display-blocked")}
      data-no-row-edit="true"
      onClick={() => {
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

function ObjectiveTimeSummary({ deadline, now, objective }: { deadline: string; now: Date; objective: ObjectiveNode["objective"] }) {
  const finalRemaining = deadlineRemainingTime(deadline, now);
  const finalRemainingValue = finalRemaining?.value ?? (deadline || "未设置");
  const reestimateRemaining = isObjectiveReestimatingByFlow(objective) ? reestimateWindowRemainingTime(objective.confirmationDueAt, now) : null;
  const startTitle = `开始时间：${objective.acceptedAt ? formatDateTimeMinute(objective.acceptedAt) : "未开始"}`;
  const frozenTitle = `冻结时间：${objective.confirmedAt ? formatDateTimeMinute(objective.confirmedAt) : "未冻结"}`;

  if (!reestimateRemaining) {
    const title = [startTitle, frozenTitle, `最终剩余：${finalRemainingValue}`, `最终截止：${deadline || "未设置"}`].join("\n");
    return <TimeValue icon={Clock3} title={title} value={finalRemainingValue} />;
  }

  const title = [
    startTitle,
    frozenTitle,
    `重估截止：${formatDateTimeMinute(objective.confirmationDueAt)}`,
    `重估窗口：${reestimateRemaining.value}`,
    `最终剩余：${finalRemainingValue}`,
    `最终截止：${deadline || "未设置"}`,
  ].join("\n");
  const finalShortValue = finalRemaining ? compactTimeSummaryLabel("最终", finalRemaining) : "最终 未设置";

  return (
    <span
      aria-label={title.replace(/\n/g, "；")}
      className={clsx("orf-objective-time-summary", reestimateRemaining.overdue && "orf-objective-time-summary-overdue")}
      tabIndex={0}
      title={title}
    >
      <span className="orf-objective-time-icon" aria-hidden="true">
        <Clock3 />
      </span>
      <span className="orf-objective-time-lines">
        <span className="orf-objective-time-line orf-objective-time-primary">{compactTimeSummaryLabel("重估", reestimateRemaining)}</span>
        <span className="orf-objective-time-line orf-objective-time-secondary">{finalShortValue}</span>
      </span>
    </span>
  );
}

function compactTimeSummaryLabel(label: string, time: RelativeTime) {
  return time.overdue ? `${label}超 ${time.compactDuration}` : `${label} ${time.compactDuration}`;
}

function TimeValue({ className, icon: Icon, subtle, title, value }: { className?: string; icon: LucideIcon; subtle?: boolean; title?: string; value: string }) {
  return (
    <span
      aria-label={title ? title.replace(/\n/g, "；") : undefined}
      className={clsx("orf-time-value inline-flex h-7 min-w-0 items-center gap-2 whitespace-nowrap text-sm font-medium", subtle ? "orf-text-muted" : "orf-text-secondary", className)}
      tabIndex={title ? 0 : undefined}
      title={title ?? value}
    >
      <Icon className={clsx("h-4 w-4", subtle ? "orf-text-faint" : "orf-text-muted")} />
      <span className="orf-time-value-text">{value}</span>
    </span>
  );
}

type AvatarStackPopoverPosition = {
  left: number;
  maxHeight: number;
  top: number;
  width: number;
};

function avatarStackPopoverPosition(trigger: HTMLElement): AvatarStackPopoverPosition {
  const padding = 12;
  const gap = 8;
  const rect = trigger.getBoundingClientRect();
  const width = Math.max(160, Math.min(232, window.innerWidth - padding * 2));
  const belowSpace = window.innerHeight - rect.bottom - gap - padding;
  const aboveSpace = rect.top - gap - padding;
  const placeAbove = belowSpace < 132 && aboveSpace > belowSpace;
  const availableHeight = Math.max(132, placeAbove ? aboveSpace : belowSpace);
  const maxHeight = Math.min(280, availableHeight);
  const left = Math.min(Math.max(padding, rect.right - width), Math.max(padding, window.innerWidth - padding - width));
  const top = placeAbove ? Math.max(padding, rect.top - gap - maxHeight) : Math.min(rect.bottom + gap, window.innerHeight - padding - maxHeight);

  return { left, maxHeight, top, width };
}

type AvatarStackPerson = {
  avatarUrl?: string | null;
  name: string;
  userId?: string | null;
};

type AvatarStackProfile = {
  avatarUrl?: string | null;
  name: string;
  userId?: string | null;
};

function avatarStackPeople(profiles: AvatarStackProfile[] | undefined, names: string[]): AvatarStackPerson[] {
  if (profiles && profiles.length > 0) {
    return profiles.map((profile) => ({
      avatarUrl: profile.avatarUrl ?? null,
      name: profile.name,
      userId: profile.userId ?? null,
    }));
  }

  return names.map((name) => ({ name }));
}

function AvatarStack({ people }: { people: AvatarStackPerson[] }) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState<AvatarStackPopoverPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const visiblePeople = people.slice(0, 4);
  const overflowPeople = people.slice(4);

  useEffect(() => {
    if (overflowPeople.length === 0) setPopoverOpen(false);
  }, [overflowPeople.length]);

  useEffect(() => {
    if (!popoverOpen) {
      setPopoverPosition(null);
      return undefined;
    }

    const updatePosition = () => {
      if (!triggerRef.current) return;
      setPopoverPosition(avatarStackPopoverPosition(triggerRef.current));
    };
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (triggerRef.current?.contains(event.target) || popoverRef.current?.contains(event.target)) return;
      setPopoverOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPopoverOpen(false);
    };

    updatePosition();
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [popoverOpen]);

  if (people.length === 0) return <span className="orf-avatar-stack orf-avatar-stack-empty orf-text-muted font-medium">未分配</span>;

  return (
    <div className="orf-avatar-stack" title={people.map((person) => person.name).join("、")}>
      {visiblePeople.map((person, index) => (
        <UserAvatar
          key={`${person.userId ?? person.name}-${index}`}
          avatarUrl={person.avatarUrl ?? null}
          className={clsx("orf-avatar-stack-item", index > 0 && "-ml-2")}
          name={person.name}
          size="sm"
        />
      ))}
      {overflowPeople.length > 0 && (
        <button
          ref={triggerRef}
          type="button"
          className="orf-avatar-overflow-button"
          aria-expanded={popoverOpen}
          aria-label={`查看其余 ${overflowPeople.length} 位参与者`}
          data-no-row-edit="true"
          onClick={(event) => {
            event.stopPropagation();
            setPopoverOpen((current) => !current);
          }}
          onDoubleClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          +{overflowPeople.length}
        </button>
      )}
      {popoverOpen &&
        popoverPosition &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popoverRef}
            className="orf-avatar-stack-popover"
            data-no-row-edit="true"
            style={{
              left: popoverPosition.left,
              maxHeight: popoverPosition.maxHeight,
              top: popoverPosition.top,
              width: popoverPosition.width,
            }}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className="orf-avatar-stack-popover-title">其余参与者</div>
            <div className="orf-avatar-stack-popover-list">
              {overflowPeople.map((person, index) => (
                <div key={`${person.userId ?? person.name}-${index}`} className="orf-avatar-stack-popover-row" title={person.name}>
                  <UserAvatar avatarUrl={person.avatarUrl ?? null} className="orf-avatar-stack-popover-avatar" name={person.name} size="sm" />
                  <span className="orf-avatar-stack-popover-name">{person.name}</span>
                </div>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return <span className="orf-metric-difficulty-badge">{children}</span>;
}

function EmptySlot() {
  return <span className="orf-empty-slot" aria-hidden="true" />;
}
