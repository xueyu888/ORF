import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { CommentPanel, type CommentReplyInput } from "./comments/CommentPanel";
import { useConfirmDialog } from "../../components/ConfirmDialog";
import { ChallengeToolbar } from "./components/ChallengeToolbar";
import { ChallengeTree } from "./components/ChallengeTree";
import { MetricInspectorPanel } from "./components/MetricInspectorPanel";
import { MobileChallengeFocusBar, MobileChallengeOverview } from "./components/MobileChallengeOverview";
import { TeamDashboard } from "./components/TeamDashboard";
import { canShowFrontend } from "../../config/frontendVisibility";
import { hasPermission } from "../../config/permissions";
import { getUserPreferences, saveUserPreferences } from "../../state/apiClient";
import { useOrf } from "../../state/OrfProvider";
import { resolveObjectiveDeadlineEditState, type ObjectiveDeadlineEditState } from "../../domain/orfDeadline";
import { isObjectiveChallenger } from "../../domain/orfObjectiveParticipants";
import { objectiveLifecycleInitialState, objectiveStageForFlowStatus } from "../../domain/orfLifecycle";
import type { ResultDetailsInput } from "../../domain/orfResultDetails";
import { fetchMyLocalSettlementReview, type LocalSettlementReview } from "../../services/localSettlementClient";
import type { Objective, ObjectiveSettlementEvent, OrfProject, OrfState, Result } from "../../types/orf";
import { localDateString } from "../../utils/date";
import { applyListItemAnchor, createListItemAnchor, listContainsAnchoredItem, type ListItemAnchor } from "../interaction/listItemAnchor";
import { useChallengeReadModelData, type ChallengeReadModelState } from "./hooks/useChallengeReadModelData";
import { useChallengeMobileViewport } from "./hooks/useChallengeMobileViewport";
import { challengeLinkForTarget, parseChallengeTargetHash, type ChallengeUrlTarget } from "./model/challengeLinks";
import { commentCountsByTarget, commentTargetForChallengeTarget } from "./model/challengeComments";
import { canDropItem } from "./model/challengeDragDrop";
import {
  defaultCollapsedObjectiveIdsForChallengeTree,
  mergeNewDefaultCollapsedObjectiveIds,
} from "./model/challengeDefaultCollapse";
import { canAccessDragItem, canAccessTarget, permissionDeniedMessage, permissionKeyForChallengeAction, resourceForDragItem, resourceForTarget } from "./model/challengePermissions";
import {
  challengeCycleOptions,
  challengeMemberOptions,
  filterChallengeGroups,
  normalizeChallengeStatusFilterSelection,
  sortChallengeGroups,
  type ChallengeCycleFilter,
  type ChallengeMemberFilter,
  type ChallengeProjectFilter,
  type ChallengeStatusFilterSelection,
} from "./model/challengeFilters";
import {
  challengePlanFilterPreferenceFromRecord,
  challengePlanFilterPreferenceKey,
  challengePlanFilterPreferenceToRecord,
  defaultChallengePlanFilterPreference,
  type ChallengePlanFilterPreference,
} from "./model/challengeFilterPreferences";
import { buildChallengeTree } from "./model/challengeTreeModel";
import { deleteConfirmMessage } from "./model/deleteConfirm";
import { unassignedObjectiveProjectName } from "./model/projectGroups";
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
  canMutateMetricExecutionCompletion,
  canMutateObjectiveWorkItems,
  canRecruitObjectiveChallengers,
  canReinforceObjectiveChallengers,
  canSubmitObjectivePeerReview,
  metricCreationActionForObjective,
  metricDeleteAccessForObjective,
  metricDeleteUnavailableMessage,
  metricEditAccessForObjective,
  metricEditUnavailableMessage,
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
    stage: objectiveStageForFlowStatus(objectiveLifecycleInitialState.flowStatus),
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

type PeerReviewActionStatus = "loading" | "notSubmitted" | "scored" | "abstained" | "error";
type PeerReviewActionStatusByObjectiveId = Record<string, PeerReviewActionStatus>;

const peerReviewActionObjectiveIdSeparator = "\u001f";
const emptyObjectiveSettlementEvents: readonly ObjectiveSettlementEvent[] = [];

function peerReviewActionLabelForStatus(status: PeerReviewActionStatus | undefined) {
  if (status === "scored") return "更新匿名互评";
  if (status === "abstained") return "更新弃权说明";
  return null;
}

function peerReviewActionStatusForReview(review: LocalSettlementReview | null): PeerReviewActionStatus {
  return review?.status ?? "notSubmitted";
}

