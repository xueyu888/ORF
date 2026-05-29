import { initialOrfState } from "../data/initialOrfState";
import {
  canApplyForObjectiveChallenge,
  isObjectiveStageCompatibleWithFlowStatus,
  objectiveLifecycleInitialState,
  objectiveLifecycleTransitions,
} from "../domain/orfLifecycle";
import { taskIdsForObjective } from "../domain/orfWorkItems";
import type { ChallengeApplication, CommentStatus, CommentTargetType, Feedback, FeedbackStatus, Objective, OrfState, Result, Task, TaskStatus, UncertaintyLevel } from "../types/orf";
import { addCalendarDays, localDateString } from "../utils/date";

type Placement = "before" | "after";
type MoveResultInput = { resultId: string; objectiveId: string; referenceResultId: string; placement: Placement };
type MoveTaskInput = { taskId: string; objectiveId: string; referenceTaskId?: string; placement?: Placement };
type MoveSubtaskInput = { itemId: string; fromTaskId: string; toTaskId: string; referenceItemId?: string; placement?: Placement };
type SubmitLootInput = {
  objectiveId: string;
  body: string;
  author?: string;
  resultClaims?: OrfState["objectiveLoot"][number]["resultClaims"];
  selfTestReportUrl?: string | null;
  selfTestReportBody?: string | null;
};
type LegacyResult = Result & {
  owner?: string;
  finalDueAt?: string;
  assignedChallenger?: string | null;
  acceptedAt?: string | null;
  confirmationDueAt?: string | null;
  confirmedAt?: string | null;
  priorityChallengeExpiresAt?: string | null;
  priorityDeclinedBy?: string[];
  challengeApplications?: ChallengeApplication[];
};

const cloneState = (state: OrfState): OrfState => JSON.parse(JSON.stringify(state)) as OrfState;
const cloneValue = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
let idCounter = 0;
const nextIdCounter = () => {
  idCounter = (idCounter + 1) % Number.MAX_SAFE_INTEGER;
  return idCounter.toString(36);
};
const randomIdSegment = () => {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  if (typeof globalThis.crypto?.getRandomValues === "function") {
    const bytes = new Uint32Array(4);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (value) => value.toString(16).padStart(8, "0")).join("");
  }

  return Math.random().toString(16).slice(2);
};
const makeId = (prefix: string) => `${prefix}-${Date.now()}-${nextIdCounter()}-${randomIdSegment()}`;
const currentTime = () => new Date().toISOString();
const currentDate = () => localDateString(new Date());
const currentUserName = (state: OrfState) => state.users.find((user) => user.id === state.currentUserId)?.name ?? state.users[0]?.name ?? "User";
const latestDate = (values: Array<string | undefined | null>) => values.filter(Boolean).sort().at(-1) ?? "";
const HALF_DAY_MS = 12 * 60 * 60 * 1000;
const MAX_CONFIRMATION_HALVES = 18;
const uncertaintyScores: Record<UncertaintyLevel, number> = {
  入门: 10,
  进阶: 30,
  破局: 90,
  渡劫: 270,
  飞升: 810,
};

const addDays = (value: string, days: number) => {
  return addCalendarDays(value, days);
};

const confirmationDueAt = (finalDueAt: string | undefined, acceptedAt: string) => {
  if (!finalDueAt) return null;

  const finalDueDate = new Date(`${finalDueAt}T23:59:00`);
  const acceptedDate = new Date(acceptedAt);
  if (Number.isNaN(finalDueDate.getTime()) || Number.isNaN(acceptedDate.getTime())) return null;

  const remainingMs = finalDueDate.getTime() - acceptedDate.getTime();
  if (remainingMs < HALF_DAY_MS) return null;

  const roundedHalfDays = Math.round((remainingMs * 0.3) / HALF_DAY_MS);
  const confirmationHalves = Math.min(MAX_CONFIRMATION_HALVES, Math.max(1, roundedHalfDays));
  return new Date(acceptedDate.getTime() + confirmationHalves * HALF_DAY_MS).toISOString();
};
const isRealMember = (owner: string | undefined | null) => {
  const value = owner?.trim() ?? "";
  return value !== "" && value !== "User" && value !== "未分配";
};
const uniqueMembers = (values: Array<string | undefined | null>) => Array.from(new Set(values.filter(isRealMember).map((value) => value!.trim())));
const uncertaintyScore = (level: UncertaintyLevel | undefined) => (level ? uncertaintyScores[level] : uncertaintyScores["进阶"]);
const taskStatusForChecklist = (checklist: Task["checklist"], fallback: TaskStatus): TaskStatus => {
  if (checklist.length === 0) {
    return fallback === "Done" ? "Todo" : fallback;
  }

  const completedCount = checklist.filter((item) => item.done).length;
  return completedCount === checklist.length ? "Done" : completedCount > 0 ? "In Progress" : "Todo";
};

