import { initialOrfState } from "../data/initialOrfState";
import type { CommentStatus, CommentTargetType, Feedback, FeedbackStatus, OrfState, PermissionAction, PermissionResource, Result, Task, TaskStatus, UserRole, OrfStage } from "../types/orf";

const STORAGE_KEY = "orf-flow-state-v3";
type Placement = "before" | "after";
type MoveResultInput = { resultId: string; objectiveId: string; referenceResultId: string; placement: Placement };
type MoveTaskInput = { taskId: string; toResultId: string; referenceTaskId?: string; placement?: Placement };
type MoveSubtaskInput = { itemId: string; fromTaskId: string; toTaskId: string; referenceItemId?: string; placement?: Placement };

const cloneState = (state: OrfState): OrfState => JSON.parse(JSON.stringify(state)) as OrfState;
const cloneValue = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const makeId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const currentTime = () => new Date().toISOString();
const currentDate = () => currentTime().slice(0, 10);
const adminCount = (users: OrfState["users"]) => users.filter((user) => user.role === "admin").length;
const currentUserName = (state: OrfState) => state.users.find((user) => user.id === state.currentUserId)?.name ?? state.users[0]?.name ?? "User";
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

const normalizeState = (state: OrfState): OrfState => ({
  ...state,
  users: state.users ?? cloneValue(initialOrfState.users),
  currentUserId: state.currentUserId ?? initialOrfState.currentUserId,
  permissionRules: state.permissionRules ?? cloneValue(initialOrfState.permissionRules),
  comments: (state.comments ?? []).map((thread) => ({
    ...thread,
    messages: thread.messages ?? [],
  })),
  tasks: state.tasks.map((task) => ({
    ...task,
    checklist: task.checklist.map((item) => ({ ...item, updatedAt: item.updatedAt ?? task.updatedAt })),
  })),
});

export class OrfFlowStore {
  load(): OrfState {
    const fallback = cloneState(initialOrfState);

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return normalizeState(fallback);
      }

      return normalizeState({ ...fallback, ...(JSON.parse(raw) as Partial<OrfState>) });
    } catch {
      return normalizeState(fallback);
    }
  }

  save(state: OrfState): void {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeState(state)));
  }

  reset(): OrfState {
    const state = normalizeState(cloneState(initialOrfState));
    this.save(state);
    return state;
  }

  createObjective(state: OrfState, input: Pick<OrfState["objectives"][number], "title" | "whyItMatters" | "owner" | "cycle" | "boundary">): OrfState {
    const id = `obj-${Date.now()}`;
    const now = new Date().toISOString().slice(0, 10);
    const objective = {
      id,
      title: input.title,
      description: input.whyItMatters,
      whyItMatters: input.whyItMatters,
      owner: input.owner || currentUserName(state),
      cycle: input.cycle,
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
      description: input.description ?? "由 ORF Flow 规划创建的结果。",
      metricName: input.metricName,
      metricRequirement: input.metricRequirement ?? `${input.metricName}：写清统计对象和完成标准后进入执行。`,
      statisticalObject: input.statisticalObject ?? "负责人确认的标准样本集和线上反馈样本",
      completionStandard: input.completionStandard ?? "达到目标值并有证据支撑",
      sampleSet: input.sampleSet ?? "负责人确认的标准样本集",
      measurementScope: input.measurementScope ?? "固定测试环境下统计系统侧链路表现",
      deliveryRating: input.deliveryRating ?? "复杂",
      baseline: input.baseline ?? 0,
      current: input.current ?? 0,
      target: input.target ?? 100,
      unit: input.unit ?? "%",
      direction: input.direction ?? "increase",
      status: input.status ?? "Draft",
      confidence: input.confidence ?? 50,
      owner: input.owner || currentUserName(state),
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
          label: "新子任务",
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

  createUser(state: OrfState, input: { name: string; email: string; role: UserRole }): OrfState {
    const email = input.email.trim().toLowerCase();
    const name = input.name.trim();
    if (!email || !name) {
      return state;
    }

    const existing = state.users.find((user) => user.email.toLowerCase() === email);
    if (existing) {
      if (existing.role === "admin" && input.role !== "admin" && adminCount(state.users) <= 1) {
        return {
          ...state,
          users: state.users.map((user) => (user.id === existing.id ? { ...user, name } : user)),
        };
      }

      return {
        ...state,
        users: state.users.map((user) => (user.id === existing.id ? { ...user, name, role: input.role } : user)),
      };
    }

    return {
      ...state,
      users: [
        ...state.users,
        {
          id: makeId("user"),
          name,
          email,
          role: input.role,
        },
      ],
    };
  }

  updateUserRole(state: OrfState, userId: string, role: UserRole): OrfState {
    const user = state.users.find((item) => item.id === userId);
    if (user?.role === "admin" && role !== "admin" && adminCount(state.users) <= 1) {
      return state;
    }

    return {
      ...state,
      users: state.users.map((user) => (user.id === userId ? { ...user, role } : user)),
    };
  }

  updateUser(state: OrfState, userId: string, input: { name: string; email: string; role: UserRole }): OrfState {
    const email = input.email.trim().toLowerCase();
    const name = input.name.trim();
    if (!email || !name) {
      return state;
    }

    const user = state.users.find((item) => item.id === userId);
    const emailOwner = state.users.find((item) => item.email.toLowerCase() === email && item.id !== userId);
    if (emailOwner || (user?.role === "admin" && input.role !== "admin" && adminCount(state.users) <= 1)) {
      return state;
    }

    return {
      ...state,
      users: state.users.map((user) => (user.id === userId ? { ...user, name, email, role: input.role } : user)),
    };
  }

  deleteUser(state: OrfState, userId: string): OrfState {
    const user = state.users.find((item) => item.id === userId);
    if (state.users.length <= 1 || (user?.role === "admin" && adminCount(state.users) <= 1)) {
      return state;
    }

    const users = state.users.filter((user) => user.id !== userId);
    const currentUserId = state.currentUserId === userId ? users.find((user) => user.role === "admin")?.id ?? users[0]?.id ?? state.currentUserId : state.currentUserId;

    return {
      ...state,
      users,
      currentUserId,
    };
  }

  updatePermissionRule(
    state: OrfState,
    input: { role: UserRole; stage: OrfStage; resource: PermissionResource; action: PermissionAction; allowed: boolean },
  ): OrfState {
    const rules = state.permissionRules.map((rule) => {
      if (rule.role !== input.role || rule.stage !== input.stage || rule.resource !== input.resource) {
        return rule;
      }

      const actions = input.allowed
        ? Array.from(new Set([...rule.actions, input.action]))
        : rule.actions.filter((action) => action !== input.action);

      return { ...rule, actions };
    });
    const exists = state.permissionRules.some((rule) => rule.role === input.role && rule.stage === input.stage && rule.resource === input.resource);

    if (exists) {
      return { ...state, permissionRules: rules };
    }

    return {
      ...state,
      permissionRules: [
        ...state.permissionRules,
        {
          role: input.role,
          stage: input.stage,
          resource: input.resource,
          actions: input.allowed ? [input.action] : [],
        },
      ],
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
          title: `更新结果：${title}`,
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