async function loadPeerReviewActionStatus(objectiveId: string): Promise<[string, PeerReviewActionStatus]> {
  try {
    const result = await fetchMyLocalSettlementReview({ objectiveId });
    return [objectiveId, peerReviewActionStatusForReview(result.review)];
  } catch {
    return [objectiveId, "error"];
  }
}

function peerReviewActionStatusesEqual(left: PeerReviewActionStatusByObjectiveId, right: PeerReviewActionStatusByObjectiveId) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length && leftKeys.every((key) => left[key] === right[key]);
}

export function ChallengePlanPage() {
  const confirm = useConfirmDialog();
  const {
    addComment,
    approveChallengeApplication,
    createTaskChecklistItem,
    currentUser,
    deleteCommentMessage,
    deleteObjective,
    deleteProject,
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
    updateObjectiveBasePoints,
    setObjectiveProject,
    updateObjectiveTitle,
    updateResultDetails,
    updateResultExecutionCompletion,
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
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const hasObjectiveCreationEntry = searchParams.get("create") === "objective";
  const linkedCommentId = useMemo(() => searchParams.get("comment")?.trim() || null, [searchParams]);
  const linkedChallengeTarget = useMemo(() => parseChallengeTargetHash(location.hash), [location.hash]);
  const [scope, setScope] = useState<ChallengeScope>(canShowAllChallenges ? "all" : "mine");
  const [cycleFilter, setCycleFilter] = useState<ChallengeCycleFilter>("all");
  const [memberFilter, setMemberFilter] = useState<ChallengeMemberFilter>("all");
  const [projectFilter, setProjectFilter] = useState<ChallengeProjectFilter>("all");
  const [statusFilters, setStatusFilters] = useState<ChallengeStatusFilterSelection>([]);
  const [collapsedBountyIds, setCollapsedBountyIds] = useState<Set<string>>(() => new Set());
  const [collapsedActionIds, setCollapsedActionIds] = useState<Set<string>>(() => new Set());
  const [mobileFocusedObjectiveId, setMobileFocusedObjectiveId] = useState<string | null>(null);
  const [commentTarget, setCommentTarget] = useState<ChallengeCommentTarget | null>(null);
  const [selectedMetricId, setSelectedMetricId] = useState<string | null>(null);
  const [metricInspectorCollapsed, setMetricInspectorCollapsed] = useState(false);
  const [metricInspectorDirty, setMetricInspectorDirty] = useState(false);
  const [pendingSelectedMetricId, setPendingSelectedMetricId] = useState<string | null>(null);
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
  const [peerReviewActionStatuses, setPeerReviewActionStatuses] = useState<PeerReviewActionStatusByObjectiveId>({});
  const peerReviewActionStatusUserIdRef = useRef<string | null>(null);
  const childCreationSubmissionSequenceRef = useRef(0);
  const completionOverlaySequenceRef = useRef(0);
  const appliedDefaultCollapsedObjectiveIdsRef = useRef<Set<string>>(new Set());
  const titleEditOverlaySequenceRef = useRef(0);
  const handledObjectiveCreationEntryRef = useRef(false);
  const appliedLinkedTargetRef = useRef<string | null>(null);
  const appliedLinkedCommentRef = useRef<string | null>(null);
  const filterPreferenceTouchedRef = useRef(false);
  const now = useMinuteNow();
  const today = localDateString(now);
  const mobileViewport = useChallengeMobileViewport();

  useEffect(() => {
    if (!canShowAllChallenges) {
      if (scope === "all") {
        setScope("mine");
      }
    }
  }, [canShowAllChallenges, scope]);

  const applyChallengePlanFilterPreference = useCallback((preference: ChallengePlanFilterPreference) => {
    setScope(canShowAllChallenges ? preference.scope : "mine");
    setCycleFilter(preference.cycle);
    setMemberFilter(preference.member);
    setProjectFilter(preference.project);
    setStatusFilters(normalizeChallengeStatusFilterSelection(preference.status));
  }, [canShowAllChallenges]);

  const persistChallengePlanFilterPreference = useCallback((preference: ChallengePlanFilterPreference) => {
    if (!currentUser) return;
    void saveUserPreferences({
      filterPreferences: {
        [challengePlanFilterPreferenceKey]: challengePlanFilterPreferenceToRecord({
          ...preference,
          scope: canShowAllChallenges ? preference.scope : "mine",
          status: normalizeChallengeStatusFilterSelection(preference.status),
        }),
      },
    }).catch(() => undefined);
  }, [canShowAllChallenges, currentUser?.id]);

  useEffect(() => {
    let cancelled = false;
    const currentUserId = currentUser?.id ?? null;
    if (!currentUserId) return () => {
      cancelled = true;
    };
    filterPreferenceTouchedRef.current = false;

    void getUserPreferences({ userId: currentUserId })
      .then((preferences) => {
        if (cancelled || filterPreferenceTouchedRef.current || linkedChallengeTarget || hasObjectiveCreationEntry) return;
        applyChallengePlanFilterPreference(
          challengePlanFilterPreferenceFromRecord(
            preferences.filterPreferences[challengePlanFilterPreferenceKey],
            { defaultScope: canShowAllChallenges ? "all" : "mine" },
          ),
        );
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [applyChallengePlanFilterPreference, canShowAllChallenges, currentUser?.id]);

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
  const challengeState = useMemo<ChallengeReadModelState>(
    () => applyTaskCompletionOverlays(applyTitleEditOverlays(applyChildCreationOverlay(baseChallengeState, childOverlay), titleEditOverlays), completionOverlays),
    [baseChallengeState, childOverlay, completionOverlays, titleEditOverlays],
  );

  const setMetricCompletion = useCallback((resultId: string, completed: boolean) => {
    void updateResultExecutionCompletion(resultId, completed);
  }, [updateResultExecutionCompletion]);

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
  const objectiveSettlementEventsByObjectiveId = useMemo(() => {
    const map = new Map<string, ObjectiveSettlementEvent[]>();
    for (const event of challengeState.objectiveSettlementEvents) {
      const events = map.get(event.objectiveId);
      if (events) {
        events.push(event);
      } else {
        map.set(event.objectiveId, [event]);
      }
    }
    return map;
  }, [challengeState.objectiveSettlementEvents]);
  const settlementEventsForObjective = useCallback(
    (objectiveId: string) => objectiveSettlementEventsByObjectiveId.get(objectiveId) ?? emptyObjectiveSettlementEvents,
    [objectiveSettlementEventsByObjectiveId],
  );
  const peerReviewActionObjectiveIdsKey = useMemo(
    () =>
      displaySourceGroups
        .filter((group) =>
          canSubmitObjectivePeerReview({
            objective: group.objective,
            currentUser,
            settlementEvents: settlementEventsForObjective(group.objective.id),
            today,
          }),
        )
        .map((group) => group.objective.id)
        .sort()
        .join(peerReviewActionObjectiveIdSeparator),
    [currentUser, displaySourceGroups, settlementEventsForObjective, today],
  );
  const cycleOptions = useMemo(() => challengeCycleOptions(displaySourceGroups), [displaySourceGroups]);
  const memberOptions = useMemo(() => challengeMemberOptions(displaySourceGroups, challengeState.users), [challengeState.users, displaySourceGroups]);
  const projectOptions = useMemo(
    () => [
      { label: "全部项目", value: "all" as const, alwaysVisible: true },
      ...challengeState.projects.map((project) => ({ label: project.name, value: project.id })),
      { label: unassignedObjectiveProjectName, value: "unassigned" as const, alwaysVisible: true },
    ],
    [challengeState.projects],
  );
  const filteredGroups = useMemo(
    () => sortChallengeGroups(filterChallengeGroups(displaySourceGroups, { cycle: cycleFilter, member: effectiveMemberFilter, project: projectFilter, status: statusFilters })),
    [cycleFilter, displaySourceGroups, effectiveMemberFilter, projectFilter, statusFilters],
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
  const defaultCollapsedObjectiveIds = useMemo(
    () => defaultCollapsedObjectiveIdsForChallengeTree(displayedGroups),
    [displayedGroups],
  );
  const mobileFocusedGroup = useMemo(
    () => displayedGroups.find((group) => group.objective.id === mobileFocusedObjectiveId) ?? null,
    [displayedGroups, mobileFocusedObjectiveId],
  );
  const challengeTreeGroups = mobileViewport && mobileFocusedGroup ? [mobileFocusedGroup] : displayedGroups;
  const commentCounts = useMemo(() => commentCountsByTarget(challengeState.comments), [challengeState.comments]);
  const hasContentFilters = cycleFilter !== "all" || effectiveMemberFilter !== "all" || statusFilters.length > 0;
  const hasActiveFilters = hasContentFilters || projectFilter !== "all";
  const visibleProjects = useMemo(
    () => projectsForChallengeTree(challengeState.projects, displayedGroups, hasContentFilters, projectFilter),
    [challengeState.projects, displayedGroups, hasContentFilters, projectFilter],
  );
  const challengeTreeVisibleProjects = useMemo(() => {
    if (!mobileViewport || !mobileFocusedGroup) return visibleProjects;
    const projectId = mobileFocusedGroup.objective.projectId?.trim();
    return projectId ? challengeState.projects.filter((project) => project.id === projectId) : [];
  }, [challengeState.projects, mobileFocusedGroup, mobileViewport, visibleProjects]);
  const displayedMetricIds = useMemo(
    () => new Set(displayedGroups.flatMap((group) => group.bounties.map((bounty) => bounty.result.id))),
    [displayedGroups],
  );
  const emptyText = hasActiveFilters
    ? "没有符合筛选条件的挑战目标。"
    : showAll
      ? "当前还没有挑战内容。"
      : "当前没有与你的挑战目标相关的内容。";

  useEffect(() => {
    if (defaultCollapsedObjectiveIds.size === 0) return;
    setCollapsedBountyIds((currentCollapsedIds) => {
      const next = mergeNewDefaultCollapsedObjectiveIds({
        appliedDefaultCollapsedIds: appliedDefaultCollapsedObjectiveIdsRef.current,
        currentCollapsedIds,
        defaultCollapsedIds: defaultCollapsedObjectiveIds,
      });
      appliedDefaultCollapsedObjectiveIdsRef.current = next.appliedDefaultCollapsedIds;
      return next.collapsedIds;
    });
  }, [defaultCollapsedObjectiveIds]);

  useEffect(() => {
    if (!mobileViewport) {
      setMobileFocusedObjectiveId(null);
      setCollapsedActionIds(new Set());
      return;
    }
    if (mobileFocusedObjectiveId && !mobileFocusedGroup) {
      setMobileFocusedObjectiveId(null);
    }
  }, [mobileFocusedGroup, mobileFocusedObjectiveId, mobileViewport]);

  useEffect(() => {
    if (mobileViewport && draftGroup) setMobileFocusedObjectiveId(draftGroup.objective.id);
  }, [draftGroup, mobileViewport]);

  useEffect(() => {
    const objectiveIds = peerReviewActionObjectiveIdsKey ? peerReviewActionObjectiveIdsKey.split(peerReviewActionObjectiveIdSeparator) : [];
    if (objectiveIds.length === 0) {
      peerReviewActionStatusUserIdRef.current = currentUser?.id ?? null;
      setPeerReviewActionStatuses((current) => (Object.keys(current).length === 0 ? current : {}));
      return undefined;
    }

    let cancelled = false;
    const previousStatusUserId = peerReviewActionStatusUserIdRef.current;
    const statusUserId = currentUser?.id ?? null;
    peerReviewActionStatusUserIdRef.current = statusUserId;
    setPeerReviewActionStatuses((current) => {
      const next = Object.fromEntries(
        objectiveIds.map((objectiveId) => [objectiveId, previousStatusUserId === statusUserId ? current[objectiveId] ?? "loading" : "loading"]),
      ) as PeerReviewActionStatusByObjectiveId;
      return peerReviewActionStatusesEqual(current, next) ? current : next;
    });

    void Promise.all(objectiveIds.map(loadPeerReviewActionStatus)).then((entries) => {
      if (cancelled) return;
      const next = Object.fromEntries(entries) as PeerReviewActionStatusByObjectiveId;
      setPeerReviewActionStatuses((current) => (peerReviewActionStatusesEqual(current, next) ? current : next));
    });

    return () => {
      cancelled = true;
    };
  }, [currentUser?.id, peerReviewActionObjectiveIdsKey]);

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
    if (projectFilter !== "all" && projectFilter !== "unassigned" && !challengeState.projects.some((project) => project.id === projectFilter)) {
      setProjectFilter("all");
    }
  }, [challengeState.projects, projectFilter]);
  useEffect(() => {
    if (!listContainsAnchoredItem(creationAnchoredGroups, objectiveInteractionAnchor, objectiveGroupId)) {
      setObjectiveInteractionAnchor(null);
    }
  }, [creationAnchoredGroups, objectiveInteractionAnchor]);
  useEffect(() => {
    if (!selectedMetricId || displayedMetricIds.has(selectedMetricId)) return;
    setSelectedMetricId(null);
    setMetricInspectorCollapsed(false);
    setMetricInspectorDirty(false);
    setPendingSelectedMetricId(null);
  }, [displayedMetricIds, selectedMetricId]);
  useEffect(() => {
    if (pendingSelectedMetricId && !displayedMetricIds.has(pendingSelectedMetricId)) {
      setPendingSelectedMetricId(null);
    }
  }, [displayedMetricIds, pendingSelectedMetricId]);
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
  const metricDeleteAccessForObjectiveId = (objectiveId: string) =>
    metricDeleteAccessForObjective({
      objective: objectiveById(objectiveId),
      currentUser,
      permissionRules: challengeState.permissionRules,
      now,
    });
  const canMutateMetricForObjective = (objectiveId: string) => metricEditAccessForObjectiveId(objectiveId).status === "allowed";
  const canToggleMetricCompletionForObjective = (objectiveId: string) =>
    canMutateMetricExecutionCompletion(objectiveById(objectiveId), currentUser);
  const notifyUnavailableMetricEdit = (objectiveId: string) => {
    const access = metricEditAccessForObjectiveId(objectiveId);
    if (access.status === "allowed") return;
    notify(metricEditUnavailableMessage(access));
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
  const metricTargetForResult = (result: Result): Extract<ChallengeTarget, { type: "bounty" }> => ({
    type: "bounty",
    id: result.id,
    title: result.title,
    objectiveId: result.objectiveId,
  });
  const selectedMetric = selectedMetricId ? challengeState.results.find((item) => item.id === selectedMetricId) ?? null : null;
  const pendingSelectedMetric = pendingSelectedMetricId ? challengeState.results.find((item) => item.id === pendingSelectedMetricId) ?? null : null;
  const selectedMetricObjective = selectedMetric ? objectiveById(selectedMetric.objectiveId) : undefined;
  const canEditTargetTitle = (target: ChallengeTarget) => {
    if (isChildCreationTarget(target)) return true;
    if (target.type === "objective") {
      if (target.id === draftObjectiveId) return true;
      return canEditObjectiveContent(currentUser);
    }
    if (target.type === "bounty") {
      return metricEditAccessForObjectiveId(target.objectiveId).status === "allowed";
    }
    if (target.type === "action" || target.type === "subAction") {
      return workItemMutationAccessForObjectiveId(target.objectiveId).status === "allowed";
    }
    return canAccessTarget(challengeState, role, target, "edit");
  };
  const selectMetric = (target: Extract<ChallengeTarget, { type: "bounty" }>) => {
    if (dragItem) return;
    if (metricInspectorDirty && selectedMetricId && selectedMetricId !== target.id) {
      setPendingSelectedMetricId(target.id);
      setMetricInspectorCollapsed(false);
      return;
    }
    setSelectedMetricId(target.id);
    setPendingSelectedMetricId(null);
    setMetricInspectorCollapsed(false);
  };
  const applyPendingMetricSelection = () => {
    if (!pendingSelectedMetricId) return;
    setSelectedMetricId(pendingSelectedMetricId);
    setPendingSelectedMetricId(null);
    setMetricInspectorDirty(false);
    setMetricInspectorCollapsed(false);
  };
  const closeMetricInspector = () => {
    if (metricInspectorDirty) {
      notify("请先保存或取消指标详情修改");
      return;
    }
    setMetricInspectorCollapsed(true);
    setPendingSelectedMetricId(null);
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

      // 创建入口接管筛选状态后，禁止仍在途的偏好读取覆盖“未归属目标”创建上下文。
      filterPreferenceTouchedRef.current = true;
      setObjectiveCreationSession((current) =>
        beginObjectiveCreationSession(
          current,
          { cycle: cycleFilter, member: memberFilter, project: projectFilter, scope, status: statusFilters },
          normalizedProject,
        ),
      );
      setEditingTarget(null);
      clearChildCreation();
      if (canShowAllChallenges) setScope("all");
      setCycleFilter("all");
      setMemberFilter("all");
      setProjectFilter(normalizedProject.projectId ?? "unassigned");
      setStatusFilters(["unassigned"]);
    },
    [
      canCreateObjective,
      canShowAllChallenges,
      childCreationSession,
      cycleFilter,
      memberFilter,
      notify,
      objectiveCreationSession.status,
      projectFilter,
      scope,
      statusFilters,
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
    const parentActionId = parentActionIdForLinkedSubAction(linkedChallengeTarget, challengeState) ?? parentActionIdForLinkedSubAction(linkedChallengeTarget, state);
    if (mobileViewport) {
      const sourceTasks = challengeState.tasks.length > 0 ? challengeState.tasks : state.tasks;
      const collapsedIds = new Set(
        sourceTasks
          .filter((task) => task.linkedObjectiveId === objectiveId && task.checklist.length > 0 && task.id !== parentActionId)
          .map((task) => task.id),
      );
      setCollapsedActionIds(collapsedIds);
      setMobileFocusedObjectiveId(objectiveId);
    }
    appliedLinkedTargetRef.current = linkedTargetKey;
    filterPreferenceTouchedRef.current = true;
    setObjectiveInteractionAnchor(null);

    if (canShowAllChallenges && scope !== "all") setScope("all");
    if (cycleFilter !== "all") setCycleFilter("all");
    if (memberFilter !== "all") setMemberFilter("all");
    if (statusFilters.length > 0) setStatusFilters([]);
    if (projectFilter !== "all") setProjectFilter("all");

    if (parentActionId) {
      setCollapsedActionIds((items) => (items.has(parentActionId) ? withoutItem(items, parentActionId) : items));
    }
  }, [canShowAllChallenges, challengeState, cycleFilter, linkedChallengeTarget, memberFilter, mobileViewport, projectFilter, scope, state, statusFilters]);

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
    if (!linkedCommentId || !linkedChallengeTarget) {
      appliedLinkedCommentRef.current = null;
      return;
    }

    const linkedCommentKey = `${challengeAnchorIdForLinkedTarget(linkedChallengeTarget)}:${linkedCommentId}`;
    if (appliedLinkedCommentRef.current === linkedCommentKey) return;

    const target = challengeTargetForLinkedChallengeTarget(linkedChallengeTarget, challengeState) ?? challengeTargetForLinkedChallengeTarget(linkedChallengeTarget, state);
    if (!target) return;

    appliedLinkedCommentRef.current = linkedCommentKey;
    setCommentTarget(commentTargetForChallengeTarget(target));
  }, [challengeState, linkedChallengeTarget, linkedCommentId, state]);

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
      const access = metricDeleteAccessForObjectiveId(target.objectiveId);
      if (access.status === "allowed") return true;
      notify(metricDeleteUnavailableMessage(access));
      return false;
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
    setProjectFilter(returnContext.project);
    setStatusFilters(normalizeChallengeStatusFilterSelection(returnContext.status));
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
    filterPreferenceTouchedRef.current = true;
    setObjectiveCreationSession(clearSubmittedObjectiveCreation);
    setChildCreationSession(clearChildCreationSession);
    setTitleEditOverlays([]);
    setObjectiveInteractionAnchor(null);
    setScope(next);
    persistChallengePlanFilterPreference({ cycle: cycleFilter, member: memberFilter, project: projectFilter, scope: next, status: statusFilters });
  };

  const updateCycleFilter = (next: ChallengeCycleFilter) => {
    filterPreferenceTouchedRef.current = true;
    setObjectiveCreationSession(clearSubmittedObjectiveCreation);
    setChildCreationSession(clearChildCreationSession);
    setTitleEditOverlays([]);
    setObjectiveInteractionAnchor(null);
    setCycleFilter(next);
    persistChallengePlanFilterPreference({ cycle: next, member: memberFilter, project: projectFilter, scope, status: statusFilters });
  };

  const updateMemberFilter = (next: ChallengeMemberFilter) => {
    filterPreferenceTouchedRef.current = true;
    setObjectiveCreationSession(clearSubmittedObjectiveCreation);
    setChildCreationSession(clearChildCreationSession);
    setTitleEditOverlays([]);
    setObjectiveInteractionAnchor(null);
    setMemberFilter(next);
    persistChallengePlanFilterPreference({ cycle: cycleFilter, member: next, project: projectFilter, scope, status: statusFilters });
  };

  const updateStatusFilters = (next: ChallengeStatusFilterSelection) => {
    filterPreferenceTouchedRef.current = true;
    setObjectiveCreationSession(clearSubmittedObjectiveCreation);
    setChildCreationSession(clearChildCreationSession);
    setTitleEditOverlays([]);
    setObjectiveInteractionAnchor(null);
    const status = normalizeChallengeStatusFilterSelection(next);
    setStatusFilters(status);
    persistChallengePlanFilterPreference({ cycle: cycleFilter, member: memberFilter, project: projectFilter, scope, status });
  };

  const updateProjectFilter = (next: ChallengeProjectFilter) => {
    filterPreferenceTouchedRef.current = true;
    setObjectiveCreationSession(clearSubmittedObjectiveCreation);
    setChildCreationSession(clearChildCreationSession);
    setTitleEditOverlays([]);
    setObjectiveInteractionAnchor(null);
    setProjectFilter(next);
    persistChallengePlanFilterPreference({ cycle: cycleFilter, member: memberFilter, project: next, scope, status: statusFilters });
  };

  const createProjectAndSelect = async (name: string) => {
    const project = await createProject({ name });
    if (!project) return null;
    filterPreferenceTouchedRef.current = true;
    setObjectiveCreationSession(clearSubmittedObjectiveCreation);
    setChildCreationSession(clearChildCreationSession);
    setTitleEditOverlays([]);
    setObjectiveInteractionAnchor(null);
    setCycleFilter("all");
    setMemberFilter("all");
    setProjectFilter(project.id);
    setStatusFilters([]);
    persistChallengePlanFilterPreference({ cycle: "all", member: "all", project: project.id, scope, status: [] });
    return project;
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
        source: row.source ?? "managerDefined",
        definerUserId: currentUser?.id ?? "",
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
      assigneeUserId: currentUser?.id ?? "",
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

  const saveMetricDetails = async (target: ChallengeTarget, details: ResultDetailsInput) => {
    if (target.type !== "bounty") return false;
    if (!requireTargetPermission(target, "edit")) return false;
    return updateResultDetails(target.id, details);
  };

  const deleteTarget = async (target: ChallengeTarget) => {
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
    if (!await confirm({
      title: "删除工作项",
      description: deleteConfirmMessage(target, challengeState),
      confirmLabel: "确认删除",
      tone: "danger",
    })) return;

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

  const saveObjectiveBasePoints = async (objectiveId: string, objectiveBasePoints: number) => {
    const anchor = createListItemAnchor(displayedGroups, objectiveId, objectiveGroupId);
    if (anchor) setObjectiveInteractionAnchor(anchor);
    const ok = await updateObjectiveBasePoints(objectiveId, objectiveBasePoints);
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
      if (!canDropItem(dragItem, target)) {
        setDragItem(null);
        setDropTarget(null);
        return;
      }
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
      data-mobile-objective-focus={mobileFocusedGroup ? "true" : undefined}
      onFocusCapture={(event) => releaseObjectiveInteractionAnchorOutside(event.target)}
      onPointerDown={(event) => {
        releaseObjectiveInteractionAnchorOutside(event.target);
        if (!openActionId) return;
        if (event.target instanceof Element && event.target.closest("[data-challenge-row-actions], [data-challenge-disclosure-action]")) return;
        setOpenActionId(null);
      }}
    >
      <div className="orf-challenge-workspace">
        <div className="orf-challenge-tree-pane">
          {showAll && (!mobileViewport || !mobileFocusedGroup) && <TeamDashboard groups={filteredGroups} />}
          <ChallengeToolbar
            canShowAll={canShowAllChallenges}
            canManageProjects={currentUser?.role === "admin"}
            cycle={cycleFilter}
            cycleOptions={cycleOptions}
            member={memberFilter}
            memberOptions={memberOptions}
            onCreateProject={createProjectAndSelect}
            onCycleChange={updateCycleFilter}
            onMemberChange={updateMemberFilter}
            onProjectChange={updateProjectFilter}
            onScopeChange={updateScope}
            onStatusChange={updateStatusFilters}
            project={projectFilter}
            projectOptions={projectOptions}
            showMemberFilter={canFilterByMember}
            scope={scope}
            status={statusFilters}
          />
          {mobileViewport && !mobileFocusedGroup ? (
            <MobileChallengeOverview
              groups={displayedGroups}
              onSelect={(objectiveId) => {
                const group = displayedGroups.find((item) => item.objective.id === objectiveId);
                setCollapsedActionIds(new Set(group?.actions.filter((action) => action.checklist.length > 0).map((action) => action.id) ?? []));
                setMobileFocusedObjectiveId(objectiveId);
                window.requestAnimationFrame(() => document.querySelector(".orf-main-content")?.scrollTo({ behavior: "smooth", top: 0 }));
              }}
              projects={challengeState.projects}
            />
          ) : (
            <>
              {mobileViewport && mobileFocusedGroup ? (
                <MobileChallengeFocusBar objectiveTitle={mobileFocusedGroup.objective.title} onBack={() => setMobileFocusedObjectiveId(null)} />
              ) : null}
              <ChallengeTree
            emptyText={emptyText}
            groups={challengeTreeGroups}
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
              notify,
              draftObjectiveId,
              canCreateObjective,
              canManageProjects: currentUser?.role === "admin",
              canEditTargetTitle,
              peerReviewActionLabel: (objectiveId) => peerReviewActionLabelForStatus(peerReviewActionStatuses[objectiveId]),
              settlementEventsForObjective,
              today,
              metricActionLabel: (objective) =>
                metricCreationActionForObjective({
                  objective,
                  currentUser,
                  permissionRules: challengeState.permissionRules,
                  now,
                })?.label ?? null,
              canPublishObjective: () => canCreateObjective,
              canRecruitObjective: (objective) =>
                canRecruitObjectiveChallengers({
                  objective,
                  currentUser,
                  permissionRules: challengeState.permissionRules,
                }),
              canReinforceObjective: (objective) =>
                canReinforceObjectiveChallengers({
                  objective,
                  currentUser,
                  permissionRules: challengeState.permissionRules,
                }),
              canMutateMetrics: canMutateMetricForObjective,
              canToggleMetricCompletion: canToggleMetricCompletionForObjective,
              canMutateWorkItems: canMutateWorkItemsForObjective,
              objectiveDeadlineEditState,
              onActionDoneChange: setActionDone,
              onActionRowAction: handleRowAction,
              onActiveActionChange: activateRowAction,
              onMetricCompletionChange: setMetricCompletion,
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
              onReinforceObjective: (objectiveId) => openModal({ type: "reinforceChallengers", objectiveId }),
              onRejectApplication: rejectAnchoredChallengeApplication,
              onCreateProject: (name) => createProject({ name }),
              onDeleteProject: deleteProject,
              onSaveObjectiveDeadline: saveObjectiveDeadline,
              onSaveObjectiveBasePoints: saveObjectiveBasePoints,
              onSetObjectiveProject: setObjectiveProject,
              onUnavailableObjectiveDeadline: notifyUnavailableObjectiveDeadline,
              onUnavailableMetricEdit: notifyUnavailableMetricEdit,
              onSaveTitle: saveTitle,
              onSelectMetric: selectMetric,
              onSubActionDoneChange: setSubActionDone,
              onToggleAction: (actionId) => setCollapsedActionIds((items) => toggleSetItem(items, actionId)),
              onToggleBounty: (bountyId) => setCollapsedBountyIds((items) => toggleSetItem(items, bountyId)),
              openActionId,
              selectedMetricId,
              canManageFlow: canShowFrontend(currentUser, "challenge.scope.all"),
            }}
            now={now}
            projects={challengeState.projects}
            scope={scope}
            visibleProjects={challengeTreeVisibleProjects}
              />
            </>
          )}
        </div>
        {selectedMetric && !metricInspectorCollapsed ? (
          <MetricInspectorPanel
            access={metricEditAccessForObjectiveId(selectedMetric.objectiveId)}
            objectiveTitle={selectedMetricObjective?.title ?? "目标不可用"}
            onCancelPendingSelection={() => setPendingSelectedMetricId(null)}
            onClose={closeMetricInspector}
            onComment={() => setCommentTarget(commentTargetForChallengeTarget(metricTargetForResult(selectedMetric)))}
            onDirtyChange={setMetricInspectorDirty}
            onDiscardPendingSelection={applyPendingMetricSelection}
            onSaveDetails={(details) => saveMetricDetails(metricTargetForResult(selectedMetric), details)}
            onSavePendingSelection={applyPendingMetricSelection}
            pendingSelectionTitle={pendingSelectedMetric?.title ?? null}
            result={selectedMetric}
          />
        ) : null}
      </div>

      {commentTarget && (
        <CommentPanel
          key={`${commentTarget.type}:${commentTarget.id}`}
          canManageAllComments={hasPermission(currentUser, state.permissionRules, "comment.manage")}
          currentMember={currentMember}
          currentUserAvatarUrl={currentUser?.avatarUrl}
          currentUserId={currentUser?.id ?? ""}
          focusedCommentId={linkedCommentId}
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
          onUploadAttachment={async (file) => {
            const upload = await uploadCommentAttachment({ file, targetId: commentTarget.id, targetType: commentTarget.type });
            return upload ? { markdown: upload.markdown, previewUrl: upload.attachment.contentUrl } : null;
          }}
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

function challengeTargetForLinkedChallengeTarget(target: ChallengeUrlTarget, state: OrfState): ChallengeTarget | null {
  if (target.type === "objective") {
    const objective = state.objectives.find((item) => item.id === target.id);
    return objective ? { id: objective.id, title: objective.title, type: "objective" } : null;
  }

  if (target.type === "bounty") {
    const result = state.results.find((item) => item.id === target.id);
    return result ? { id: result.id, objectiveId: result.objectiveId, title: result.title, type: "bounty" } : null;
  }

  if (target.type === "action") {
    const task = state.tasks.find((item) => item.id === target.id);
    return task ? { hasSubActions: task.checklist.length > 0, id: task.id, objectiveId: task.linkedObjectiveId, title: task.title, type: "action" } : null;
  }

  for (const task of state.tasks) {
    const item = task.checklist.find((checklistItem) => checklistItem.id === target.id);
    if (item) {
      return { actionId: task.id, id: item.id, objectiveId: task.linkedObjectiveId, title: item.label, type: "subAction" };
    }
  }

  return null;
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

function projectsForChallengeTree(
  projects: readonly OrfProject[],
  groups: readonly ObjectiveNode[],
  hasContentFilters: boolean,
  projectFilter: ChallengeProjectFilter,
) {
  if (projectFilter === "unassigned") return [];

  const visibleProjectIds = new Set(
    groups
      .map((group) => group.objective.projectId?.trim())
      .filter((projectId): projectId is string => Boolean(projectId)),
  );

  if (projectFilter !== "all") {
    return projects.filter((project) => project.id === projectFilter && (!hasContentFilters || visibleProjectIds.has(project.id)));
  }

  if (!hasContentFilters) return [...projects];
  return projects.filter((project) => visibleProjectIds.has(project.id));
}