const moveByReference = <T extends { id: string }>(items: T[], movingId: string, referenceId: string, placement: Placement): T[] => {
  const moving = items.find((item) => item.id === movingId);
  if (!moving || movingId === referenceId) {
    return items;
  }

  const withoutMoving = items.filter((item) => item.id !== movingId);
  const referenceIndex = withoutMoving.findIndex((item) => item.id === referenceId);
  if (referenceIndex < 0) {
    return items;
  }

  const insertIndex = placement === "before" ? referenceIndex : referenceIndex + 1;
  return [...withoutMoving.slice(0, insertIndex), moving, ...withoutMoving.slice(insertIndex)];
};
const insertTaskByReference = (tasks: Task[], movingTask: Task, referenceTaskId?: string, placement: Placement = "after"): Task[] => {
  const withoutMoving = tasks.filter((task) => task.id !== movingTask.id);
  const task = { ...movingTask };

  if (referenceTaskId) {
    const referenceIndex = withoutMoving.findIndex((item) => item.id === referenceTaskId);
    if (referenceIndex >= 0) {
      const insertIndex = placement === "before" ? referenceIndex : referenceIndex + 1;
      return [...withoutMoving.slice(0, insertIndex), task, ...withoutMoving.slice(insertIndex)];
    }
  }

  const lastTargetIndex = withoutMoving.reduce((lastIndex, item, index) => (item.linkedObjectiveId === task.linkedObjectiveId ? index : lastIndex), -1);
  const insertIndex = lastTargetIndex >= 0 ? lastTargetIndex + 1 : withoutMoving.length;
  return [...withoutMoving.slice(0, insertIndex), task, ...withoutMoving.slice(insertIndex)];
};
const removeCommentsForTargets = (
  comments: OrfState["comments"],
  targets: {
    objectiveIds?: Set<string>;
    resultIds?: Set<string>;
    taskIds?: Set<string>;
    subtaskIds?: Set<string>;
  },
) =>
  comments.filter((thread) => {
    if (thread.targetType === "objective") {
      return !targets.objectiveIds?.has(thread.targetId);
    }

    if (thread.targetType === "result") {
      return !targets.resultIds?.has(thread.targetId);
    }

    if (thread.targetType === "task") {
      return !targets.taskIds?.has(thread.targetId);
    }

    return !targets.subtaskIds?.has(thread.targetId);
  });

type CascadeTargets = {
  objectiveIds: Set<string>;
  resultIds: Set<string>;
  taskIds: Set<string>;
  subtaskIds: Set<string>;
  feedbackIds: Set<string>;
  evidenceIds: Set<string>;
};

const collectCascadeTargets = (
  state: OrfState,
  input: { objectiveIds?: Iterable<string>; resultIds?: Iterable<string>; taskIds?: Iterable<string>; feedbackIds?: Iterable<string> },
): CascadeTargets => {
  const objectiveIds = new Set(input.objectiveIds ?? []);
  const resultIds = new Set(input.resultIds ?? []);
  const taskIds = new Set(input.taskIds ?? []);
  const feedbackIds = new Set(input.feedbackIds ?? []);
  const evidenceIds = new Set<string>();

  for (const result of state.results) {
    if (objectiveIds.has(result.objectiveId)) {
      resultIds.add(result.id);
    }
  }

  for (const task of state.tasks) {
    if (objectiveIds.has(task.linkedObjectiveId)) {
      taskIds.add(task.id);
    }
  }

  for (const item of state.feedback) {
    if (objectiveIds.has(item.linkedObjectiveId) || resultIds.has(item.linkedResultId)) {
      feedbackIds.add(item.id);
    }
  }

  for (const item of state.evidence) {
    if (resultIds.has(item.linkedResultId) || (item.linkedFeedbackId && feedbackIds.has(item.linkedFeedbackId))) {
      evidenceIds.add(item.id);
    }
  }

  const subtaskIds = new Set(
    state.tasks
      .filter((task) => taskIds.has(task.id))
      .flatMap((task) => task.checklist.map((item) => item.id)),
  );

  return { objectiveIds, resultIds, taskIds, subtaskIds, feedbackIds, evidenceIds };
};

const pruneCascadeTargets = (state: OrfState, targets: CascadeTargets): OrfState => ({
  ...state,
  objectives: state.objectives
    .filter((objective) => !targets.objectiveIds.has(objective.id))
    .map((objective) => ({
      ...objective,
      resultIds: objective.resultIds.filter((id) => !targets.resultIds.has(id)),
      taskIds: objective.taskIds.filter((id) => !targets.taskIds.has(id)),
      feedbackIds: objective.feedbackIds.filter((id) => !targets.feedbackIds.has(id)),
    })),
  results: state.results
    .filter((result) => !targets.resultIds.has(result.id))
    .map((result) => ({
      ...result,
      feedbackIds: result.feedbackIds.filter((id) => !targets.feedbackIds.has(id)),
      evidenceIds: result.evidenceIds.filter((id) => !targets.evidenceIds.has(id)),
    })),
  tasks: state.tasks.filter((task) => !targets.taskIds.has(task.id)),
  feedback: state.feedback.filter((item) => !targets.feedbackIds.has(item.id)),
  evidence: state.evidence.filter((item) => !targets.evidenceIds.has(item.id)),
  decisions: state.decisions.filter(
    (item) =>
      !targets.objectiveIds.has(item.linkedObjectiveId) &&
      !(item.linkedResultId && targets.resultIds.has(item.linkedResultId)) &&
      !(item.linkedFeedbackId && targets.feedbackIds.has(item.linkedFeedbackId)),
  ),
  evalRuns: state.evalRuns.filter((item) => !targets.resultIds.has(item.linkedResultId)),
  scenarios: state.scenarios.filter((item) => !targets.objectiveIds.has(item.linkedObjectiveId)),
  failureSamples: state.failureSamples.filter((item) => !targets.resultIds.has(item.linkedResultId)),
  objectiveLoot: state.objectiveLoot.filter((item) => !targets.objectiveIds.has(item.objectiveId)),
  objectiveContributionReviews: state.objectiveContributionReviews.filter((item) => !targets.objectiveIds.has(item.objectiveId)),
  pointLedger: state.pointLedger.filter((item) => !targets.objectiveIds.has(item.objectiveId)),
  comments: removeCommentsForTargets(state.comments, {
    objectiveIds: targets.objectiveIds,
    resultIds: targets.resultIds,
    taskIds: targets.taskIds,
    subtaskIds: targets.subtaskIds,
  }),
});

