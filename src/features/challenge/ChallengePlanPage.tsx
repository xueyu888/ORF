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
import { canMutateObjectiveWorkItems, canProposeObjectiveMetric, canRecruitObjectiveChallengers, isObjectiveResultLocked, metricCreationActionForObjective } from "./model/orfFlowCapabilities";
import type { ChallengeCommentTarget, ChallengeRowAction, ChallengeScope, ChallengeTarget, DragItem, DropTarget } from "./model/types";
import type { ObjectiveNode } from "./model/types";

const draftObjectiveId = "draft-objective";

type DraftReturnContext = {
  cycle: ChallengeCycleFilter;
  scope: ChallengeScope;
  status: ChallengeStatusFilter;
};

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
  const objective = draftObjective(title);
  return {
    actions: [],
    bounties: [],
    challengers: [],
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
  const [draftObjectiveTitle, setDraftObjectiveTitle] = useState<string | null>(null);
  const [draftReturnContext, setDraftReturnContext] = useState<DraftReturnContext | null>(null);
  const [creatingDraftObjective, setCreatingDraftObjective] = useState(false);
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
  const draftGroup = useMemo(() => (draftObjectiveTitle === null ? null : draftObjectiveNode(draftObjectiveTitle)), [draftObjectiveTitle]);
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
  const cycleOptions = useMemo(() => challengeCycleOptions(groups), [groups]);
  const filteredGroups = useMemo(() => sortChallengeGroups(filterChallengeGroups(groups, { cycle: cycleFilter, status: statusFilter })), [cycleFilter, groups, statusFilter]);
  const displayedGroups = useMemo(() => sortChallengeGroups(draftGroup ? [draftGroup, ...filteredGroups] : filteredGroups), [draftGroup, filteredGroups]);
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

    setDraftReturnContext((current) => current ?? { cycle: cycleFilter, scope, status: statusFilter });
    if (canShowAllChallenges) setScope("all");
    setCycleFilter("all");
    setStatusFilter("unassigned");
    setDraftObjectiveTitle((current) => current ?? "");
    setEditingTarget({ type: "objective", id: draftObjectiveId, title: "" });
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
    if (creatingDraftObjective) return false;

    const value = title.trim();
    if (!value) {
      notify("标题不能为空");
      setDraftObjectiveTitle(title);
      setEditingTarget({ type: "objective", id: draftObjectiveId, title });
      return false;
    }

    setDraftObjectiveTitle(value);
    setCreatingDraftObjective(true);
    void createObjective({
      title: value,
      whyItMatters: "待补充",
      cycle: defaultCycleLabel(),
      boundary: "待补充",
      finalDueAt: defaultFinalDueAt(),
    }).then((objective) => {
      if (objective) {
        setDraftObjectiveTitle(null);
        setDraftReturnContext(null);
        setEditingTarget(null);
        if (canShowAllChallenges) setScope("all");
      } else {
        setEditingTarget({ type: "objective", id: draftObjectiveId, title: value });
      }
    }).finally(() => {
      setCreatingDraftObjective(false);
    });
    return false;
  };

  const restoreDraftReturnContext = useCallback(() => {
    if (!draftReturnContext) return;
    setScope(draftReturnContext.scope);
    setCycleFilter(draftReturnContext.cycle);
    setStatusFilter(draftReturnContext.status);
    setDraftReturnContext(null);
  }, [draftReturnContext]);

  const cancelEdit = () => {
    if (editingTarget?.type === "objective" && editingTarget.id === draftObjectiveId) {
      setDraftObjectiveTitle(null);
      restoreDraftReturnContext();
      setEditingTarget(null);
      return;
    }
    setEditingTarget(null);
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
      setDraftObjectiveTitle(null);
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
        onCycleChange={setCycleFilter}
        onScopeChange={setScope}
        onStatusChange={setStatusFilter}
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
          editingTarget,
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
          onDraftTitleChange: setDraftObjectiveTitle,
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
