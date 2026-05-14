import { initialOrfState } from "../data/initialOrfState";
import type { ChallengeApplication, CommentStatus, CommentTargetType, Feedback, FeedbackStatus, OrfState, Result, Task, TaskStatus } from "../types/orf";

type Placement = "before" | "after";
type MoveResultInput = { resultId: string; objectiveId: string; referenceResultId: string; placement: Placement };
type MoveTaskInput = { taskId: string; toResultId: string; referenceTaskId?: string; placement?: Placement };
type MoveSubtaskInput = { itemId: string; fromTaskId: string; toTaskId: string; referenceItemId?: string; placement?: Placement };
type SubmitLootInput = { bountyId: string; body: string; author?: string };

const cloneState = (state: OrfState): OrfState => JSON.parse(JSON.stringify(state)) as OrfState;
const cloneValue = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const makeId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const currentTime = () => new Date().toISOString();
const currentDate = () => currentTime().slice(0, 10);
const currentUserName = (state: OrfState) => state.users.find((user) => user.id === state.currentUserId)?.name ?? state.users[0]?.name ?? "User";
const latestDate = (values: Array<string | undefined | null>) => values.filter(Boolean).sort().at(-1) ?? "";
const HALF_DAY_MS = 12 * 60 * 60 * 1000;
const MAX_CONFIRMATION_HALVES = 18;

const addDays = (value: string, days: number) => {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
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
const hasAcceptedChallenger = (owner: string) => {
  const value = owner.trim();
  return value !== "" && value !== "User" && value !== "未分配";
};
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

  const lastTargetIndex = withoutMoving.reduce((lastIndex, item, index) => (item.linkedResultId === task.linkedResultId ? index : lastIndex), -1);
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
    if (objectiveIds.has(task.linkedObjectiveId) || resultIds.has(task.linkedResultId)) {
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
      taskIds: result.taskIds.filter((id) => !targets.taskIds.has(id)),
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
  comments: removeCommentsForTargets(state.comments, {
    objectiveIds: targets.objectiveIds,
    resultIds: targets.resultIds,
    taskIds: targets.taskIds,
    subtaskIds: targets.subtaskIds,
  }),
});

const emptyBusinessState = (): OrfState => ({
  ...cloneState(initialOrfState),
  automaticCompletions: {},
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
});

export const normalizeState = (state: OrfState): OrfState => {
  const tasks = state.tasks.map((task) => ({
    ...task,
    checklist: task.checklist.map((item) => ({ ...item, updatedAt: item.updatedAt ?? task.updatedAt })),
  }));
  const dueDatesByResult = new Map<string, string[]>();

  for (const task of tasks) {
    const dates = dueDatesByResult.get(task.linkedResultId) ?? [];
    dates.push(task.dueDate);
    dueDatesByResult.set(task.linkedResultId, dates);
  }

  return {
    ...state,
    users: state.users ?? cloneValue(initialOrfState.users),
    currentUserId: state.currentUserId ?? initialOrfState.currentUserId,
    automaticCompletions: state.automaticCompletions ?? {},
    comments: (state.comments ?? []).map((thread) => ({
      ...thread,
      messages: thread.messages ?? [],
    })),
    objectives: state.objectives.map((objective) => ({
      ...objective,
      stage: objective.stage ?? "orfReestimate",
    })),
    results: state.results.map((result) => ({
      ...result,
      source: result.source ?? "managerDefined",
      definer: result.definer ?? "",
      finalDueAt: result.finalDueAt ?? latestDate(dueDatesByResult.get(result.id) ?? []),
      assignedChallenger: result.assignedChallenger ?? null,
      acceptedAt: result.acceptedAt ?? null,
      confirmationDueAt: result.confirmationDueAt ?? null,
      confirmedAt: result.confirmedAt ?? null,
      priorityChallengeExpiresAt: result.priorityChallengeExpiresAt ?? null,
      priorityDeclinedBy: result.priorityDeclinedBy ?? [],
      challengeApplications: result.challengeApplications ?? [],
    })),
    tasks,
  };
};

export class OrfFlowStore {
  load(): OrfState {
    return normalizeState(emptyBusinessState());
  }

  reset(): OrfState {
    return normalizeState(emptyBusinessState());
  }

  createObjective(state: OrfState, input: Pick<OrfState["objectives"][number], "title" | "whyItMatters" | "cycle" | "boundary">): OrfState {
    const id = `obj-${Date.now()}`;
    const now = new Date().toISOString().slice(0, 10);
    const objective = {
      id,
      title: input.title,
      description: input.whyItMatters,
      whyItMatters: input.whyItMatters,
      cycle: input.cycle,
      stage: "orfReestimate" as const,
      status: "Draft" as const,
      confidence: 50,
      progress: 0,
      boundary: input.boundary,
      successDefinition: "Success definition will be refined during result planning.",
      resultIds: [],
      feedbackIds: [],
      taskIds: [],
      createdAt: now,
      updatedAt: now,
    };

    return { ...state, objectives: [objective, ...state.objectives] };
  }