const emptyBusinessState = (): OrfState => ({
  ...cloneState(initialOrfState),
  objectives: [],
  results: [],
  feedback: [],
  tasks: [],
  evidence: [],
  decisions: [],
  evalRuns: [],
  scenarios: [],
  failureSamples: [],
  comments: [],
  objectiveLoot: [],
  objectiveContributionReviews: [],
  pointLedger: [],
});

function inferFlowStatus(
  objective: Objective,
  challengers: string[],
  assignedChallengers: string[],
  challengeApplications: ChallengeApplication[],
): Objective["flowStatus"] {
  if (objective.flowStatus) return objective.flowStatus;
  if (objective.acceptedResult || objective.objectiveSettlementPoints != null) return "settled";
  if (objective.lootSubmittedAt) return "submitted";
  if (objective.confirmedAt || objective.stage === "goalFrozen") return "frozen";
  if (challengers.length) return "reestimating";
  if (assignedChallengers.length > 0) return "recruiting";
  if (challengeApplications.some((application) => application.status === "pending")) return "applying";
  if (objective.stage === "resultClaiming") return "open";
  return "candidate";
}

export const normalizeState = (state: OrfState): OrfState => {
  const tasks = state.tasks.map((task) => ({
    ...task,
    checklist: task.checklist.map((item) => ({ ...item, updatedAt: item.updatedAt ?? task.updatedAt })),
  }));
  const legacyResults = state.results as LegacyResult[];

  return {
    ...state,
    users: (state.users ?? cloneValue(initialOrfState.users)).map((user) => ({ ...user, status: user.status ?? "active" })),
    currentUserId: state.currentUserId ?? initialOrfState.currentUserId,
    comments: (state.comments ?? []).map((thread) => ({
      ...thread,
      messages: (thread.messages ?? []).map((message) => ({ ...message, attachments: message.attachments ?? [] })),
    })),
    objectives: state.objectives.map((objective) => normalizeObjective(objective, legacyResults, tasks)),
    results: legacyResults.map(normalizeResult),
    tasks,
    objectiveLoot: state.objectiveLoot ?? [],
    objectiveContributionReviews: state.objectiveContributionReviews ?? [],
    pointLedger: state.pointLedger ?? [],
  };
};

function normalizeObjective(objective: Objective, results: LegacyResult[], tasks: Task[]): Objective {
  const objectiveResults = results.filter((result) => result.objectiveId === objective.id);
  const typedResults = objectiveResults.map(normalizeResult);
  const acceptedResults = typedResults.filter((result) => result.acceptedResult === "completed" || result.acceptedResult === "falsified");
  const challengers = objective.challengers?.length ? uniqueMembers(objective.challengers) : uniqueMembers(objectiveResults.map((result) => result.owner));
  const rawAssignedChallengers = objective.assignedChallengers?.length
    ? objective.assignedChallengers
    : objectiveResults.map((result) => result.assignedChallenger);
  const assignedChallengers = uniqueMembers(rawAssignedChallengers).filter((member) => !challengers.includes(member));
  const challengeApplications = objective.challengeApplications ?? objectiveResults.flatMap((result) => result.challengeApplications ?? []);

  return {
    ...objective,
    stage: objective.stage ?? "orfReestimate",
    flowStatus: inferFlowStatus(objective, challengers, assignedChallengers, challengeApplications),
    finalDueAt:
      objective.finalDueAt ||
      latestDate(objectiveResults.map((result) => result.finalDueAt)) ||
      latestDate(tasks.filter((task) => task.linkedObjectiveId === objective.id).map((task) => task.dueDate)) ||
      addDays(objective.updatedAt, 14),
    challengers,
    assignedChallengers,
    challengeApplications,
    acceptedAt: objective.acceptedAt ?? objectiveResults.find((result) => result.acceptedAt)?.acceptedAt ?? null,
    confirmationDueAt: objective.confirmationDueAt ?? (latestDate(objectiveResults.map((result) => result.confirmationDueAt)) || null),
    confirmedAt: objective.confirmedAt ?? objectiveResults.find((result) => result.confirmedAt)?.confirmedAt ?? null,
    lootSubmittedAt: objective.lootSubmittedAt ?? null,
    acceptedResult: objective.acceptedResult ?? null,
    completionMultiplier: objective.completionMultiplier ?? null,
    objectiveBasePoints: objective.objectiveBasePoints ?? acceptedResults.reduce((sum, result) => sum + result.uncertaintyScore, 0),
    objectiveSettlementPoints: objective.objectiveSettlementPoints ?? null,
  };
}

