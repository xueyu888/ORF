import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CommentPanel, type CommentReplyInput } from "./comments/CommentPanel";
import { ChallengeToolbar } from "./components/ChallengeToolbar";
import { ChallengeTree } from "./components/ChallengeTree";
import { TeamDashboard } from "./components/TeamDashboard";
import { canShowFrontend } from "../../config/frontendVisibility";
import { hasPermission } from "../../config/permissions";
import { getMyChallengesData, type TaskManagementData } from "../../state/apiClient";
import { useOrf } from "../../state/OrfProvider";
import type { Objective } from "../../types/orf";
import { localDateString } from "../../utils/date";
import { challengeLinkForTarget } from "./model/challengeLinks";
import { commentCountsByTarget, commentTargetForChallengeTarget } from "./model/challengeComments";
import { canAccessDragItem, canAccessTarget, permissionDeniedMessage, permissionKeyForChallengeAction, resourceForDragItem, resourceForTarget } from "./model/challengePermissions";
import { challengeCycleOptions, filterChallengeGroups, sortChallengeGroups, type ChallengeCycleFilter, type ChallengeStatusFilter } from "./model/challengeFilters";
import { buildChallengeTree } from "./model/challengeTreeModel";
import { deleteConfirmMessage } from "./model/deleteConfirm";
import {
  applyObjectiveOrderAnchor,
  beginObjectiveCreationSession,
  cancelObjectiveCreationSession,
  clearSubmittedObjectiveCreation,
  completeObjectiveCreationDraft,
  draftObjectiveId,
  draftOrderAnchor,
  failObjectiveCreationDraft,
  idleObjectiveCreationSession,
  materializeSubmittedObjectiveCreation,
  objectiveCreationDraftTitle,
  objectiveCreationIsDraftEditing,
  objectiveCreationIsSubmitting,
  objectiveCreationSubmittedObjective,
  objectiveCreationSubmittedOrderAnchor,
  submitObjectiveCreationDraft,
  updateObjectiveCreationDraftTitle,
  type DraftReturnContext,
  type ObjectiveCreationSession,
} from "./model/objectiveCreationSession";
import { canMutateObjectiveWorkItems, canProposeObjectiveMetric, canRecruitObjectiveChallengers, isObjectiveResultLocked, metricCreationActionForObjective } from "./model/orfFlowCapabilities";
import type { ChallengeCommentTarget, ChallengeRowAction, ChallengeScope, ChallengeTarget, DragItem, DropTarget } from "./model/types";
import type { ObjectiveNode } from "./model/types";

function defaultFinalDueAt() {
  const date = new Date();
  date.setDate(date.getDate() + 14);
  return localDateString(date);
}

function defaultCycleLabel() {
  const date = new Date();
  const quarter = Math.floor(date.getMonth() / 3) + 1;
  return `${date.getFullYear()} Q${quarter}`;
}

function draftObjective(title: string): Objective {
  const today = localDateString(new Date());
  const finalDueAt = defaultFinalDueAt();
  return {
    id: draftObjectiveId,
    title,
    description: "",
    whyItMatters: "",
    cycle: defaultCycleLabel(),
    stage: "goalSetting",
    flowStatus: "candidate",
    status: "Draft",
    confidence: 50,
    progress: 0,
    boundary: "",
    successDefinition: "",
    resultIds: [],
    feedbackIds: [],
    taskIds: [],
    finalDueAt,
    challengers: [],
    assignedChallengers: [],
    challengeApplications: [],
    acceptedAt: null,
    confirmationDueAt: null,
    confirmedAt: null,
    lootSubmittedAt: null,
    acceptedResult: null,
    completionMultiplier: null,
    objectiveBasePoints: 0,
    objectiveSettlementPoints: null,
    createdAt: today,
    updatedAt: today,
  };
}

function draftObjectiveNode(title: string): ObjectiveNode {
  return objectiveNode(draftObjective(title));
}

function objectiveNode(objective: Objective): ObjectiveNode {
  return {
    actions: [],
    bounties: [],
    challengers: objective.challengers,
    deadline: objective.finalDueAt,
    objective,
  };
}