  createResult(state: OrfState, input: Partial<Result> & Pick<Result, "objectiveId" | "title" | "metricName">): OrfState {
    const id = `res-${Date.now()}`;
    const result: Result = {
      id,
      objectiveId: input.objectiveId,
      title: input.title,
      description: input.description ?? "由 ORF Flow 规划创建的悬赏。",
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
      owner: input.owner ?? "",
      source: input.source ?? "managerDefined",
      definer: input.definer ?? currentUserName(state),
      finalDueAt: input.finalDueAt ?? addDays(currentDate(), 14),
      assignedChallenger: input.assignedChallenger ?? null,
      acceptedAt: input.acceptedAt ?? null,
      confirmationDueAt: input.confirmationDueAt ?? null,
      confirmedAt: input.confirmedAt ?? null,
      priorityChallengeExpiresAt: input.priorityChallengeExpiresAt ?? null,
      priorityDeclinedBy: input.priorityDeclinedBy ?? [],
      challengeApplications: input.challengeApplications ?? [],
      evidenceIds: [],
      taskIds: [],
      feedbackIds: [],
      trend: [{ date: "Now", value: input.current ?? 0 }],
      reviewCadence: input.reviewCadence ?? "Weekly",
    };

    return {
      ...state,
      results: [result, ...state.results],
      objectives: state.objectives.map((objective) =>
        objective.id === input.objectiveId
          ? { ...objective, resultIds: [result.id, ...objective.resultIds], updatedAt: new Date().toISOString().slice(0, 10) }
          : objective,
      ),
    };
  }