function normalizeResult(result: LegacyResult): Result {
  const {
    owner: _owner,
    finalDueAt: _finalDueAt,
    assignedChallenger: _assignedChallenger,
    acceptedAt: _acceptedAt,
    confirmationDueAt: _confirmationDueAt,
    confirmedAt: _confirmedAt,
    priorityChallengeExpiresAt: _priorityChallengeExpiresAt,
    priorityDeclinedBy: _priorityDeclinedBy,
    challengeApplications: _challengeApplications,
    ...rest
  } = result;

  return {
    ...(rest as Result),
    source: result.source ?? "managerDefined",
    definer: result.definer ?? "",
    uncertaintyScore: typeof result.uncertaintyScore === "number" ? result.uncertaintyScore : uncertaintyScore(result.uncertaintyLevel),
    acceptedResult: result.acceptedResult ?? "unreviewed",
  };
}

export class OrfFlowStore {
  load(): OrfState {
    return normalizeState(emptyBusinessState());
  }

  reset(): OrfState {
    return normalizeState(emptyBusinessState());
  }

  createObjective(state: OrfState, input: Pick<Objective, "title" | "whyItMatters" | "cycle" | "boundary"> & Partial<Pick<Objective, "finalDueAt">>): OrfState {
    const id = makeId("obj");
    const now = currentDate();
    const objective = {
      id,
      title: input.title,
      description: input.whyItMatters,
      whyItMatters: input.whyItMatters,
      cycle: input.cycle,
      stage: objectiveLifecycleInitialState.stage,
      flowStatus: objectiveLifecycleInitialState.flowStatus,
      status: "Draft" as const,
      confidence: 50,
      progress: 0,
      boundary: input.boundary,
      successDefinition: "Success definition will be refined during result planning.",
      resultIds: [],
      feedbackIds: [],
      taskIds: [],
      finalDueAt: input.finalDueAt ?? addDays(now, 14),
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
      createdAt: now,
      updatedAt: now,
    };

    return { ...state, objectives: [objective, ...state.objectives] };
  }

  createResult(state: OrfState, input: Partial<Result> & Pick<Result, "objectiveId" | "title" | "metricName">): OrfState {
    const id = makeId("res");
    const result: Result = {
      id,
      objectiveId: input.objectiveId,
      title: input.title,
      description: input.description ?? "由 ORF Flow 规划创建的指标。",
      metricName: input.metricName,
      metricRequirement: input.metricRequirement ?? `${input.metricName}：写清统计对象和完成标准后进入执行。`,
      statisticalObject: input.statisticalObject ?? "指挥官确认的标准样本集和线上反馈样本",
      completionStandard: input.completionStandard ?? "完成标准清楚，并有战利品说明支撑",
      sampleSet: input.sampleSet ?? "指挥官确认的标准样本集",
      measurementScope: input.measurementScope ?? "固定测试环境下统计系统侧链路表现",
      uncertaintyLevel: input.uncertaintyLevel ?? "进阶",
      baseline: input.baseline ?? 0,
      current: input.current ?? 0,
      target: input.target ?? 100,
      unit: input.unit ?? "%",
      direction: input.direction ?? "increase",
      status: input.status ?? "Draft",
      confidence: input.confidence ?? 50,
      source: input.source ?? "managerDefined",
      definer: input.definer ?? currentUserName(state),
      uncertaintyScore: input.uncertaintyScore ?? uncertaintyScore(input.uncertaintyLevel),
      acceptedResult: input.acceptedResult ?? "unreviewed",
      evidenceIds: [],
      feedbackIds: [],
      trend: [{ date: "Now", value: input.current ?? 0 }],
      reviewCadence: input.reviewCadence ?? "Weekly",
    };

    return {
      ...state,
      results: [result, ...state.results],
      objectives: state.objectives.map((objective) =>
        objective.id === input.objectiveId
          ? { ...objective, resultIds: [result.id, ...objective.resultIds], updatedAt: currentDate() }
          : objective,
      ),
    };
  }