export function ChallengePlanPage() {
  const {
    addComment,
    approveChallengeApplication,
    createTaskChecklistItem,
    currentUser,
    deleteCommentMessage,
    deleteObjective,
    deleteResult,
    deleteTask,
    deleteTaskChecklistItem,
    moveResult,
    moveTask,
    moveTaskChecklistItem,
    notify,
    openModal,
    publishObjective,
    freezeObjective,
    createObjective,
    loadCommentMentionableUsers,
    rejectChallengeApplication,
    setTaskCompletion,
    state,
    updateCommentMessage,
    updateObjectiveTitle,
    updateResultTitle,
    updateTaskChecklistItem,
    updateTaskChecklistItemLabel,
    updateTaskTitle,
    uploadCommentAttachment,
  } = useOrf();
  const role = currentUser?.role;
  const currentMember = currentUser?.name ?? "User";
  const canShowAllChallenges = canShowFrontend(currentUser, "challenge.scope.all");
  const canCreateObjective = hasPermission(currentUser, state.permissionRules, "objective.create");
  const [searchParams, setSearchParams] = useSearchParams();
  const [scope, setScope] = useState<ChallengeScope>(canShowAllChallenges ? "all" : "mine");
  const [cycleFilter, setCycleFilter] = useState<ChallengeCycleFilter>("all");
  const [statusFilter, setStatusFilter] = useState<ChallengeStatusFilter>("all");
  const [collapsedBountyIds, setCollapsedBountyIds] = useState<Set<string>>(() => new Set());
  const [collapsedActionIds, setCollapsedActionIds] = useState<Set<string>>(() => new Set());
  const [commentTarget, setCommentTarget] = useState<ChallengeCommentTarget | null>(null);
  const [editingTarget, setEditingTarget] = useState<ChallengeTarget | null>(null);
  const [objectiveCreationSession, setObjectiveCreationSession] = useState<ObjectiveCreationSession>(idleObjectiveCreationSession);
  const [activeActionId, setActiveActionId] = useState<string | null>(null);
  const [openActionId, setOpenActionId] = useState<string | null>(null);
  const [dragItem, setDragItem] = useState<DragItem | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [challengeData, setChallengeData] = useState<TaskManagementData | null>(null);
  const now = useMinuteNow();

  useEffect(() => {
    if (!canShowAllChallenges && scope === "all") {
      setScope("mine");
    }
  }, [canShowAllChallenges, scope]);

  useEffect(() => {
    if (!openActionId) return undefined;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenActionId(null);
      }
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [openActionId]);

  const activateRowAction = (id: string | null) => {
    if (id && openActionId && openActionId !== id) {
      setOpenActionId(null);
    }
    setActiveActionId(id);
  };

  const showAll = canShowAllChallenges && scope === "all";
  const loadChallengeData = useCallback(async () => {
    setChallengeData(await getMyChallengesData(showAll ? "all" : "mine"));
  }, [showAll]);

  useEffect(() => {
    void loadChallengeData().catch(() => setChallengeData(null));
  }, [loadChallengeData, state.comments, state.objectives, state.results, state.tasks]);

  const sourceData = challengeData ?? state;
  const challengeState = useMemo(() => ({ ...state, ...sourceData }), [sourceData, state]);
  const draftTitle = objectiveCreationDraftTitle(objectiveCreationSession);
  const draftGroup = useMemo(() => (draftTitle === null ? null : draftObjectiveNode(draftTitle)), [draftTitle]);
  const draftIsEditing = objectiveCreationIsDraftEditing(objectiveCreationSession);
  const draftIsSubmitting = objectiveCreationIsSubmitting(objectiveCreationSession);
  const effectiveEditingTarget = draftIsEditing ? ({ type: "objective", id: draftObjectiveId, title: draftTitle ?? "" } satisfies ChallengeTarget) : editingTarget;
  const visibleObjectiveIds = useMemo(() => {
    if (showAll) return undefined;
    return new Set(challengeState.objectives.filter((objective) => objective.challengers.includes(currentMember)).map((objective) => objective.id));
  }, [challengeState.objectives, currentMember, showAll]);
  const groups = useMemo(
    () =>
      buildChallengeTree(
        {
          evidence: challengeState.evidence,
          feedback: challengeState.feedback,
          objectives: challengeState.objectives,
          results: challengeState.results,
          tasks: challengeState.tasks,
        },
        visibleObjectiveIds,
      ),
    [challengeState.evidence, challengeState.feedback, challengeState.objectives, challengeState.results, challengeState.tasks, visibleObjectiveIds],
  );
  const submittedObjective = objectiveCreationSubmittedObjective(objectiveCreationSession);
  const submittedOrderAnchor = objectiveCreationSubmittedOrderAnchor(objectiveCreationSession);
  const optimisticGroup = useMemo(() => {
    if (!submittedObjective || groups.some((group) => group.objective.id === submittedObjective.id)) return null;
    return objectiveNode(submittedObjective);
  }, [groups, submittedObjective]);
  const displaySourceGroups = useMemo(() => (optimisticGroup ? [optimisticGroup, ...groups] : groups), [groups, optimisticGroup]);
  const cycleOptions = useMemo(() => challengeCycleOptions(displaySourceGroups), [displaySourceGroups]);
  const filteredGroups = useMemo(
    () => sortChallengeGroups(filterChallengeGroups(displaySourceGroups, { cycle: cycleFilter, status: statusFilter })),
    [cycleFilter, displaySourceGroups, statusFilter],
  );
  const sortedDisplayedGroups = useMemo(() => sortChallengeGroups(draftGroup ? [draftGroup, ...filteredGroups] : filteredGroups), [draftGroup, filteredGroups]);
  const displayedGroups = useMemo(
    () => (draftGroup ? sortedDisplayedGroups : applyObjectiveOrderAnchor(sortedDisplayedGroups, submittedOrderAnchor)),
    [draftGroup, submittedOrderAnchor, sortedDisplayedGroups],
  );
  const commentCounts = useMemo(() => commentCountsByTarget(challengeState.comments), [challengeState.comments]);
  const hasActiveFilters = cycleFilter !== "all" || statusFilter !== "all";
  const emptyText = hasActiveFilters
    ? "没有符合筛选条件的挑战目标。"
    : showAll
      ? "当前还没有挑战内容。"
      : "当前没有与你的挑战目标相关的内容。";

  useEffect(() => {
    if (cycleFilter !== "all" && !cycleOptions.includes(cycleFilter)) {
      setCycleFilter("all");
    }
  }, [cycleFilter, cycleOptions]);
  useEffect(() => {
    const objective = objectiveCreationSubmittedObjective(objectiveCreationSession);
    if (!objective) return;
    if (groups.some((group) => group.objective.id === objective.id)) {
      setObjectiveCreationSession(materializeSubmittedObjectiveCreation);
    }
  }, [groups, objectiveCreationSession]);
  const objectiveById = (objectiveId: string) => challengeState.objectives.find((item) => item.id === objectiveId);
  const canMutateMetricForObjective = (objectiveId: string) => !isObjectiveResultLocked(objectiveById(objectiveId));
  const canMutateWorkItemsForObjective = (objectiveId: string) => canMutateObjectiveWorkItems(objectiveById(objectiveId));
  useEffect(() => {
    if (searchParams.get("create") !== "objective") return;

    const next = new URLSearchParams(searchParams);
    next.delete("create");
    setSearchParams(next, { replace: true });

    if (!canCreateObjective) {
      notify("没有新建目标权限");
      return;
    }

    setObjectiveCreationSession((current) => beginObjectiveCreationSession(current, { cycle: cycleFilter, scope, status: statusFilter }));
    setEditingTarget(null);
    if (canShowAllChallenges) setScope("all");
    setCycleFilter("all");
    setStatusFilter("unassigned");
  }, [canCreateObjective, canShowAllChallenges, cycleFilter, notify, scope, searchParams, setSearchParams, statusFilter]);

  const requireTargetPermission = (target: ChallengeTarget, action: "create" | "delete" | "edit") => {
    if (target.type === "bounty" && action === "edit") {
      const objective = challengeState.objectives.find((item) => item.id === target.objectiveId);
      if (isObjectiveResultLocked(objective)) {
        notify("指标已冻结，不能编辑");
        return false;
      }
      if (role === "admin") return true;
      if (objective && canProposeObjectiveMetric(objective, currentMember, now)) return true;
      notify("没有编辑指标权限");
      return false;
    }

    if (target.type === "bounty" && action === "delete" && !canMutateMetricForObjective(target.objectiveId)) {
      notify("指标已冻结，不能删除");
      return false;
    }

    if ((target.type === "action" || target.type === "subAction") && (action === "edit" || action === "delete") && !canMutateWorkItemsForObjective(target.objectiveId)) {
      notify("目标当前阶段不能修改行动项");
      return false;
    }

    if (canAccessTarget(challengeState, role, target, action)) return true;
    const key = permissionKeyForChallengeAction(resourceForTarget(target), action);
    if (key) notify(permissionDeniedMessage(key));
    return false;
  };

  const addBounty = (objectiveId: string) => {
    const objective = challengeState.objectives.find((item) => item.id === objectiveId);
    if (!objective) return;
    const action = metricCreationActionForObjective({
      objective,
      currentUser,
      permissionRules: challengeState.permissionRules,
      now,
    });
    if (!action) {
      notify("没有新增指标权限");
      return;
    }
    openModal({ type: "newResult", objectiveId, source: action.source });
  };

  const addAction = (objectiveId: string) => {
    if (!canMutateWorkItemsForObjective(objectiveId)) {
      notify("目标当前阶段不能新增行动项");
      return;
    }
    openModal({ type: "newTask", objectiveId });
  };

  const addSubAction = (actionId: string, afterItemId?: string) => {
    const action = challengeState.tasks.find((item) => item.id === actionId);
    if (!action) return;
    if (!canMutateWorkItemsForObjective(action.linkedObjectiveId)) {
      notify("目标当前阶段不能新增子行动项");
      return;
    }
    createTaskChecklistItem(actionId, afterItemId);
    setCollapsedActionIds((items) => withoutItem(items, actionId));
  };

  const beginEdit = (target: ChallengeTarget) => {
    if (!requireTargetPermission(target, "edit")) return;
    setEditingTarget(target);
    setOpenActionId(null);
  };

  const createDraftObjective = (title: string) => {
    if (draftIsSubmitting) return false;

    const value = title.trim();
    if (!value) {
      notify("标题不能为空");
      setObjectiveCreationSession((current) => updateObjectiveCreationDraftTitle(current, title));
      return false;
    }

    const orderAnchor = draftOrderAnchor(displayedGroups);
    setObjectiveCreationSession((current) => submitObjectiveCreationDraft(current, value, orderAnchor));
    void createObjective({
      title: value,
      whyItMatters: "待补充",
      cycle: defaultCycleLabel(),
      boundary: "待补充",
      finalDueAt: defaultFinalDueAt(),
    }).then((objective) => {
      if (objective) {
        setObjectiveCreationSession((current) => completeObjectiveCreationDraft(current, objective));
        if (canShowAllChallenges) setScope("all");
      } else {
        setObjectiveCreationSession((current) => failObjectiveCreationDraft(current, value));
      }
    });
    return true;
  };

  const restoreDraftReturnContext = useCallback((returnContext: DraftReturnContext | null) => {
    if (!returnContext) return;
    setScope(returnContext.scope);
    setCycleFilter(returnContext.cycle);
    setStatusFilter(returnContext.status);
  }, []);

  const cancelEdit = () => {
    if (draftIsEditing) {
      const cancelled = cancelObjectiveCreationSession(objectiveCreationSession);
      setObjectiveCreationSession(cancelled.session);
      restoreDraftReturnContext(cancelled.returnContext);
      setEditingTarget(null);
      return;
    }
    setEditingTarget(null);
  };

  const updateScope = (next: ChallengeScope) => {
    setObjectiveCreationSession(clearSubmittedObjectiveCreation);
    setScope(next);
  };

  const updateCycleFilter = (next: ChallengeCycleFilter) => {
    setObjectiveCreationSession(clearSubmittedObjectiveCreation);
    setCycleFilter(next);
  };

  const updateStatusFilter = (next: ChallengeStatusFilter) => {
    setObjectiveCreationSession(clearSubmittedObjectiveCreation);
    setStatusFilter(next);
  };

  const saveTitle = (target: ChallengeTarget, title: string) => {
    if (target.type === "objective" && target.id === draftObjectiveId) return createDraftObjective(title);

    const value = title.trim();
    if (!value) {
      notify("标题不能为空");
      return false;
    }

    if (target.type === "objective") updateObjectiveTitle(target.id, value);
    if (target.type === "bounty") updateResultTitle(target.id, value);
    if (target.type === "action") updateTaskTitle(target.id, value);
    if (target.type === "subAction") updateTaskChecklistItemLabel(target.actionId, target.id, value);
    setEditingTarget(null);
    return true;
  };

  const deleteTarget = (target: ChallengeTarget) => {
    if (target.type === "objective" && target.id === draftObjectiveId) {
      const cancelled = cancelObjectiveCreationSession(objectiveCreationSession);
      setObjectiveCreationSession(cancelled.session);
      restoreDraftReturnContext(cancelled.returnContext);
      setEditingTarget(null);
      return;
    }

    if (!requireTargetPermission(target, "delete")) return;
    if (!window.confirm(deleteConfirmMessage(target, challengeState))) return;

    if (target.type === "objective") deleteObjective(target.id);
    if (target.type === "bounty") deleteResult(target.id);
    if (target.type === "action") deleteTask(target.id);
    if (target.type === "subAction") deleteTaskChecklistItem(target.actionId, target.id);
  };

  const copyLink = (target: ChallengeTarget) => {
    if (target.type === "objective" && target.id === draftObjectiveId) {
      notify("请先完成目标标题");
      return;
    }

    const write = navigator.clipboard?.writeText(challengeLinkForTarget(target));
    if (!write) {
      notify("当前浏览器不支持复制链接");
      return;
    }

    void write.then(() => notify("链接已复制")).catch(() => notify("复制链接失败"));
  };

  const handleRowAction = (action: ChallengeRowAction, target: ChallengeTarget) => {
    if (target.type === "objective" && target.id === draftObjectiveId) {
      if (draftIsSubmitting) {
        notify("目标正在创建，请稍后");
        return;
      }
      if (action === "edit") beginEdit(target);
      if (action === "delete") deleteTarget(target);
      if (action === "copyLink" || action === "comment") notify("请先完成目标标题");
      return;
    }

    if (action === "copyLink") copyLink(target);
    if (action === "edit") beginEdit(target);
    if (action === "comment") setCommentTarget(commentTargetForChallengeTarget(target));
    if (action === "delete") deleteTarget(target);
  };

  const setActionDone = (actionId: string, done: boolean) => {
    const action = challengeState.tasks.find((item) => item.id === actionId);
    if (!action) return;
    if (!canMutateWorkItemsForObjective(action.linkedObjectiveId)) {
      notify("目标当前阶段不能修改行动项");
      return;
    }
    setTaskCompletion(actionId, done);
  };

  const setSubActionDone = (actionId: string, itemId: string, done: boolean) => {
    const action = challengeState.tasks.find((item) => item.id === actionId);
    if (!action) return;
    if (!canMutateWorkItemsForObjective(action.linkedObjectiveId)) {
      notify("目标当前阶段不能修改子行动项");
      return;
    }
    updateTaskChecklistItem(actionId, itemId, done);
  };

  const dragDrop = {
    dragItem,
    dropTarget,
    onDragStart: (item: DragItem) => {
      setDragItem(item);
      setDropTarget(null);
      setOpenActionId(null);
    },
    onDragEnd: () => {
      setDragItem(null);
      setDropTarget(null);
    },
    onDropTargetChange: setDropTarget,
    onDrop: (target: DropTarget) => {
      if (!dragItem) return;
      if (!canAccessDragItem(challengeState, role, dragItem)) {
        const key = permissionKeyForChallengeAction(resourceForDragItem(dragItem), "edit");
        if (key) notify(permissionDeniedMessage(key));
        setDragItem(null);
        setDropTarget(null);
        return;
      }
      if (dragItem.type === "bounty" && !canMutateMetricForObjective(dragItem.objectiveId)) {
        notify("指标已冻结，不能排序");
        setDragItem(null);
        setDropTarget(null);
        return;
      }
      if (dragItem.type === "action" && !canMutateWorkItemsForObjective(dragItem.objectiveId)) {
        notify("目标当前阶段不能移动行动项");
        setDragItem(null);
        setDropTarget(null);
        return;
      }

      if (dragItem.type === "bounty" && target.type === "bounty") {
        moveResult({ resultId: dragItem.id, objectiveId: target.objectiveId, referenceResultId: target.bountyId, placement: target.placement });
      }

      if (dragItem.type === "action") {
        if (target.type === "objectiveActions") {
          moveTask({ taskId: dragItem.id, objectiveId: target.objectiveId });
        }
        if (target.type === "action") {
          moveTask({ taskId: dragItem.id, objectiveId: target.objectiveId, referenceTaskId: target.actionId, placement: target.placement });
        }
      }

      if (dragItem.type === "subAction") {
        if (target.type === "actionSubActions") {
          moveTaskChecklistItem({ itemId: dragItem.id, fromTaskId: dragItem.actionId, toTaskId: target.actionId });
        }
        if (target.type === "subAction") {
          moveTaskChecklistItem({ itemId: dragItem.id, fromTaskId: dragItem.actionId, toTaskId: target.actionId, referenceItemId: target.itemId, placement: target.placement });
        }
      }

      setDragItem(null);
      setDropTarget(null);
    },
  };

  return (
    <div
      className="grid gap-4"
      onPointerDown={(event) => {
        if (!openActionId) return;
        if (event.target instanceof Element && event.target.closest("[data-challenge-row-actions], [data-challenge-disclosure-action]")) return;
        setOpenActionId(null);
      }}
    >
      {showAll && <TeamDashboard groups={filteredGroups} />}
      <ChallengeToolbar
        canShowAll={canShowAllChallenges}
        cycle={cycleFilter}
        cycleOptions={cycleOptions}
        onCycleChange={updateCycleFilter}
        onScopeChange={updateScope}
        onStatusChange={updateStatusFilter}
        scope={scope}
        status={statusFilter}
      />
      <ChallengeTree
        emptyText={emptyText}
        groups={displayedGroups}
        handlers={{
          activeActionId,
          collapsedActionIds,
          collapsedBountyIds,
          commentCounts,
          dragDrop,
          editingTarget: effectiveEditingTarget,
          contributionReviews: challengeState.objectiveContributionReviews,
          currentUser,
          draftObjectiveId,
          metricActionLabel: (objective) =>
            metricCreationActionForObjective({
              objective,
              currentUser,
              permissionRules: challengeState.permissionRules,
              now,
            })?.label ?? null,
          canRecruitObjective: (objective) =>
            canRecruitObjectiveChallengers({
              objective,
              currentUser,
              permissionRules: challengeState.permissionRules,
            }),
          canMutateMetrics: canMutateMetricForObjective,
          canMutateWorkItems: canMutateWorkItemsForObjective,
          onActionDoneChange: setActionDone,
          onActionRowAction: handleRowAction,
          onActiveActionChange: activateRowAction,
          onAddAction: addAction,
          onAddBounty: addBounty,
          onAddSubAction: addSubAction,
          onApproveApplication: approveChallengeApplication,
          onCancelEdit: cancelEdit,
          onDraftTitleChange: (title) => setObjectiveCreationSession((current) => updateObjectiveCreationDraftTitle(current, title)),
          onEditTarget: beginEdit,
          onFreezeObjective: freezeObjective,
          onOpenActionChange: setOpenActionId,
          onPublishObjective: publishObjective,
          onRecruitObjective: (objectiveId) => openModal({ type: "recruitChallengers", objectiveId }),
          onRejectApplication: rejectChallengeApplication,
          onSaveTitle: saveTitle,
          onSubActionDoneChange: setSubActionDone,
          onToggleAction: (actionId) => setCollapsedActionIds((items) => toggleSetItem(items, actionId)),
          onToggleBounty: (bountyId) => setCollapsedBountyIds((items) => toggleSetItem(items, bountyId)),
          openActionId,
          canManageFlow: canShowFrontend(currentUser, "challenge.scope.all"),
        }}
        now={now}
        scope={scope}
      />

      {commentTarget && (
        <CommentPanel
          key={`${commentTarget.type}:${commentTarget.id}`}
          canManageAllComments={hasPermission(currentUser, state.permissionRules, "comment.manage")}
          currentMember={currentMember}
          currentUserId={currentUser?.id ?? ""}
          onLoadMentionableUsers={loadCommentMentionableUsers}
          targetId={commentTarget.id}
          targetTitle={commentTarget.title}
          targetType={commentTarget.type}
          threads={challengeState.comments.filter((thread) => thread.targetType === commentTarget.type && thread.targetId === commentTarget.id)}
          onAddComment={(body, replyInput?: CommentReplyInput) =>
            addComment({
              targetType: commentTarget.type,
              targetId: commentTarget.id,
              targetTitle: commentTarget.title,
              body,
              author: currentMember,
              parentMessageId: replyInput?.parentMessageId,
              replyToMessageId: replyInput?.replyToMessageId,
              replyToAuthor: replyInput?.replyToAuthor,
            })
          }
          onClose={() => setCommentTarget(null)}
          onDeleteComment={deleteCommentMessage}
          onUpdateComment={updateCommentMessage}
          onUploadAttachment={(file) => uploadCommentAttachment({ file, targetId: commentTarget.id, targetType: commentTarget.type })}
        />
      )}
    </div>
  );
}

function useMinuteNow() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  return now;
}

function toggleSetItem<T>(items: Set<T>, item: T) {
  const next = new Set(items);
  if (next.has(item)) next.delete(item);
  else next.add(item);
  return next;
}

function withoutItem<T>(items: Set<T>, item: T) {
  const next = new Set(items);
  next.delete(item);
  return next;
}