  createFeedback(state: OrfState, input: Pick<Feedback, "phenomenon" | "causeCategories" | "impact" | "linkedObjectiveId" | "linkedResultId" | "suggestedAdjustment" | "source" | "owner">): OrfState {
    const result = state.results.find((item) => item.id === input.linkedResultId);
    if (!result) {
      return state;
    }

    const id = `fb-${Date.now()}`;
    const now = new Date().toISOString().slice(0, 10);
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
      activity: [{ id: `act-${Date.now()}`, actor: owner, action: "创建了结构化反馈", at: now }],
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

  createTask(state: OrfState, input: Pick<Task, "title" | "description" | "assignee" | "priority" | "linkedObjectiveId" | "linkedResultId"> & Partial<Task>): OrfState {
    const result = state.results.find((item) => item.id === input.linkedResultId);
    if (!result) {
      return state;
    }

    const nextNumber = 128 + state.tasks.length + 1;
    const now = new Date().toISOString().slice(0, 10);
    const task: Task = {
      id: input.id ?? `ORF-${nextNumber}`,
      title: input.title,
      description: input.description,
      status: input.status ?? "Todo",
      priority: input.priority,
      assignee: input.assignee || currentUserName(state),
      linkedObjectiveId: result.objectiveId,
      linkedResultId: input.linkedResultId,
      feedbackOriginId: input.feedbackOriginId,
      dueDate: input.dueDate ?? now,
      tags: input.tags ?? ["ORF"],
      checklist: (input.checklist ?? []).map((item) => ({ ...item, updatedAt: item.updatedAt ?? now })),
      createdAt: now,
      updatedAt: now,
    };

    return {
      ...state,
      tasks: [task, ...state.tasks],
      objectives: state.objectives.map((objective) =>
        objective.id === task.linkedObjectiveId ? { ...objective, taskIds: [task.id, ...objective.taskIds] } : objective,
      ),
      results: state.results.map((result) =>
        result.id === task.linkedResultId ? { ...result, taskIds: [task.id, ...result.taskIds] } : result,
      ),
    };
  }

  updateTaskStatus(state: OrfState, taskId: string, status: TaskStatus): OrfState {
    return {
      ...state,
      tasks: state.tasks.map((task) =>
        task.id === taskId ? { ...task, status, updatedAt: new Date().toISOString().slice(0, 10) } : task,
      ),
    };
  }

  setTaskCompletion(state: OrfState, taskId: string, done: boolean): OrfState {
    const now = new Date().toISOString().slice(0, 10);

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
    const now = new Date().toISOString().slice(0, 10);

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
          id: `ck-${Date.now()}`,
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

  applyForBounty(state: OrfState, resultId: string, applicant: string): OrfState {
    const nextApplicant = applicant.trim();
    if (!nextApplicant) {
      return state;
    }

    const result = state.results.find((item) => item.id === resultId);
    if (!result || hasAcceptedChallenger(result.owner)) {
      return state;
    }

    const applications = result.challengeApplications ?? [];
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
      results: state.results.map((item) =>
        item.id === resultId
          ? {
              ...item,
              challengeApplications: [application, ...(item.challengeApplications ?? [])],
            }
          : item,
      ),
    };
  }

  acceptBountyChallenge(state: OrfState, resultId: string, challenger: string): OrfState {
    const nextChallenger = challenger.trim();
    if (!nextChallenger) {
      return state;
    }

    const result = state.results.find((item) => item.id === resultId);
    if (!result || (hasAcceptedChallenger(result.owner) && result.owner !== nextChallenger)) {
      return state;
    }

    const now = currentTime();
    const nextConfirmationDueAt = confirmationDueAt(result.finalDueAt, now);
    if (!nextConfirmationDueAt) {
      return state;
    }

    return {
      ...state,
      results: state.results.map((item) =>
        item.id === resultId
          ? {
              ...item,
              owner: nextChallenger,
              assignedChallenger: item.assignedChallenger === nextChallenger ? null : item.assignedChallenger,
              acceptedAt: item.acceptedAt ?? now,
              confirmationDueAt: item.confirmationDueAt ?? nextConfirmationDueAt,
              challengeApplications: (item.challengeApplications ?? []).map((application) =>
                application.applicant === nextChallenger && application.status === "pending"
                  ? { ...application, status: "approved", decidedAt: now }
                  : application,
              ),
              status: item.status === "Draft" ? "On Track" : item.status,
            }
          : item,
      ),
    };
  }

  declinePriorityChallenge(state: OrfState, resultId: string, member: string): OrfState {
    const currentMember = member.trim();
    if (!currentMember) {
      return state;
    }

    const result = state.results.find((item) => item.id === resultId);
    if (!result || result.definer !== currentMember) {
      return state;
    }

    const declinedBy = new Set(result.priorityDeclinedBy ?? []);
    if (declinedBy.has(currentMember)) {
      return state;
    }
    declinedBy.add(currentMember);

    return {
      ...state,
      results: state.results.map((item) =>
        item.id === resultId
          ? {
              ...item,
              priorityDeclinedBy: Array.from(declinedBy),
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
    const targetResult = state.results.find((item) => item.id === input.toResultId);
    if (!task || !targetResult) {
      return state;
    }

    if (input.referenceTaskId === input.taskId && task.linkedResultId === input.toResultId) {
      return state;
    }

    if (input.referenceTaskId) {
      const referenceTask = state.tasks.find((item) => item.id === input.referenceTaskId);
      if (!referenceTask || referenceTask.linkedResultId !== targetResult.id || referenceTask.id === task.id) {
        return state;
      }
    }

    const now = currentDate();
    const previousResultId = task.linkedResultId;
    const previousObjectiveId = task.linkedObjectiveId;
    const movedTask: Task = {
      ...task,
      linkedObjectiveId: targetResult.objectiveId,
      linkedResultId: targetResult.id,
      updatedAt: now,
    };
    const nextTasks = insertTaskByReference(state.tasks, movedTask, input.referenceTaskId, input.placement);

    return {
      ...state,
      tasks: nextTasks,
      objectives: state.objectives.map((objective) => {
        if (objective.id !== previousObjectiveId && objective.id !== targetResult.objectiveId) {
          return objective;
        }

        const taskIds = objective.id === targetResult.objectiveId
          ? nextTasks.filter((item) => item.linkedObjectiveId === objective.id).map((item) => item.id)
          : objective.taskIds.filter((id) => id !== task.id);

        return { ...objective, taskIds, updatedAt: now };
      }),
      results: state.results.map((result) => {
        if (result.id !== previousResultId && result.id !== targetResult.id) {
          return result;
        }

        return {
          ...result,
          taskIds: nextTasks.filter((item) => item.linkedResultId === result.id).map((item) => item.id),
        };
      }),
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
      results: state.results.map((result) => ({ ...result, taskIds: result.taskIds.filter((id) => id !== taskId) })),
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
              activity: [...item.activity, { id: `act-${Date.now()}`, actor: currentUserName(state), action: `更新反馈状态`, at: now }],
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
    const bounty = state.results.find((result) => result.id === input.bountyId);
    const body = input.body.trim();
    if (!bounty || !body) {
      return state;
    }

    const now = currentDate();
    const next = this.addComment(state, {
      targetType: "result",
      targetId: bounty.id,
      targetTitle: bounty.title,
      body: `战利品提交：${body}`,
      author: input.author,
    });

    return {
      ...next,
      tasks: next.tasks.map((task) =>
        task.linkedResultId === bounty.id && task.status !== "Done"
          ? {
              ...task,
              status: "In Review",
              updatedAt: now,
            }
          : task,
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

        const messages = thread.messages.filter((message) => message.id !== messageId && message.parentMessageId !== messageId);
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

    const now = new Date().toISOString().slice(0, 10);
    return {
      ...state,
      results: state.results.map((item) => (item.id === resultId ? { ...item, title, updatedAt: now } : item)),
      decisions: [
        {
          id: `dec-${Date.now()}`,
          title: `更新悬赏指标：${title}`,
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