  createFeedback(state: OrfState, input: Pick<Feedback, "phenomenon" | "causeCategories" | "impact" | "linkedObjectiveId" | "linkedResultId" | "suggestedAdjustment" | "source" | "owner">): OrfState {
    const result = state.results.find((item) => item.id === input.linkedResultId);
    if (!result) {
      return state;
    }

    const id = makeId("fb");
    const now = currentDate();
    const owner = input.owner || currentUserName(state);
    const feedback: Feedback = {
      id,
      phenomenon: input.phenomenon,
      evidenceIds: [],
      causeCategories: input.causeCategories,
      impact: input.impact,
      linkedObjectiveId: result.objectiveId,
      linkedResultId: input.linkedResultId,
      suggestedAdjustment: input.suggestedAdjustment,
      source: input.source,
      status: "New",
      owner,
      createdAt: now,
      updatedAt: now,
      activity: [{ id: makeId("act"), actor: owner, action: "创建了结构化反馈", at: now }],
    };

    return {
      ...state,
      feedback: [feedback, ...state.feedback],
      objectives: state.objectives.map((objective) =>
        objective.id === feedback.linkedObjectiveId ? { ...objective, feedbackIds: [feedback.id, ...objective.feedbackIds] } : objective,
      ),
      results: state.results.map((result) =>
        result.id === feedback.linkedResultId ? { ...result, feedbackIds: [feedback.id, ...result.feedbackIds] } : result,
      ),
    };
  }

  createTask(state: OrfState, input: Pick<Task, "title" | "description" | "assignee" | "priority" | "linkedObjectiveId"> & Partial<Task>): OrfState {
    const objective = state.objectives.find((item) => item.id === input.linkedObjectiveId);
    if (!objective) {
      return state;
    }
    const nextNumber = 128 + state.tasks.length + 1;
    const now = currentDate();
    const task: Task = {
      id: input.id ?? `ORF-${nextNumber}`,
      title: input.title,
      description: input.description,
      status: input.status ?? "Todo",
      priority: input.priority,
      assignee: input.assignee || currentUserName(state),
      linkedObjectiveId: objective.id,
      feedbackOriginId: input.feedbackOriginId,
      dueDate: input.dueDate ?? now,
      tags: input.tags ?? ["ORF"],
      checklist: (input.checklist ?? []).map((item) => ({ ...item, updatedAt: item.updatedAt ?? now })),
      createdBy: input.createdBy,
      updatedBy: input.updatedBy,
      createdAt: now,
      updatedAt: now,
    };

    return {
      ...state,
      tasks: [task, ...state.tasks],
      objectives: state.objectives.map((objective) =>
        objective.id === task.linkedObjectiveId ? { ...objective, taskIds: [task.id, ...objective.taskIds] } : objective,
      ),
    };
  }

  updateTaskStatus(state: OrfState, taskId: string, status: TaskStatus): OrfState {
    return {
      ...state,
      tasks: state.tasks.map((task) =>
        task.id === taskId ? { ...task, status, updatedAt: currentDate() } : task,
      ),
    };
  }

