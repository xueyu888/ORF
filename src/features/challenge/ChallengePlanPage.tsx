import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { CommentPanel, type CommentReplyInput } from "./comments/CommentPanel";
import { ChallengeToolbar } from "./components/ChallengeToolbar";
import { ChallengeTree } from "./components/ChallengeTree";
import { TeamDashboard } from "./components/TeamDashboard";
import { canShowFrontend } from "../../config/frontendVisibility";
import { hasPermission } from "../../config/permissions";
import { useOrf } from "../../state/OrfProvider";
import { resolveObjectiveDeadlineEditState, type ObjectiveDeadlineEditState } from "../../domain/orfDeadline";
import { isObjectiveChallenger } from "../../domain/orfObjectiveParticipants";
import { objectiveLifecycleInitialState } from "../../domain/orfLifecycle";
import type { ResultDetailsInput } from "../../domain/orfResultDetails";
import type { Objective, OrfState, UncertaintyLevel } from "../../types/orf";
import { localDateString } from "../../utils/date";
import { applyListItemAnchor, createListItemAnchor, listContainsAnchoredItem, type ListItemAnchor } from "../interaction/listItemAnchor";
import { useChallengeReadModelData } from "./hooks/useChallengeReadModelData";
import { challengeLinkForTarget, parseChallengeTargetHash, type ChallengeUrlTarget } from "./model/challengeLinks";
import { commentCountsByTarget, commentTargetForChallengeTarget } from "./model/challengeComments";
import { canAccessDragItem, canAccessTarget, permissionDeniedMessage, permissionKeyForChallengeAction, resourceForDragItem, resourceForTarget } from "./model/challengePermissions";
import {
  challengeCycleOptions,
  challengeMemberOptions,
  filterChallengeGroups,
  sortChallengeGroups,
  type ChallengeCycleFilter,
  type ChallengeMemberFilter,
  type ChallengeStatusFilter,
} from "./model/challengeFilters";
import { buildChallengeTree } from "./model/challengeTreeModel";
import { deleteConfirmMessage } from "./model/deleteConfirm";
import {
  applyTaskCompletionOverlays,
  taskCompletionOverlayMaterialized,
  upsertTaskCompletionOverlay,
  type TaskCompletionOverlay,
  type TaskCompletionOverlayInput,
} from "./model/taskCompletionOverlay";
import {
  applyTitleEditOverlays,
  titleEditOverlayForTarget,
  titleEditOverlayResolved,
  upsertTitleEditOverlay,
  type TitleEditOverlay,
  type TitleEditOverlayInput,
} from "./model/titleEditOverlay";
import { shouldCancelEmptyCreationDraft, type TitleSubmissionContext } from "./model/titleSubmission";
import {
  applyChildCreationOverlay,
  beginChildCreationSession,
  cancelChildCreationSession,
  childCreationDraft,
  childCreationDraftId,
  childCreationIsAwaitingSnapshot,
  childCreationIsSubmitting,
  childCreationOverlayMatchesTarget,
  childCreationSubmittedOverlay,
  childCreationTarget,
  childCreationTemporaryRow,
  clearChildCreationSession,
  clearSubmittedChildCreation,
  completeChildCreationDraft,
  failChildCreationDraft,
  idleChildCreationSession,
  isChildCreationTarget,
  materializeSubmittedChildCreation,
  submitChildCreationDraft,
  updateChildCreationDraftTitle,
  type ChildCreationDraft,
  type ChildCreationKind,
  type ChildCreationSession,
} from "./model/childCreationSession";
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
  objectiveCreationDraftProject,
  objectiveCreationDraftTitle,
  objectiveCreationIsDraftEditing,
  objectiveCreationIsSubmitting,
  objectiveCreationSubmittedObjective,
  objectiveCreationSubmittedOrderAnchor,
  submitObjectiveCreationDraft,
  updateObjectiveCreationDraftTitle,
  type DraftReturnContext,
  type ObjectiveCreationProject,
  type ObjectiveCreationSession,
} from "./model/objectiveCreationSession";
import {
  canEditObjectiveContent,
  canMutateObjectiveWorkItems,
  canRecruitObjectiveChallengers,
  metricCreationActionForObjective,
  metricEditAccessForObjective,
  metricEditUnavailableMessage,
  metricLifecycleMutationAccessForObjective,
  objectiveContentEditUnavailableMessage,
  workItemMutationAccessForObjective,
  workItemMutationUnavailableMessage,
} from "./model/orfFlowCapabilities";
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

function rowActionOwnsOpenMenu(openActionId: string, actionId: string) {
  return openActionId === actionId || openActionId === `${actionId}:add` || openActionId === `${actionId}:project`;
}

