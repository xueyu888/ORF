import { initialOrfState } from "../data/mockData";
import type { CommentStatus, CommentTargetType, Feedback, FeedbackStatus, OrfState, Result, Task, TaskStatus } from "../types/orf";

const STORAGE_KEY = "orf-flow-state-v3";

const cloneState = (state: OrfState): OrfState => JSON.parse(JSON.stringify(state)) as OrfState;
const makeId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const currentTime = () => new Date().toISOString();
const currentDate = () => currentTime().slice(0, 10);
const normalizeState = (state: OrfState): OrfState => ({
  ...state,
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
      owner: input.owner,
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
      owner: input.owner ?? "Alex Chen",
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
    const id = `fb-${Date.now()}`;
    const now = new Date().toISOString().slice(0, 10);
    const feedback: Feedback = {
      id,
      phenomenon: input.phenomenon,
      evidenceIds: [],
      causeCategories: input.causeCategories,
      impact: input.impact,
      linkedObjectiveId: input.linkedObjectiveId,
      linkedResultId: input.linkedResultId,
      suggestedAdjustment: input.suggestedAdjustment,
      source: input.source,
      status: "New",
      owner: input.owner,
      createdAt: now,
      updatedAt: now,
      activity: [{ id: `act-${Date.now()}`, actor: input.owner, action: "创建了结构化反馈", at: now }],
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
    const nextNumber = 128 + state.tasks.length + 1;
    const now = new Date().toISOString().slice(0, 10);
    const task: Task = {
      id: input.id ?? `ORF-${nextNumber}`,
      title: input.title,
      description: input.description,
      status: input.status ?? "Todo",
      priority: input.priority,
      assignee: input.assignee,
      linkedObjectiveId: input.linkedObjectiveId,
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

        const checklist = task.checklist.map((item) => (item.id === itemId ? { ...item, done, updatedAt: now } : item));
        const completedCount = checklist.filter((item) => item.done).length;
        const status: TaskStatus = completedCount === checklist.length ? "Done" : completedCount > 0 ? "In Progress" : "Todo";

        return {
          ...task,
          status,
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
              activity: [...item.activity, { id: `act-${Date.now()}`, actor: "Alex Chen", action: `更新反馈状态`, at: now }],
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
    },
  ): OrfState {
    const body = input.body.trim();
    if (!body) {
      return state;
    }

    const now = currentTime();
    const author = input.author ?? "Alex Chen";
    const message = {
      id: makeId("cmsg"),
      author,
      body,
      createdAt: now,
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
          owner: "Alex Chen",
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
