import { initialOrfState } from "../data/mockData";
import type { Feedback, FeedbackStatus, OrfState, Result, Task, TaskStatus } from "../types/orf";

const STORAGE_KEY = "orf-flow-state-v3";

const cloneState = (state: OrfState): OrfState => JSON.parse(JSON.stringify(state)) as OrfState;

export class OrfFlowStore {
  load(): OrfState {
    const fallback = cloneState(initialOrfState);

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return fallback;
      }

      return { ...fallback, ...(JSON.parse(raw) as Partial<OrfState>) };
    } catch {
      return fallback;
    }
  }

  save(state: OrfState): void {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  reset(): OrfState {
    const state = cloneState(initialOrfState);
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
      checklist: input.checklist ?? [],
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
              checklist: task.checklist.map((item) => ({ ...item, done })),
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

        const checklist = task.checklist.map((item) => (item.id === itemId ? { ...item, done } : item));
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

  updateFeedbackStatus(state: OrfState, feedbackId: string, status: FeedbackStatus): OrfState {
    const now = new Date().toISOString().slice(0, 10);
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