function draftObjective(title: string, project: ObjectiveCreationProject): Objective {
  const today = localDateString(new Date());
  const finalDueAt = defaultFinalDueAt();
  return {
    id: draftObjectiveId,
    title,
    description: "",
    whyItMatters: "",
    projectId: project.projectId,
    cycle: defaultCycleLabel(),
    stage: "goalSetting",
    flowStatus: objectiveLifecycleInitialState.flowStatus,
    status: "Draft",
    confidence: 50,
    progress: 0,
    boundary: "",
    successDefinition: "",
    resultIds: [],
    taskIds: [],
    finalDueAt,
    challengers: [],
    challengerUserIds: [],
    assignedChallengers: [],
    assignedChallengerUserIds: [],
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

function draftObjectiveNode(title: string, project: ObjectiveCreationProject): ObjectiveNode {
  return objectiveNode(draftObjective(title, project));
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
    createProject,
    moveResult,
    moveTask,
    moveTaskChecklistItem,
    notify,
    openModal,
    publishObjective,
    readModelInvalidations,
    freezeObjective,
    createObjective,
    createResult,
    createTask,
    loadCommentMentionableUsers,
    rejectChallengeApplication,
    requestObjectiveAlignment,
    reviewObjectiveAlignment,
    setTaskCompletion,
    state,
    updateCommentMessage,
    updateObjectiveFinalDueAt,
    setObjectiveProject,
    updateObjectiveTitle,
    updateResultDetails,
    updateResultTitle,
    updateResultUncertaintyLevel,
    updateTaskChecklistItem,
    updateTaskChecklistItemLabel,
    updateTaskTitle,
    uploadCommentAttachment,
  } = useOrf();
  const role = currentUser?.role;
  const currentMember = currentUser?.name ?? "User";
  const canShowAllChallenges = canShowFrontend(currentUser, "challenge.scope.all");
  const canCreateObjective = hasPermission(currentUser, state.permissionRules, "objective.create");
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const hasObjectiveCreationEntry = searchParams.get("create") === "objective";
  const linkedChallengeTarget = useMemo(() => parseChallengeTargetHash(location.hash), [location.hash]);
  const [scope, setScope] = useState<ChallengeScope>(canShowAllChallenges ? "all" : "mine");
  const [cycleFilter, setCycleFilter] = useState<ChallengeCycleFilter>("all");
  const [memberFilter, setMemberFilter] = useState<ChallengeMemberFilter>("all");
  const [statusFilter, setStatusFilter] = useState<ChallengeStatusFilter>("all");
  const [collapsedBountyIds, setCollapsedBountyIds] = useState<Set<string>>(() => new Set());
  const [collapsedActionIds, setCollapsedActionIds] = useState<Set<string>>(() => new Set());
  const [commentTarget, setCommentTarget] = useState<ChallengeCommentTarget | null>(null);
  const [editingTarget, setEditingTarget] = useState<ChallengeTarget | null>(null);
  const [objectiveCreationSession, setObjectiveCreationSession] = useState<ObjectiveCreationSession>(idleObjectiveCreationSession);
  const [childCreationSession, setChildCreationSession] = useState<ChildCreationSession>(idleChildCreationSession);
  const [activeActionId, setActiveActionId] = useState<string | null>(null);
  const [openActionId, setOpenActionId] = useState<string | null>(null);
  const [dragItem, setDragItem] = useState<DragItem | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [completionOverlays, setCompletionOverlays] = useState<TaskCompletionOverlay[]>([]);
  const [titleEditOverlays, setTitleEditOverlays] = useState<TitleEditOverlay[]>([]);
  const [objectiveInteractionAnchor, setObjectiveInteractionAnchor] = useState<ListItemAnchor | null>(null);
  const childCreationSubmissionSequenceRef = useRef(0);
  const completionOverlaySequenceRef = useRef(0);
  const titleEditOverlaySequenceRef = useRef(0);
  const handledObjectiveCreationEntryRef = useRef(false);
  const appliedLinkedTargetRef = useRef<string | null>(null);
  const scopeDefaultedForAllAccessRef = useRef(false);
  const now = useMinuteNow();

  useEffect(() => {
    if (!canShowAllChallenges) {
      scopeDefaultedForAllAccessRef.current = false;
      if (scope === "all") {
        setScope("mine");
      }
      return;
    }

    if (scope === "all") {
      scopeDefaultedForAllAccessRef.current = true;
      return;
    }

    if (!scopeDefaultedForAllAccessRef.current) {
      scopeDefaultedForAllAccessRef.current = true;
      setScope("all");
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
    if (openActionId) {
      if (!id || rowActionOwnsOpenMenu(openActionId, id)) {
        setActiveActionId(id);
      }
      return;
    }
    setActiveActionId(id);
  };

  const showAll = canShowAllChallenges && scope === "all";
  const baseChallengeState = useChallengeReadModelData({ readModelInvalidations, showAll, state });
  const temporaryChildRow = childCreationTemporaryRow(childCreationSession);
  const childOverlay = childCreationSubmittedOverlay(childCreationSession);
  const challengeState = useMemo(
    () => applyTaskCompletionOverlays(applyTitleEditOverlays(applyChildCreationOverlay(baseChallengeState, childOverlay), titleEditOverlays), completionOverlays),
    [baseChallengeState, childOverlay, completionOverlays, titleEditOverlays],
  );
  const clearChildCreation = () => setChildCreationSession(clearChildCreationSession);
  const applyTitleEditOverlay = (overlay: TitleEditOverlayInput) => {
    const trackedOverlay = {
      ...overlay,
      id: `title-edit-${Date.now()}-${titleEditOverlaySequenceRef.current++}`,
    } as TitleEditOverlay;
    setTitleEditOverlays((items) => upsertTitleEditOverlay(items, trackedOverlay));
    return trackedOverlay.id;
  };
  const removeTitleEditOverlay = (overlayId: string) => {
    setTitleEditOverlays((items) => items.filter((item) => item.id !== overlayId));
  };
  const applyCompletionOverlay = (overlay: TaskCompletionOverlayInput) => {
    const trackedOverlay = {
      ...overlay,
      id: `completion-${Date.now()}-${completionOverlaySequenceRef.current++}`,
    } as TaskCompletionOverlay;
    setCompletionOverlays((items) => upsertTaskCompletionOverlay(items, trackedOverlay));
    return trackedOverlay.id;
  };
  const removeCompletionOverlay = (overlayId: string) => {
    setCompletionOverlays((items) => items.filter((item) => item.id !== overlayId));
  };
  const draftTitle = objectiveCreationDraftTitle(objectiveCreationSession);
  const draftProject = objectiveCreationDraftProject(objectiveCreationSession);
  const draftGroup = useMemo(() => (draftTitle === null ? null : draftObjectiveNode(draftTitle, draftProject ?? { projectId: null })), [draftTitle, draftProject]);
  const draftIsEditing = objectiveCreationIsDraftEditing(objectiveCreationSession);
  const draftIsSubmitting = objectiveCreationIsSubmitting(objectiveCreationSession);
  const effectiveEditingTarget = draftIsEditing ? ({ type: "objective", id: draftObjectiveId, title: draftTitle ?? "" } satisfies ChallengeTarget) : editingTarget;
  const canFilterByMember = canShowAllChallenges && scope === "all";
  const effectiveMemberFilter = canFilterByMember ? memberFilter : "all";
  const visibleObjectiveIds = useMemo(() => {
    if (showAll) return undefined;
    return new Set(challengeState.objectives.filter((objective) => isObjectiveChallenger(objective, currentUser?.id)).map((objective) => objective.id));
  }, [challengeState.objectives, currentUser?.id, showAll]);
  const groups = useMemo(
    () =>
      buildChallengeTree(
        {
          evidence: challengeState.evidence,
          objectives: challengeState.objectives,
          results: challengeState.results,
          tasks: challengeState.tasks,
        },
        visibleObjectiveIds,
      ),
    [challengeState.evidence, challengeState.objectives, challengeState.results, challengeState.tasks, visibleObjectiveIds],
  );
  const submittedObjective = objectiveCreationSubmittedObjective(objectiveCreationSession);
  const submittedOrderAnchor = objectiveCreationSubmittedOrderAnchor(objectiveCreationSession);
  const optimisticGroup = useMemo(() => {
    if (!submittedObjective || groups.some((group) => group.objective.id === submittedObjective.id)) return null;
    return objectiveNode(submittedObjective);
  }, [groups, submittedObjective]);
  const displaySourceGroups = useMemo(() => (optimisticGroup ? [optimisticGroup, ...groups] : groups), [groups, optimisticGroup]);
  const cycleOptions = useMemo(() => challengeCycleOptions(displaySourceGroups), [displaySourceGroups]);
  const memberOptions = useMemo(() => challengeMemberOptions(displaySourceGroups, challengeState.users), [challengeState.users, displaySourceGroups]);
  const filteredGroups = useMemo(
    () => sortChallengeGroups(filterChallengeGroups(displaySourceGroups, { cycle: cycleFilter, member: effectiveMemberFilter, status: statusFilter })),
    [cycleFilter, displaySourceGroups, effectiveMemberFilter, statusFilter],
  );
  const sortedDisplayedGroups = useMemo(() => sortChallengeGroups(draftGroup ? [draftGroup, ...filteredGroups] : filteredGroups), [draftGroup, filteredGroups]);
  const creationAnchoredGroups = useMemo(
    () => (draftGroup ? sortedDisplayedGroups : applyObjectiveOrderAnchor(sortedDisplayedGroups, submittedOrderAnchor)),
    [draftGroup, submittedOrderAnchor, sortedDisplayedGroups],
  );
  const displayedGroups = useMemo(
    () => applyListItemAnchor(creationAnchoredGroups, objectiveInteractionAnchor, objectiveGroupId),
    [creationAnchoredGroups, objectiveInteractionAnchor],
  );
  const commentCounts = useMemo(() => commentCountsByTarget(challengeState.comments), [challengeState.comments]);
  const hasActiveFilters = cycleFilter !== "all" || effectiveMemberFilter !== "all" || statusFilter !== "all";
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
    if (memberFilter !== "all" && (!canFilterByMember || !memberOptions.some((option) => option.value === memberFilter))) {
      setMemberFilter("all");
    }
  }, [canFilterByMember, memberFilter, memberOptions]);
  useEffect(() => {
    if (!listContainsAnchoredItem(creationAnchoredGroups, objectiveInteractionAnchor, objectiveGroupId)) {
      setObjectiveInteractionAnchor(null);
    }
  }, [creationAnchoredGroups, objectiveInteractionAnchor]);
  useEffect(() => {
    const objective = objectiveCreationSubmittedObjective(objectiveCreationSession);
    if (!objective) return;
    if (groups.some((group) => group.objective.id === objective.id)) {
      setObjectiveCreationSession(materializeSubmittedObjectiveCreation);
    }
  }, [groups, objectiveCreationSession]);
  useEffect(() => {
    setChildCreationSession((current) => materializeSubmittedChildCreation(current, baseChallengeState));
  }, [baseChallengeState]);
  useEffect(() => {
    setTitleEditOverlays((items) => {
      if (items.length === 0) return items;
      const pendingItems = items.filter((item) => !titleEditOverlayResolved(baseChallengeState, item));
      return pendingItems.length === items.length ? items : pendingItems;
    });
  }, [baseChallengeState]);
  useEffect(() => {
    setCompletionOverlays((items) => {
      if (items.length === 0) return items;
      const pendingItems = items.filter((item) => !taskCompletionOverlayMaterialized(baseChallengeState, item));
      return pendingItems.length === items.length ? items : pendingItems;
    });
  }, [baseChallengeState]);
  const objectiveById = (objectiveId: string) => challengeState.objectives.find((item) => item.id === objectiveId);
  const metricEditAccessForObjectiveId = (objectiveId: string) =>
    metricEditAccessForObjective({
      objective: objectiveById(objectiveId),
      currentUser,
      permissionRules: challengeState.permissionRules,
      now,
    });
  const canMutateMetricForObjective = (objectiveId: string) => metricEditAccessForObjectiveId(objectiveId).status === "allowed";
  const notifyUnavailableMetricEdit = (objectiveId: string) => {
    const access = metricEditAccessForObjectiveId(objectiveId);
    if (access.status === "allowed") return;
    notify(metricEditUnavailableMessage(access));
  };
  const metricLifecycleMutationAccessForObjectiveId = (objectiveId: string) =>
    metricLifecycleMutationAccessForObjective(objectiveById(objectiveId));
  const notifyUnavailableMetricDeletion = (objectiveId: string) => {
    const access = metricLifecycleMutationAccessForObjectiveId(objectiveId);
    if (access.status === "allowed") return;
    notify(access.reason === "lifecycleLocked" ? "指标已冻结，不能删除" : "指标所属目标不可用");
  };
  const workItemMutationAccessForObjectiveId = (objectiveId: string) =>
    workItemMutationAccessForObjective({
      objective: objectiveById(objectiveId),
      currentUser,
    });
  const canMutateWorkItemsForObjective = (objectiveId: string) => canMutateObjectiveWorkItems(objectiveById(objectiveId), currentUser);
  const notifyUnavailableWorkItemMutation = (objectiveId: string, lifecycleMessage = "目标当前阶段不能修改行动项") => {
    const access = workItemMutationAccessForObjectiveId(objectiveId);
    if (access.status === "allowed") return;
    notify(access.reason === "lifecycleLocked" ? lifecycleMessage : workItemMutationUnavailableMessage(access));
  };
  const objectiveDeadlineEditState = (objective: ObjectiveNode["objective"]) => resolveObjectiveDeadlineEditState(objective, currentUser?.role);
  const notifyUnavailableObjectiveDeadline = (objective: ObjectiveNode["objective"]) => {
    const editState = objectiveDeadlineEditState(objective);
    if (editState.status === "editable") return;
    notify(objectiveDeadlineUnavailableMessage(editState));
  };

  const beginObjectiveCreation = useCallback(
    (project: ObjectiveCreationProject = { projectId: null }) => {
      const normalizedProject = normalizeObjectiveCreationProject(project);

      if (!canCreateObjective) {
        notify("没有新建目标权限");
        return;
      }

      if (objectiveCreationSession.status === "submittingDraft") {
        notify("目标正在创建，请稍后");
        return;
      }

      if (childCreationIsSubmitting(childCreationSession) || childCreationIsAwaitingSnapshot(childCreationSession)) {
        notify("请先完成当前草稿");
        return;
      }

      if (objectiveCreationSession.status === "editingDraft" || objectiveCreationSession.status === "failedEditingDraft") {
        notify("请先完成当前目标草稿");
        return;
      }

      setObjectiveCreationSession((current) =>
        beginObjectiveCreationSession(current, { cycle: cycleFilter, member: memberFilter, scope, status: statusFilter }, normalizedProject),
      );
      setEditingTarget(null);
      clearChildCreation();
      if (canShowAllChallenges) setScope("all");
      setCycleFilter("all");
      setMemberFilter("all");
      setStatusFilter("unassigned");
    },
    [
      canCreateObjective,
      canShowAllChallenges,
      childCreationSession,
      cycleFilter,
      memberFilter,
      notify,
      objectiveCreationSession.status,
      scope,
      statusFilter,
    ],
  );

  useEffect(() => {
    if (!linkedChallengeTarget) {
      appliedLinkedTargetRef.current = null;
      return;
    }
    const linkedTargetKey = challengeAnchorIdForLinkedTarget(linkedChallengeTarget);
    if (appliedLinkedTargetRef.current === linkedTargetKey) return;

    const objectiveId = objectiveIdForLinkedChallengeTarget(linkedChallengeTarget, challengeState) ?? objectiveIdForLinkedChallengeTarget(linkedChallengeTarget, state);
    if (!objectiveId) return;
    appliedLinkedTargetRef.current = linkedTargetKey;
    setObjectiveInteractionAnchor(null);

    if (canShowAllChallenges && scope !== "all") setScope("all");
    if (cycleFilter !== "all") setCycleFilter("all");
    if (memberFilter !== "all") setMemberFilter("all");
    if (statusFilter !== "all") setStatusFilter("all");

    const parentActionId = parentActionIdForLinkedSubAction(linkedChallengeTarget, challengeState) ?? parentActionIdForLinkedSubAction(linkedChallengeTarget, state);
    if (parentActionId) {
      setCollapsedActionIds((items) => (items.has(parentActionId) ? withoutItem(items, parentActionId) : items));
    }
  }, [canShowAllChallenges, challengeState, cycleFilter, linkedChallengeTarget, memberFilter, scope, state, statusFilter]);

  useEffect(() => {
    if (!linkedChallengeTarget) return undefined;
    const anchorId = challengeAnchorIdForLinkedTarget(linkedChallengeTarget);
    const rowActionId = rowActionIdForLinkedChallengeTarget(linkedChallengeTarget, challengeState);
    if (!rowActionId) return undefined;

    const frameId = window.requestAnimationFrame(() => {
      const element = challengeTargetElement(anchorId);
      if (!element) return;

      element.scrollIntoView({ behavior: "smooth", block: "center" });
      setActiveActionId(rowActionId);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [challengeState, displayedGroups, linkedChallengeTarget]);

  useEffect(() => {
    if (!temporaryChildRow) return;
    if (!challengeState.objectives.some((objective) => objective.id === temporaryChildRow.objectiveId)) {
      clearChildCreation();
      if (editingTarget && isChildCreationTarget(editingTarget)) setEditingTarget(null);
      return;
    }
    if (temporaryChildRow.status === "failed") {
      const target = childCreationTarget(temporaryChildRow);
      if (!editingTarget || editingTarget.type !== target.type || editingTarget.id !== target.id) {
        setEditingTarget(target);
      }
    }
  }, [challengeState.objectives, temporaryChildRow, editingTarget]);
  useEffect(() => {
    if (!hasObjectiveCreationEntry) {
      handledObjectiveCreationEntryRef.current = false;
      return;
    }
    if (handledObjectiveCreationEntryRef.current) return;
    handledObjectiveCreationEntryRef.current = true;

    const next = new URLSearchParams(searchParams);
    next.delete("create");
    setSearchParams(next, { replace: true });

    beginObjectiveCreation();
  }, [
    beginObjectiveCreation,
    hasObjectiveCreationEntry,
    searchParams,
    setSearchParams,
  ]);

  const requireTargetPermission = (target: ChallengeTarget, action: "create" | "delete" | "edit") => {
    if (target.type === "objective" && action === "edit") {
      if (canEditObjectiveContent(currentUser)) return true;
      notify(objectiveContentEditUnavailableMessage());
      return false;
    }

    if (target.type === "bounty" && action === "edit") {
      const access = metricEditAccessForObjectiveId(target.objectiveId);
      if (access.status === "allowed") return true;
      notify(metricEditUnavailableMessage(access));
      return false;
    }

    if (target.type === "bounty" && action === "delete") {
      const access = metricLifecycleMutationAccessForObjectiveId(target.objectiveId);
      if (access.status !== "allowed") {
        notifyUnavailableMetricDeletion(target.objectiveId);
        return false;
      }
    }

    if ((target.type === "action" || target.type === "subAction") && (action === "edit" || action === "delete")) {
      const access = workItemMutationAccessForObjectiveId(target.objectiveId);
      if (access.status === "allowed") return true;
      notify(access.reason === "lifecycleLocked" ? "目标当前阶段不能修改行动项" : workItemMutationUnavailableMessage(access));
      return false;
    }

    if (canAccessTarget(challengeState, role, target, action)) return true;
    const key = permissionKeyForChallengeAction(resourceForTarget(target), action);
    if (key) notify(permissionDeniedMessage(key));
    return false;
  };

  const beginChildCreationDraft = (kind: ChildCreationKind, objectiveId: string, options: { afterItemId?: string; taskId?: string } = {}) => {
    const rowId = kind === "subtask" && options.taskId ? childCreationDraftId(kind, options.taskId) : childCreationDraftId(kind, objectiveId);
    if (childCreationIsSubmitting(childCreationSession)) {
      notify("草稿正在创建，请稍后");
      return;
    }

    if (childCreationIsAwaitingSnapshot(childCreationSession)) {
      notify("草稿正在同步，请稍后");
      return;
    }

    const currentDraft = childCreationDraft(childCreationSession);
    if (currentDraft && currentDraft.id !== rowId) {
      notify("请先完成当前草稿");
      setEditingTarget(childCreationTarget(currentDraft));
      return;
    }

    if (kind === "subtask") {
      const action = options.taskId ? challengeState.tasks.find((item) => item.id === options.taskId) : null;
      if (!action) return;
      if (!canMutateWorkItemsForObjective(action.linkedObjectiveId)) {
        notifyUnavailableWorkItemMutation(action.linkedObjectiveId, "目标当前阶段不能新增子行动项");
        return;
      }

      const draft: ChildCreationDraft = {
        id: rowId,
        kind,
        objectiveId: action.linkedObjectiveId,
        taskId: action.id,
        afterItemId: options.afterItemId,
        title: currentDraft?.id === rowId ? currentDraft.title : "",
      };
      setChildCreationSession((current) => beginChildCreationSession(current, draft));
      setEditingTarget(childCreationTarget(draft));
      setCollapsedActionIds((items) => withoutItem(items, action.id));
      setOpenActionId(null);
      setActiveActionId(null);
      return;
    }

    const objective = challengeState.objectives.find((item) => item.id === objectiveId);
    if (!objective) return;

    if (kind === "metric") {
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

      const draft: ChildCreationDraft = {
        id: rowId,
        kind,
        objectiveId,
        source: action.source,
        title: currentDraft?.id === rowId ? currentDraft.title : "",
      };
      setChildCreationSession((current) => beginChildCreationSession(current, draft));
      setEditingTarget(childCreationTarget(draft));
      setOpenActionId(null);
      setActiveActionId(null);
      return;
    }

    if (!canMutateWorkItemsForObjective(objectiveId)) {
      notifyUnavailableWorkItemMutation(objectiveId, "目标当前阶段不能新增行动项");
      return;
    }

    const draft: ChildCreationDraft = {
      id: rowId,
      kind,
      objectiveId,
      title: currentDraft?.id === rowId ? currentDraft.title : "",
    };
    setChildCreationSession((current) => beginChildCreationSession(current, draft));
    setEditingTarget(childCreationTarget(draft));
    setOpenActionId(null);
    setActiveActionId(null);
  };

  const addBounty = (objectiveId: string) => {
    beginChildCreationDraft("metric", objectiveId);
  };

  const addAction = (objectiveId: string) => {
    beginChildCreationDraft("action", objectiveId);
  };

  const addSubAction = (actionId: string, afterItemId?: string) => {
    const action = challengeState.tasks.find((item) => item.id === actionId);
    if (!action) return;
    if (!canMutateWorkItemsForObjective(action.linkedObjectiveId)) {
      notifyUnavailableWorkItemMutation(action.linkedObjectiveId, "目标当前阶段不能新增子行动项");
      return;
    }
    beginChildCreationDraft("subtask", action.linkedObjectiveId, { afterItemId, taskId: actionId });
  };

  const beginEdit = (target: ChallengeTarget) => {
    if (isChildCreationTarget(target)) {
      if (temporaryChildRow?.id === target.id && temporaryChildRow.status !== "submitting") {
        setEditingTarget(childCreationTarget(temporaryChildRow));
        setOpenActionId(null);
      } else {
        notify("请先完成当前草稿");
        if (temporaryChildRow) setEditingTarget(childCreationTarget(temporaryChildRow));
        setOpenActionId(null);
      }
      return;
    }
    if (!requireTargetPermission(target, "edit")) return;
    setEditingTarget(target);
    setOpenActionId(null);
  };

  const createDraftObjective = (title: string, context: TitleSubmissionContext) => {
    if (draftIsSubmitting) return false;

    const value = title.trim();
    if (!value) {
      if (shouldCancelEmptyCreationDraft(title, context)) {
        const cancelled = cancelObjectiveCreationSession(objectiveCreationSession);
        setObjectiveCreationSession(cancelled.session);
        restoreDraftReturnContext(cancelled.returnContext);
        setEditingTarget(null);
        return true;
      }
      notify("标题不能为空");
      setObjectiveCreationSession((current) => updateObjectiveCreationDraftTitle(current, title));
      return false;
    }

    const creationProject = objectiveCreationDraftProject(objectiveCreationSession);

    const orderAnchor = draftOrderAnchor(displayedGroups);
    setObjectiveCreationSession((current) => submitObjectiveCreationDraft(current, value, orderAnchor));
    void createObjective({
      title: value,
      whyItMatters: "待补充",
      cycle: defaultCycleLabel(),
      boundary: "待补充",
      finalDueAt: defaultFinalDueAt(),
      projectId: creationProject?.projectId ?? null,
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
    setMemberFilter(returnContext.member);
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
    if (editingTarget && isChildCreationTarget(editingTarget)) {
      setChildCreationSession(cancelChildCreationSession);
      setEditingTarget(null);
      return;
    }
    setEditingTarget(null);
  };

  const updateScope = (next: ChallengeScope) => {
    setObjectiveCreationSession(clearSubmittedObjectiveCreation);
    setChildCreationSession(clearChildCreationSession);
    setTitleEditOverlays([]);
    setObjectiveInteractionAnchor(null);
    setScope(next);
  };

  const updateCycleFilter = (next: ChallengeCycleFilter) => {
    setObjectiveCreationSession(clearSubmittedObjectiveCreation);
    setChildCreationSession(clearChildCreationSession);
    setTitleEditOverlays([]);
    setObjectiveInteractionAnchor(null);
    setCycleFilter(next);
  };

  const updateMemberFilter = (next: ChallengeMemberFilter) => {
    setObjectiveCreationSession(clearSubmittedObjectiveCreation);
    setChildCreationSession(clearChildCreationSession);
    setTitleEditOverlays([]);
    setObjectiveInteractionAnchor(null);
    setMemberFilter(next);
  };

  const updateStatusFilter = (next: ChallengeStatusFilter) => {
    setObjectiveCreationSession(clearSubmittedObjectiveCreation);
    setChildCreationSession(clearChildCreationSession);
    setTitleEditOverlays([]);
    setObjectiveInteractionAnchor(null);
    setStatusFilter(next);
  };

  const createChildDraft = (target: ChallengeTarget, title: string, context: TitleSubmissionContext) => {
    const row = temporaryChildRow;
    if (!row || row.id !== target.id || row.status === "submitting") return false;
    if (row.kind === "subtask" && !row.taskId) return false;

    const value = title.trim();
    if (!value) {
      if (shouldCancelEmptyCreationDraft(title, context)) {
        setChildCreationSession(cancelChildCreationSession);
        setEditingTarget(null);
        return true;
      }
      notify("标题不能为空");
      setChildCreationSession((current) => updateChildCreationDraftTitle(current, title));
      return false;
    }

    const submittingSession = submitChildCreationDraft(childCreationSession, value, `child-create-${Date.now()}-${childCreationSubmissionSequenceRef.current++}`);
    if (submittingSession.status !== "submittingDraft") return false;
    setChildCreationSession(submittingSession);
    setEditingTarget(null);

    if (row.kind === "metric") {
      void createResult({
        objectiveId: row.objectiveId,
        title: value,
        metricName: value,
        source: row.source ?? "managerDefined",
        definer: currentUser?.name ?? currentMember,
      }).then((result) => {
        if (result) {
          setChildCreationSession((current) => completeChildCreationDraft(current, submittingSession, { kind: "metric", result }));
        } else {
          setChildCreationSession((current) => failChildCreationDraft(current, submittingSession));
        }
      });
      return true;
    }

    if (row.kind === "subtask") {
      const taskId = row.taskId;
      if (!taskId) return false;
      void createTaskChecklistItem(taskId, { afterItemId: row.afterItemId, label: value }).then((item) => {
        if (item) {
          setChildCreationSession((current) => completeChildCreationDraft(current, submittingSession, { kind: "subtask", taskId, item, afterItemId: row.afterItemId }));
        } else {
          setChildCreationSession((current) => failChildCreationDraft(current, submittingSession));
        }
      });
      return true;
    }

    void createTask({
      title: value,
      description: "",
      assignee: currentMember,
      priority: "High",
      linkedObjectiveId: row.objectiveId,
    }).then((task) => {
      if (task) {
        setChildCreationSession((current) => completeChildCreationDraft(current, submittingSession, { kind: "action", task }));
      } else {
        setChildCreationSession((current) => failChildCreationDraft(current, submittingSession));
      }
    });
    return true;
  };

  const saveTitle = (target: ChallengeTarget, title: string, context: TitleSubmissionContext) => {
    if (target.type === "objective" && target.id === draftObjectiveId) return createDraftObjective(title, context);
    if (isChildCreationTarget(target)) return createChildDraft(target, title, context);

    const value = title.trim();
    if (!value) {
      notify("标题不能为空");
      return false;
    }

    const overlayId = applyTitleEditOverlay(titleEditOverlayForTarget(target, value));
    if (target.type === "objective") {
      void updateObjectiveTitle(target.id, value).then((ok) => {
        if (!ok) removeTitleEditOverlay(overlayId);
      });
    }
    if (target.type === "bounty") {
      void updateResultTitle(target.id, value).then((ok) => {
        if (!ok) removeTitleEditOverlay(overlayId);
      });
    }
    if (target.type === "action") {
      void updateTaskTitle(target.id, value).then((ok) => {
        if (!ok) removeTitleEditOverlay(overlayId);
      });
    }
    if (target.type === "subAction") {
      void updateTaskChecklistItemLabel(target.actionId, target.id, value).then((ok) => {
        if (!ok) removeTitleEditOverlay(overlayId);
      });
    }
    setEditingTarget(null);
    return true;
  };

  const saveMetricDifficulty = async (target: ChallengeTarget, uncertaintyLevel: UncertaintyLevel) => {
    if (target.type !== "bounty") return false;
    if (!requireTargetPermission(target, "edit")) return false;
    return updateResultUncertaintyLevel(target.id, uncertaintyLevel);
  };

  const saveMetricDetails = async (target: ChallengeTarget, details: ResultDetailsInput) => {
    if (target.type !== "bounty") return false;
    if (!requireTargetPermission(target, "edit")) return false;
    return updateResultDetails(target.id, details);
  };

  const deleteTarget = (target: ChallengeTarget) => {
    if (target.type === "objective" && target.id === draftObjectiveId) {
      const cancelled = cancelObjectiveCreationSession(objectiveCreationSession);
      setObjectiveCreationSession(cancelled.session);
      restoreDraftReturnContext(cancelled.returnContext);
      setEditingTarget(null);
      return;
    }
    if (isChildCreationTarget(target)) {
      setChildCreationSession(cancelChildCreationSession);
      setEditingTarget(null);
      return;
    }

    if (!requireTargetPermission(target, "delete")) return;
    if (!window.confirm(deleteConfirmMessage(target, challengeState))) return;

    if (childCreationOverlayMatchesTarget(childCreationSession, target)) setChildCreationSession(clearSubmittedChildCreation);
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
    if (isChildCreationTarget(target)) {
      notify("请先完成草稿标题");
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
    if (isChildCreationTarget(target)) {
      if (action === "edit") beginEdit(target);
      if (action === "delete") deleteTarget(target);
      if (action === "copyLink" || action === "comment") notify("请先完成草稿标题");
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
      notifyUnavailableWorkItemMutation(action.linkedObjectiveId);
      return;
    }
    const overlayId = applyCompletionOverlay({ type: "task", taskId: actionId, done });
    void setTaskCompletion(actionId, done).then((ok) => {
      if (!ok) removeCompletionOverlay(overlayId);
    });
  };

  const setSubActionDone = (actionId: string, itemId: string, done: boolean) => {
    const action = challengeState.tasks.find((item) => item.id === actionId);
    if (!action) return;
    if (!canMutateWorkItemsForObjective(action.linkedObjectiveId)) {
      notifyUnavailableWorkItemMutation(action.linkedObjectiveId, "目标当前阶段不能修改子行动项");
      return;
    }
    const overlayId = applyCompletionOverlay({ type: "subtask", taskId: actionId, itemId, done });
    void updateTaskChecklistItem(actionId, itemId, done).then((ok) => {
      if (!ok) removeCompletionOverlay(overlayId);
    });
  };

  const approveAnchoredChallengeApplication = async (objectiveId: string, applicationId: string) => {
    const anchor = createListItemAnchor(displayedGroups, objectiveId, objectiveGroupId);
    if (anchor) setObjectiveInteractionAnchor(anchor);
    const ok = await approveChallengeApplication(objectiveId, applicationId);
    if (!ok && anchor) setObjectiveInteractionAnchor((current) => (current?.itemId === objectiveId ? null : current));
    return ok;
  };

  const rejectAnchoredChallengeApplication = async (objectiveId: string, applicationId: string) => {
    const anchor = createListItemAnchor(displayedGroups, objectiveId, objectiveGroupId);
    if (anchor) setObjectiveInteractionAnchor(anchor);
    const ok = await rejectChallengeApplication(objectiveId, applicationId);
    if (!ok && anchor) setObjectiveInteractionAnchor((current) => (current?.itemId === objectiveId ? null : current));
    return ok;
  };

  const saveObjectiveDeadline = async (objectiveId: string, finalDueAt: string) => {
    const anchor = createListItemAnchor(displayedGroups, objectiveId, objectiveGroupId);
    if (anchor) setObjectiveInteractionAnchor(anchor);
    const ok = await updateObjectiveFinalDueAt(objectiveId, finalDueAt);
    if (!ok && anchor) setObjectiveInteractionAnchor((current) => (current?.itemId === objectiveId ? null : current));
    return ok;
  };

  const releaseObjectiveInteractionAnchorOutside = (target: EventTarget | null) => {
    if (!objectiveInteractionAnchor || !(target instanceof Element)) return;
    const panel = target.closest<HTMLElement>("[data-objective-panel-id]");
    if (panel?.dataset.objectivePanelId !== objectiveInteractionAnchor.itemId) {
      setObjectiveInteractionAnchor(null);
    }
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
      if (dragItem.type === "objective") {
        if (currentUser?.role !== "admin") {
          notify("只有指挥官可以移动目标项目归属");
          setDragItem(null);
          setDropTarget(null);
          return;
        }
        if (target.type === "project") {
          void setObjectiveProject(dragItem.id, target.projectId);
        }
        setDragItem(null);
        setDropTarget(null);
        return;
      }
      if (dragItem.type === "bounty" && !canMutateMetricForObjective(dragItem.objectiveId)) {
        notifyUnavailableMetricEdit(dragItem.objectiveId);
        setDragItem(null);
        setDropTarget(null);
        return;
      }
      if (dragItem.type !== "bounty" && !canAccessDragItem(challengeState, role, dragItem)) {
        const key = permissionKeyForChallengeAction(resourceForDragItem(dragItem), "edit");
        if (key) notify(permissionDeniedMessage(key));
        setDragItem(null);
        setDropTarget(null);
        return;
      }
      if (dragItem.type === "action" && !canMutateWorkItemsForObjective(dragItem.objectiveId)) {
        notifyUnavailableWorkItemMutation(dragItem.objectiveId, "目标当前阶段不能移动行动项");
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
      className="orf-challenge-workbench grid gap-4"
      onFocusCapture={(event) => releaseObjectiveInteractionAnchorOutside(event.target)}
      onPointerDown={(event) => {
        releaseObjectiveInteractionAnchorOutside(event.target);
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
        member={memberFilter}
        memberOptions={memberOptions}
        onCycleChange={updateCycleFilter}
        onMemberChange={updateMemberFilter}
        onScopeChange={updateScope}
        onStatusChange={updateStatusFilter}
        showMemberFilter={canFilterByMember}
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
          temporaryChildRow,
          dragDrop,
          editingTarget: effectiveEditingTarget,
          alignmentRequests: challengeState.objectiveAlignmentRequests,
          trialReviews: challengeState.objectiveTrialReviews,
          currentUser,
          draftObjectiveId,
          canCreateObjective,
          canManageProjects: currentUser?.role === "admin",
          metricActionLabel: (objective) =>
            metricCreationActionForObjective({
              objective,
              currentUser,
              permissionRules: challengeState.permissionRules,
              now,
            })?.label ?? null,
          metricEditAccess: metricEditAccessForObjectiveId,
          canPublishObjective: () => canCreateObjective,
          canRecruitObjective: (objective) =>
            canRecruitObjectiveChallengers({
              objective,
              currentUser,
              permissionRules: challengeState.permissionRules,
            }),
          canMutateMetrics: canMutateMetricForObjective,
          canMutateWorkItems: canMutateWorkItemsForObjective,
          objectiveDeadlineEditState,
          onActionDoneChange: setActionDone,
          onActionRowAction: handleRowAction,
          onActiveActionChange: activateRowAction,
          onAddAction: addAction,
          onAddBounty: addBounty,
          onAddObjective: (projectId) => beginObjectiveCreation({ projectId }),
          onAddSubAction: addSubAction,
          onApproveApplication: approveAnchoredChallengeApplication,
          onCancelEdit: cancelEdit,
          onTemporaryChildTitleChange: (title) => setChildCreationSession((current) => updateChildCreationDraftTitle(current, title)),
          onDraftTitleChange: (title) => setObjectiveCreationSession((current) => updateObjectiveCreationDraftTitle(current, title)),
          onEditTarget: beginEdit,
          onFreezeObjective: freezeObjective,
          onRequestAlignment: requestObjectiveAlignment,
          onReviewAlignment: reviewObjectiveAlignment,
          onOpenActionChange: setOpenActionId,
          onPublishObjective: publishObjective,
          onRecruitObjective: (objectiveId) => openModal({ type: "recruitChallengers", objectiveId }),
          onRejectApplication: rejectAnchoredChallengeApplication,
          onCreateProject: (name) => createProject({ name }),
          onSaveObjectiveDeadline: saveObjectiveDeadline,
          onSetObjectiveProject: setObjectiveProject,
          onUnavailableObjectiveDeadline: notifyUnavailableObjectiveDeadline,
          onUnavailableMetricEdit: notifyUnavailableMetricEdit,
          onSaveMetricDetails: saveMetricDetails,
          onSaveMetricDifficulty: saveMetricDifficulty,
          onSaveTitle: saveTitle,
          onSubActionDoneChange: setSubActionDone,
          onToggleAction: (actionId) => setCollapsedActionIds((items) => toggleSetItem(items, actionId)),
          onToggleBounty: (bountyId) => setCollapsedBountyIds((items) => toggleSetItem(items, bountyId)),
          openActionId,
          canManageFlow: canShowFrontend(currentUser, "challenge.scope.all"),
        }}
        now={now}
        projects={challengeState.projects}
        scope={scope}
      />

      {commentTarget && (
        <CommentPanel
          key={`${commentTarget.type}:${commentTarget.id}`}
          canManageAllComments={hasPermission(currentUser, state.permissionRules, "comment.manage")}
          currentMember={currentMember}
          currentUserAvatarUrl={currentUser?.avatarUrl}
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

function challengeAnchorIdForLinkedTarget(target: ChallengeUrlTarget) {
  return `${target.type}:${target.id}`;
}

function challengeTargetElement(anchorId: string) {
  return (
    Array.from(document.querySelectorAll<HTMLElement>("[data-challenge-row-target]")).find((element) => element.dataset.challengeRowTarget === anchorId) ??
    null
  );
}

function objectiveIdForLinkedChallengeTarget(target: ChallengeUrlTarget, state: OrfState) {
  if (target.type === "objective") return state.objectives.some((objective) => objective.id === target.id) ? target.id : null;
  if (target.type === "bounty") return state.results.find((result) => result.id === target.id)?.objectiveId ?? null;
  if (target.type === "action") return state.tasks.find((task) => task.id === target.id)?.linkedObjectiveId ?? null;
  return state.tasks.find((task) => task.checklist.some((item) => item.id === target.id))?.linkedObjectiveId ?? null;
}

function parentActionIdForLinkedSubAction(target: ChallengeUrlTarget, state: OrfState) {
  if (target.type !== "subAction") return null;
  return state.tasks.find((task) => task.checklist.some((item) => item.id === target.id))?.id ?? null;
}

function rowActionIdForLinkedChallengeTarget(target: ChallengeUrlTarget, state: OrfState) {
  if (!objectiveIdForLinkedChallengeTarget(target, state)) return null;
  if (target.type !== "subAction") return challengeAnchorIdForLinkedTarget(target);

  const parentActionId = parentActionIdForLinkedSubAction(target, state);
  return parentActionId ? `subAction:${parentActionId}:${target.id}` : null;
}

function normalizeObjectiveCreationProject(project: ObjectiveCreationProject): ObjectiveCreationProject {
  return { projectId: project.projectId?.trim() || null };
}

function objectiveDeadlineUnavailableMessage(editState: Extract<ObjectiveDeadlineEditState, { status: "blocked" }>) {
  if (editState.reason === "noPermission") return "只有指挥官可以修改截止日期";
  if (editState.reason === "lifecycleLocked") return "当前状态不允许修改截止日期";
  return "目标不可用，不能修改截止日期";
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

function objectiveGroupId(group: ObjectiveNode) {
  return group.objective.id;
}