  setTaskCompletion(state: OrfState, taskId: string, done: boolean): OrfState {
    const now = currentDate();

    return {
      ...state,
      tasks: state.tasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              status: done ? "Done" : "Todo",
              checklist: task.checklist.map((item) => ({ ...item, done, updatedAt: now })),
              updatedAt: now,
            }
          : task,
      ),
    };
  }

  updateTaskChecklistItem(state: OrfState, taskId: string, itemId: string, done: boolean): OrfState {
    const now = currentDate();

    return {
      ...state,
      tasks: state.tasks.map((task) => {
        if (task.id !== taskId) {
          return task;
        }

        if (!task.checklist.some((item) => item.id === itemId)) {
          return task;
        }

        const checklist = task.checklist.map((item) => (item.id === itemId ? { ...item, done, updatedAt: now } : item));

        return {
          ...task,
          status: taskStatusForChecklist(checklist, task.status),
          checklist,
          updatedAt: now,
        };
      }),
    };
  }

  createTaskChecklistItem(state: OrfState, taskId: string, afterItemId?: string): OrfState {
    const now = currentDate();

    return {
      ...state,
      tasks: state.tasks.map((task) => {
        if (task.id !== taskId) {
          return task;
        }

        const item = {
          id: makeId("ck"),
          label: "新子行动项",
          done: false,
          updatedAt: now,
        };
        const afterIndex = afterItemId ? task.checklist.findIndex((current) => current.id === afterItemId) : -1;
        const insertIndex = afterIndex >= 0 ? afterIndex + 1 : task.checklist.length;
        const checklist = [...task.checklist];
        checklist.splice(Math.max(0, insertIndex), 0, item);

        return {
          ...task,
          status: task.status === "Done" ? "In Progress" : task.status,
          checklist,
          updatedAt: now,
        };
      }),
    };
  }

  updateObjectiveTitle(state: OrfState, objectiveId: string, title: string): OrfState {
    const nextTitle = title.trim();
    if (!nextTitle) {
      return state;
    }

    const now = currentDate();
    return {
      ...state,
      objectives: state.objectives.map((objective) => (objective.id === objectiveId ? { ...objective, title: nextTitle, updatedAt: now } : objective)),
      comments: state.comments.map((thread) =>
        thread.targetType === "objective" && thread.targetId === objectiveId ? { ...thread, targetTitle: nextTitle, updatedAt: currentTime() } : thread,
      ),
    };
  }

  updateObjectiveStage(state: OrfState, objectiveId: string, stage: OrfState["objectives"][number]["stage"]): OrfState {
    const objective = state.objectives.find((item) => item.id === objectiveId);
    if (!objective || !isObjectiveStageCompatibleWithFlowStatus(objective.flowStatus, stage)) {
      return state;
    }

    const now = currentDate();
    return {
      ...state,
      objectives: state.objectives.map((objective) => (objective.id === objectiveId ? { ...objective, stage, updatedAt: now } : objective)),
    };
  }

  updateResultTitle(state: OrfState, resultId: string, title: string): OrfState {
    const nextTitle = title.trim();
    if (!nextTitle) {
      return state;
    }

    return {
      ...state,
      results: state.results.map((result) => (result.id === resultId ? { ...result, title: nextTitle } : result)),
      comments: state.comments.map((thread) =>
        thread.targetType === "result" && thread.targetId === resultId ? { ...thread, targetTitle: nextTitle, updatedAt: currentTime() } : thread,
      ),
    };
  }

  applyForBounty(state: OrfState, objectiveId: string, applicant: string): OrfState {
    const nextApplicant = applicant.trim();
    if (!nextApplicant) {
      return state;
    }

    const objective = state.objectives.find((item) => item.id === objectiveId);
    if (!objective || !canApplyForObjectiveChallenge(objective) || objective.challengers.includes(nextApplicant)) {
      return state;
    }

    const applications = objective.challengeApplications ?? [];
    if (applications.some((item) => item.applicant === nextApplicant && item.status === "pending")) {
      return state;
    }

    const application: ChallengeApplication = {
      id: makeId("challenge-application"),
      applicant: nextApplicant,
      status: "pending",
      createdAt: currentTime(),
      decidedAt: null,
    };

    return {
      ...state,
      objectives: state.objectives.map((item) =>
        item.id === objectiveId
          ? {
              ...item,
              challengeApplications: [application, ...(item.challengeApplications ?? [])],
              updatedAt: currentDate(),
            }
          : item,
      ),
    };
  }

  acceptBountyChallenge(state: OrfState, objectiveId: string, challenger: string): OrfState {
    const nextChallenger = challenger.trim();
    if (!nextChallenger) {
      return state;
    }

    const objective = state.objectives.find((item) => item.id === objectiveId);
    if (!objective || objective.challengers.includes(nextChallenger)) {
      return state;
    }

    const now = currentTime();
    const nextConfirmationDueAt = confirmationDueAt(objective.finalDueAt, now);
    if (!nextConfirmationDueAt) {
      return state;
    }

    return {
      ...state,
      objectives: state.objectives.map((item) =>
        item.id === objectiveId
          ? {
              ...item,
              challengers: [...item.challengers, nextChallenger],
              assignedChallengers: item.assignedChallengers.filter((member) => member !== nextChallenger),
              flowStatus: objectiveLifecycleTransitions.acceptChallenge.to,
              stage: objectiveLifecycleTransitions.acceptChallenge.stage,
              acceptedAt: item.acceptedAt ?? now,
              confirmationDueAt: item.confirmationDueAt ?? nextConfirmationDueAt,
              challengeApplications: (item.challengeApplications ?? []).map((application) =>
                application.applicant === nextChallenger && application.status === "pending"
                  ? { ...application, status: "approved", decidedAt: now }
                  : application,
              ),
              status: item.status === "Draft" ? "On Track" : item.status,
              updatedAt: currentDate(),
            }
          : item,
      ),
    };
  }

  updateTaskTitle(state: OrfState, taskId: string, title: string): OrfState {
    const nextTitle = title.trim();
    if (!nextTitle) {
      return state;
    }

    const now = currentDate();
    return {
      ...state,
      tasks: state.tasks.map((task) => (task.id === taskId ? { ...task, title: nextTitle, updatedAt: now } : task)),
      comments: state.comments.map((thread) =>
        thread.targetType === "task" && thread.targetId === taskId ? { ...thread, targetTitle: nextTitle, updatedAt: currentTime() } : thread,
      ),
    };
  }

  updateTaskChecklistItemLabel(state: OrfState, taskId: string, itemId: string, label: string): OrfState {
    const nextLabel = label.trim();
    if (!nextLabel) {
      return state;
    }

    const now = currentDate();
    return {
      ...state,
      tasks: state.tasks.map((task) => {
        if (task.id !== taskId || !task.checklist.some((item) => item.id === itemId)) {
          return task;
        }

        return {
          ...task,
          checklist: task.checklist.map((item) => (item.id === itemId ? { ...item, label: nextLabel, updatedAt: now } : item)),
          updatedAt: now,
        };
      }),
      comments: state.comments.map((thread) =>
        thread.targetType === "subtask" && thread.targetId === itemId ? { ...thread, targetTitle: nextLabel, updatedAt: currentTime() } : thread,
      ),
    };
  }

  moveResult(state: OrfState, input: MoveResultInput): OrfState {
    const result = state.results.find((item) => item.id === input.resultId);
    const reference = state.results.find((item) => item.id === input.referenceResultId);
    if (!result || !reference || result.objectiveId !== input.objectiveId || reference.objectiveId !== input.objectiveId) {
      return state;
    }

    return {
      ...state,
      results: moveByReference(state.results, input.resultId, input.referenceResultId, input.placement),
      objectives: state.objectives.map((objective) =>
        objective.id === input.objectiveId
          ? {
              ...objective,
              resultIds: moveByReference(
                objective.resultIds.map((id) => ({ id })),
                input.resultId,
                input.referenceResultId,
                input.placement,
              ).map((item) => item.id),
              updatedAt: currentDate(),
            }
          : objective,
      ),
    };
  }

  moveTask(state: OrfState, input: MoveTaskInput): OrfState {
    const task = state.tasks.find((item) => item.id === input.taskId);
    const objective = state.objectives.find((item) => item.id === input.objectiveId);
    if (!task || !objective || task.linkedObjectiveId !== objective.id) {
      return state;
    }

    if (input.referenceTaskId === input.taskId) {
      return state;
    }

    if (input.referenceTaskId) {
      const referenceTask = state.tasks.find((item) => item.id === input.referenceTaskId);
      if (!referenceTask || referenceTask.linkedObjectiveId !== objective.id || referenceTask.id === task.id) {
        return state;
      }
    }

    const now = currentDate();
    const movedTask: Task = {
      ...task,
      updatedAt: now,
    };
    const nextTasks = insertTaskByReference(state.tasks, movedTask, input.referenceTaskId, input.placement);

    return {
      ...state,
      tasks: nextTasks,
      objectives: state.objectives.map((item) =>
        item.id === objective.id ? { ...item, taskIds: taskIdsForObjective(nextTasks, objective.id), updatedAt: now } : item,
      ),
    };
  }

  moveTaskChecklistItem(state: OrfState, input: MoveSubtaskInput): OrfState {
    const fromTask = state.tasks.find((task) => task.id === input.fromTaskId);
    const toTask = state.tasks.find((task) => task.id === input.toTaskId);
    const item = fromTask?.checklist.find((current) => current.id === input.itemId);
    if (!fromTask || !toTask || !item) {
      return state;
    }

    if (input.referenceItemId === input.itemId && input.fromTaskId === input.toTaskId) {
      return state;
    }

    if (input.referenceItemId && !toTask.checklist.some((current) => current.id === input.referenceItemId && current.id !== input.itemId)) {
      return state;
    }

    const now = currentDate();
    const movedItem = { ...item, updatedAt: now };

    return {
      ...state,
      tasks: state.tasks.map((task) => {
        if (task.id !== input.fromTaskId && task.id !== input.toTaskId) {
          return task;
        }

        const checklistWithoutItem = task.checklist.filter((current) => current.id !== input.itemId);
        const isTargetTask = task.id === input.toTaskId;
        const checklist = isTargetTask
          ? (() => {
              if (!input.referenceItemId) {
                return [...checklistWithoutItem, movedItem];
              }

              const referenceIndex = checklistWithoutItem.findIndex((current) => current.id === input.referenceItemId);
              if (referenceIndex < 0) {
                return [...checklistWithoutItem, movedItem];
              }

              const insertIndex = input.placement === "before" ? referenceIndex : referenceIndex + 1;
              return [...checklistWithoutItem.slice(0, insertIndex), movedItem, ...checklistWithoutItem.slice(insertIndex)];
            })()
          : checklistWithoutItem;

        return {
          ...task,
          checklist,
          status: taskStatusForChecklist(checklist, task.status),
          updatedAt: now,
        };
      }),
    };
  }

  deleteObjective(state: OrfState, objectiveId: string): OrfState {
    return pruneCascadeTargets(state, collectCascadeTargets(state, { objectiveIds: [objectiveId] }));
  }

  deleteResult(state: OrfState, resultId: string): OrfState {
    return pruneCascadeTargets(state, collectCascadeTargets(state, { resultIds: [resultId] }));
  }

  deleteTask(state: OrfState, taskId: string): OrfState {
    const task = state.tasks.find((item) => item.id === taskId);
    const deletedSubtaskIds = new Set(task?.checklist.map((item) => item.id) ?? []);

    return {
      ...state,
      objectives: state.objectives.map((objective) => ({ ...objective, taskIds: objective.taskIds.filter((id) => id !== taskId) })),
      tasks: state.tasks.filter((item) => item.id !== taskId),
      comments: removeCommentsForTargets(state.comments, {
        taskIds: new Set([taskId]),
        subtaskIds: deletedSubtaskIds,
      }),
    };
  }

  deleteTaskChecklistItem(state: OrfState, taskId: string, itemId: string): OrfState {
    const now = currentDate();
    const targetTask = state.tasks.find((task) => task.id === taskId);
    if (!targetTask?.checklist.some((item) => item.id === itemId)) {
      return state;
    }

    return {
      ...state,
      tasks: state.tasks.map((task) => {
        if (task.id !== taskId) {
          return task;
        }

        const checklist = task.checklist.filter((item) => item.id !== itemId);
        return {
          ...task,
          checklist,
          status: taskStatusForChecklist(checklist, task.status),
          updatedAt: now,
        };
      }),
      comments: removeCommentsForTargets(state.comments, { subtaskIds: new Set([itemId]) }),
    };
  }

  updateFeedbackStatus(state: OrfState, feedbackId: string, status: FeedbackStatus): OrfState {
    const now = currentDate();
    return {
      ...state,
      feedback: state.feedback.map((item) =>
        item.id === feedbackId
          ? {
              ...item,
              status,
              updatedAt: now,
              activity: [...item.activity, { id: makeId("act"), actor: currentUserName(state), action: `更新反馈状态`, at: now }],
            }
          : item,
      ),
    };
  }

  updateResultConfidence(state: OrfState, resultId: string, confidence: number): OrfState {
    return {
      ...state,
      results: state.results.map((result) => (result.id === resultId ? { ...result, confidence } : result)),
    };
  }

  addComment(
    state: OrfState,
    input: {
      targetType: CommentTargetType;
      targetId: string;
      targetTitle: string;
      body: string;
      author?: string;
      parentMessageId?: string;
      replyToMessageId?: string;
      replyToAuthor?: string;
    },
  ): OrfState {
    const body = input.body.trim();
    if (!body) {
      return state;
    }

    const now = currentTime();
    const author = input.author ?? currentUserName(state);
    const message = {
      id: makeId("cmsg"),
      author,
      body,
      attachments: [],
      createdAt: now,
      parentMessageId: input.parentMessageId,
      replyToMessageId: input.replyToMessageId,
      replyToAuthor: input.replyToAuthor,
    };
    const existingThread = state.comments.find(
      (thread) => thread.targetType === input.targetType && thread.targetId === input.targetId && thread.status === "open",
    );

    if (existingThread) {
      return {
        ...state,
        comments: state.comments.map((thread) =>
          thread.id === existingThread.id
            ? {
                ...thread,
                targetTitle: input.targetTitle,
                updatedAt: now,
                messages: [...thread.messages, message],
              }
            : thread,
        ),
      };
    }

    return {
      ...state,
      comments: [
        {
          id: makeId("cthread"),
          targetType: input.targetType,
          targetId: input.targetId,
          targetTitle: input.targetTitle,
          status: "open",
          createdBy: author,
          createdAt: now,
          updatedAt: now,
          messages: [message],
        },
        ...state.comments,
      ],
    };
  }

  submitLoot(state: OrfState, input: SubmitLootInput): OrfState {
    const objective = state.objectives.find((item) => item.id === input.objectiveId);
    const body = input.body.trim();
    if (!objective || !body) {
      return state;
    }

    const now = currentDate();
    const next = this.addComment(state, {
      targetType: "objective",
      targetId: objective.id,
      targetTitle: objective.title,
      body: `战利品提交：${body}`,
      author: input.author,
    });

    return {
      ...next,
      objectives: next.objectives.map((item) =>
        item.id === objective.id
          ? {
              ...item,
              lootSubmittedAt: currentTime(),
              updatedAt: now,
            }
          : item,
      ),
    };
  }

  updateCommentThreadStatus(state: OrfState, threadId: string, status: CommentStatus): OrfState {
    const now = currentTime();

    return {
      ...state,
      comments: state.comments.map((thread) => (thread.id === threadId ? { ...thread, status, updatedAt: now } : thread)),
    };
  }

  updateCommentMessage(state: OrfState, threadId: string, messageId: string, body: string): OrfState {
    const value = body.trim();
    if (!value) {
      return state;
    }

    const now = currentTime();
    return {
      ...state,
      comments: state.comments.map((thread) =>
        thread.id === threadId
          ? {
              ...thread,
              updatedAt: now,
              messages: thread.messages.map((message) => (message.id === messageId ? { ...message, body: value } : message)),
            }
          : thread,
      ),
    };
  }

  deleteCommentMessage(state: OrfState, threadId: string, messageId: string): OrfState {
    const now = currentTime();

    return {
      ...state,
      comments: state.comments.flatMap((thread) => {
        if (thread.id !== threadId) {
          return [thread];
        }

        const messages = thread.messages
          .filter((message) => message.id !== messageId && message.parentMessageId !== messageId)
          .map((message) =>
            message.replyToMessageId === messageId
              ? { ...message, replyToMessageId: undefined, replyToAuthor: undefined }
              : message,
          );
        if (messages.length === 0) {
          return [];
        }

        return [{ ...thread, updatedAt: now, messages }];
      }),
    };
  }

  proposeResultUpdate(state: OrfState, resultId: string, title: string, reason: string, feedbackId?: string): OrfState {
    const result = state.results.find((item) => item.id === resultId);
    if (!result) {
      return state;
    }

    const now = currentDate();
    return {
      ...state,
      results: state.results.map((item) => (item.id === resultId ? { ...item, title, updatedAt: now } : item)),
      decisions: [
        {
          id: makeId("dec"),
          title: `更新指标：${title}`,
          reason,
          evidence: feedbackId ? `关联反馈 ${feedbackId}` : "手动 ORF 复盘",
          owner: currentUserName(state),
          date: now,
          linkedObjectiveId: result.objectiveId,
          linkedResultId: resultId,
          linkedFeedbackId: feedbackId,
        },
        ...state.decisions,
      ],
      feedback: feedbackId
        ? state.feedback.map((item) => (item.id === feedbackId ? { ...item, status: "Result Updated", updatedAt: now } : item))
        : state.feedback,
    };
  }
}
