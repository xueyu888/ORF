import { and, eq } from "drizzle-orm";
import { initialOrfState } from "../../src/data/initialOrfState";
import type { Evidence, Feedback, MetricDirection, OrfState, Priority, Result, Task, TaskStatus, UncertaintyLevel } from "../../src/types/orf";
import { db } from "../db/client";
import {
  evidence,
  feedback,
  feedbackCauseCategories,
  objectives,
  results,
  resultTrendPoints,
  taskChecklistItems,
  tasks,
} from "../db/schema";

export type TaskManagementData = Pick<OrfState, "objectives" | "results" | "tasks" | "evidence" | "feedback">;

const today = () => new Date().toISOString().slice(0, 10);
const makeId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

function optional<T>(value: T | null): T | undefined {
  return value ?? undefined;
}

function statusFromChecklist(rows: readonly { done: boolean }[], fallback: TaskStatus = "Todo"): TaskStatus {
  if (rows.length === 0) {
    return fallback === "Done" ? "Todo" : fallback;
  }

  const completedCount = rows.filter((row) => row.done).length;
  return completedCount === rows.length ? "Done" : completedCount > 0 ? "In Progress" : "Todo";
}

function reorderIds(ids: string[], movingId: string, referenceId: string, placement: "before" | "after"): string[] {
  const withoutMoving = ids.filter((id) => id !== movingId);
  const referenceIndex = withoutMoving.indexOf(referenceId);
  if (referenceIndex < 0) {
    return [...withoutMoving, movingId];
  }

  const insertIndex = placement === "before" ? referenceIndex : referenceIndex + 1;
  return [...withoutMoving.slice(0, insertIndex), movingId, ...withoutMoving.slice(insertIndex)];
}

export async function getTaskManagementData(): Promise<TaskManagementData> {
  const [objectiveRows, resultRows, trendRows, taskRows, checklistRows, evidenceRows, feedbackRows, causeRows] = await Promise.all([
    db.select().from(objectives),
    db.select().from(results),
    db.select().from(resultTrendPoints),
    db.select().from(tasks),
    db.select().from(taskChecklistItems),
    db.select().from(evidence),
    db.select().from(feedback),
    db.select().from(feedbackCauseCategories),
  ]);

  const checklistByTask = new Map<string, Task["checklist"]>();
  for (const item of checklistRows.sort((left, right) => left.sortOrder - right.sortOrder)) {
    const list = checklistByTask.get(item.taskId) ?? [];
    list.push({ id: item.id, label: item.label, done: item.done, updatedAt: item.updatedAt });
    checklistByTask.set(item.taskId, list);
  }

  const trendByResult = new Map<string, Result["trend"]>();
  for (const point of trendRows.sort((left, right) => left.sortOrder - right.sortOrder)) {
    const list = trendByResult.get(point.resultId) ?? [];
    list.push({ date: point.date, value: point.value });
    trendByResult.set(point.resultId, list);
  }

  const causeCategoriesByFeedback = new Map<string, string[]>();
  for (const item of causeRows.sort((left, right) => left.sortOrder - right.sortOrder)) {
    const list = causeCategoriesByFeedback.get(item.feedbackId) ?? [];
    list.push(item.category);
    causeCategoriesByFeedback.set(item.feedbackId, list);
  }

  const orderedTaskRows = [...taskRows].sort((left, right) => left.sortOrder - right.sortOrder);
  const orderedResultRows = [...resultRows].sort((left, right) => left.sortOrder - right.sortOrder);

  const taskItems: Task[] = orderedTaskRows.map((task) => ({
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    assignee: task.assignee,
    linkedObjectiveId: task.linkedObjectiveId,
    linkedResultId: task.linkedResultId,
    feedbackOriginId: optional(task.feedbackOriginId),
    dueDate: task.dueDate,
    tags: task.tags,
    checklist: checklistByTask.get(task.id) ?? [],
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  }));

  const evidenceItems: Evidence[] = evidenceRows.map((item) => ({
    id: item.id,
    type: item.type,
    title: item.title,
    summary: item.summary,
    source: item.source,
    date: item.date,
    owner: item.owner,
    linkedResultId: item.linkedResultId,
    linkedFeedbackId: optional(item.linkedFeedbackId),
  }));

  const feedbackItems: Feedback[] = feedbackRows.map((item) => ({
    id: item.id,
    phenomenon: item.phenomenon,
    evidenceIds: evidenceItems.filter((evidenceItem) => evidenceItem.linkedFeedbackId === item.id).map((evidenceItem) => evidenceItem.id),
    causeCategories: causeCategoriesByFeedback.get(item.id) ?? [],
    impact: item.impact,
    linkedObjectiveId: item.linkedObjectiveId,
    linkedResultId: item.linkedResultId,
    suggestedAdjustment: item.suggestedAdjustment,
    source: item.source,
    status: item.status,
    owner: item.owner,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    activity: [],
  }));

  const resultItems: Result[] = orderedResultRows.map((result) => ({
    id: result.id,
    objectiveId: result.objectiveId,
    title: result.title,
    description: result.description,
    metricName: result.metricName,
    metricRequirement: optional(result.metricRequirement),
    statisticalObject: optional(result.statisticalObject),
    completionStandard: optional(result.completionStandard),
    sampleSet: optional(result.sampleSet),
    measurementScope: optional(result.measurementScope),
    uncertaintyLevel: optional(result.uncertaintyLevel),
    baseline: result.baseline,
    current: result.current,
    target: result.target,
    unit: result.unit,
    direction: result.direction,
    status: result.status,
    confidence: result.confidence,
    owner: result.owner,
    evidenceIds: evidenceItems.filter((item) => item.linkedResultId === result.id).map((item) => item.id),
    taskIds: taskItems.filter((task) => task.linkedResultId === result.id).map((task) => task.id),
    feedbackIds: feedbackItems.filter((item) => item.linkedResultId === result.id).map((item) => item.id),
    trend: trendByResult.get(result.id) ?? [],
    reviewCadence: result.reviewCadence,
  }));

  return {
    objectives: objectiveRows.map((objective) => ({
      id: objective.id,
      title: objective.title,
      description: objective.description,
      whyItMatters: objective.whyItMatters,
      owner: objective.owner,
      cycle: objective.cycle,
      status: objective.status,
      confidence: objective.confidence,
      progress: objective.progress,
      boundary: objective.boundary,
      successDefinition: objective.successDefinition,
      resultIds: resultItems.filter((result) => result.objectiveId === objective.id).map((result) => result.id),
      feedbackIds: feedbackItems.filter((item) => item.linkedObjectiveId === objective.id).map((item) => item.id),
      taskIds: taskItems.filter((task) => task.linkedObjectiveId === objective.id).map((task) => task.id),
      createdAt: objective.createdAt,
      updatedAt: objective.updatedAt,
    })),
    results: resultItems,
    tasks: taskItems,
    evidence: evidenceItems,
    feedback: feedbackItems,
  };
}

export async function getOrfStateSnapshot(): Promise<OrfState> {
  const data = await getTaskManagementData();
  return {
    ...data,
    users: initialOrfState.users,
    currentUserId: initialOrfState.currentUserId,
    permissionRules: initialOrfState.permissionRules,
    decisions: [],
    evalRuns: [],
    scenarios: [],
    failureSamples: [],
    comments: [],
    causeCategories: Array.from(new Set(data.feedback.flatMap((item) => item.causeCategories))),
    rules: {
      requireResultForTask: true,
      requireEvidenceForFeedback: true,
      weeklyFeedbackCadence: true,
      autoCreateReviewSummary: false,
    },
  };
}

export interface CreateResultInput {
  objectiveId: string;
  title: string;
  metricName: string;
  description?: string;
  baseline?: number;
  current?: number;
  target?: number;
  unit?: string;
  direction?: MetricDirection;
  uncertaintyLevel?: UncertaintyLevel;
  owner?: string;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  assignee?: string;
  priority?: Priority;
  linkedObjectiveId?: string;
  linkedResultId: string;
  dueDate?: string;
}

export interface CreateChecklistItemInput {
  label?: string;
  afterItemId?: string;
}

export async function createResult(input: CreateResultInput): Promise<Result | null> {
  const [objective] = await db.select().from(objectives).where(eq(objectives.id, input.objectiveId)).limit(1);
  if (!objective) {
    return null;
  }

  const siblingRows = await db.select({ sortOrder: results.sortOrder }).from(results).where(eq(results.objectiveId, input.objectiveId));
  const sortOrder = siblingRows.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1;
  const id = makeId("res");

  await db.insert(results).values({
    id,
    teamId: objective.teamId,
    objectiveId: objective.id,
    title: input.title,
    description: input.description ?? "由 ORF Flow 规划创建的指标。",
    metricName: input.metricName,
    metricRequirement: `${input.metricName}：写清统计对象和完成标准后进入执行。`,
    statisticalObject: null,
    completionStandard: null,
    sampleSet: null,
    measurementScope: null,
    uncertaintyLevel: input.uncertaintyLevel ?? null,
    baseline: input.baseline ?? 0,
    current: input.current ?? 0,
    target: input.target ?? 100,
    unit: input.unit ?? "%",
    direction: input.direction ?? "increase",
    status: "Draft",
    confidence: 50,
    owner: input.owner || "User",
    reviewCadence: "Weekly",
    sortOrder,
  });

  const data = await getTaskManagementData();
  return data.results.find((result) => result.id === id) ?? null;
}

export async function createTask(input: CreateTaskInput): Promise<Task | null> {
  const [result] = await db.select().from(results).where(eq(results.id, input.linkedResultId)).limit(1);
  if (!result) {
    return null;
  }

  const siblingRows = await db.select({ sortOrder: tasks.sortOrder }).from(tasks).where(eq(tasks.linkedResultId, result.id));
  const sortOrder = siblingRows.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1;
  const id = `ORF-${Date.now()}`;
  const now = today();

  await db.insert(tasks).values({
    id,
    teamId: result.teamId,
    title: input.title,
    description: input.description ?? "执行支撑关联指标的下一步动作。",
    status: "Todo",
    priority: input.priority ?? "Medium",
    assignee: input.assignee || "User",
    linkedObjectiveId: result.objectiveId,
    linkedResultId: result.id,
    feedbackOriginId: null,
    dueDate: input.dueDate ?? now,
    tags: ["ORF"],
    createdAt: now,
    updatedAt: now,
    sortOrder,
  });

  const data = await getTaskManagementData();
  return data.tasks.find((task) => task.id === id) ?? null;
}

export async function createChecklistItem(taskId: string, input: CreateChecklistItemInput): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [task] = await tx.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
    if (!task) {
      return false;
    }

    const rows = await tx
      .select({ id: taskChecklistItems.id })
      .from(taskChecklistItems)
      .where(eq(taskChecklistItems.taskId, taskId))
      .orderBy(taskChecklistItems.sortOrder);
    const id = makeId("ck");
    const afterIndex = input.afterItemId ? rows.findIndex((row) => row.id === input.afterItemId) : -1;
    const insertIndex = afterIndex >= 0 ? afterIndex + 1 : rows.length;
    const orderedIds = [...rows.map((row) => row.id)];
    orderedIds.splice(insertIndex, 0, id);

    await tx.insert(taskChecklistItems).values({
      id,
      taskId,
      label: input.label ?? "新子任务",
      done: false,
      sortOrder: insertIndex,
      updatedAt: today(),
    });

    await Promise.all(
      orderedIds.map((itemId, index) =>
        tx.update(taskChecklistItems).set({ sortOrder: index }).where(and(eq(taskChecklistItems.taskId, taskId), eq(taskChecklistItems.id, itemId))),
      ),
    );
    await tx.update(tasks).set({ status: task.status === "Done" ? "In Progress" : task.status, updatedAt: today() }).where(eq(tasks.id, taskId));

    return true;
  });
}

export async function deleteObjective(objectiveId: string): Promise<boolean> {
  const deleted = await db.delete(objectives).where(eq(objectives.id, objectiveId)).returning({ id: objectives.id });
  return deleted.length > 0;
}

export async function deleteResult(resultId: string): Promise<boolean> {
  const deleted = await db.delete(results).where(eq(results.id, resultId)).returning({ id: results.id });
  return deleted.length > 0;
}

export async function deleteTask(taskId: string): Promise<boolean> {
  const deleted = await db.delete(tasks).where(eq(tasks.id, taskId)).returning({ id: tasks.id });
  return deleted.length > 0;
}

export async function deleteChecklistItem(taskId: string, itemId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [task] = await tx.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
    if (!task) {
      return false;
    }

    const deleted = await tx
      .delete(taskChecklistItems)
      .where(and(eq(taskChecklistItems.taskId, taskId), eq(taskChecklistItems.id, itemId)))
      .returning({ id: taskChecklistItems.id });
    if (deleted.length === 0) {
      return false;
    }

    const rows = await tx
      .select({ id: taskChecklistItems.id, done: taskChecklistItems.done })
      .from(taskChecklistItems)
      .where(eq(taskChecklistItems.taskId, taskId))
      .orderBy(taskChecklistItems.sortOrder);
    await Promise.all(
      rows.map((row, index) => tx.update(taskChecklistItems).set({ sortOrder: index }).where(eq(taskChecklistItems.id, row.id))),
    );
    await tx.update(tasks).set({ status: statusFromChecklist(rows, task.status), updatedAt: today() }).where(eq(tasks.id, taskId));
    return true;
  });
}

export async function moveResult(resultId: string, referenceResultId: string, placement: "before" | "after"): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [moving] = await tx.select().from(results).where(eq(results.id, resultId)).limit(1);
    const [reference] = await tx.select().from(results).where(eq(results.id, referenceResultId)).limit(1);
    if (!moving || !reference || moving.objectiveId !== reference.objectiveId || moving.id === reference.id) {
      return false;
    }

    const rows = await tx
      .select({ id: results.id })
      .from(results)
      .where(eq(results.objectiveId, moving.objectiveId))
      .orderBy(results.sortOrder);
    const orderedIds = reorderIds(rows.map((row) => row.id), resultId, referenceResultId, placement);
    await Promise.all(orderedIds.map((id, index) => tx.update(results).set({ sortOrder: index }).where(eq(results.id, id))));
    await tx.update(objectives).set({ updatedAt: today() }).where(eq(objectives.id, moving.objectiveId));
    return true;
  });
}

export async function moveTask(taskId: string, input: { toResultId: string; referenceTaskId?: string; placement?: "before" | "after" }): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [task] = await tx.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
    const [targetResult] = await tx.select().from(results).where(eq(results.id, input.toResultId)).limit(1);
    if (!task || !targetResult) {
      return false;
    }
    if (input.referenceTaskId) {
      const [referenceTask] = await tx.select().from(tasks).where(eq(tasks.id, input.referenceTaskId)).limit(1);
      if (!referenceTask || referenceTask.linkedResultId !== targetResult.id || referenceTask.id === task.id) {
        return false;
      }
    }

    await tx
      .update(tasks)
      .set({ linkedResultId: targetResult.id, linkedObjectiveId: targetResult.objectiveId, updatedAt: today() })
      .where(eq(tasks.id, taskId));

    const affectedResultIds = Array.from(new Set([task.linkedResultId, targetResult.id]));
    for (const resultId of affectedResultIds) {
      const rows = await tx
        .select({ id: tasks.id })
        .from(tasks)
        .where(eq(tasks.linkedResultId, resultId))
        .orderBy(tasks.sortOrder);
      const ids = rows.map((row) => row.id);
      const orderedIds =
        resultId === targetResult.id && input.referenceTaskId
          ? reorderIds(ids, taskId, input.referenceTaskId, input.placement ?? "after")
          : resultId === targetResult.id
            ? ids.filter((id) => id !== taskId).concat(taskId)
            : ids.filter((id) => id !== taskId);

      await Promise.all(orderedIds.map((id, index) => tx.update(tasks).set({ sortOrder: index }).where(eq(tasks.id, id))));
    }

    return true;
  });
}

export async function moveChecklistItem(
  taskId: string,
  itemId: string,
  input: { toTaskId: string; referenceItemId?: string; placement?: "before" | "after" },
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [item] = await tx
      .select()
      .from(taskChecklistItems)
      .where(and(eq(taskChecklistItems.taskId, taskId), eq(taskChecklistItems.id, itemId)))
      .limit(1);
    const [targetTask] = await tx.select().from(tasks).where(eq(tasks.id, input.toTaskId)).limit(1);
    const [sourceTask] = await tx.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
    if (!item || !targetTask || !sourceTask) {
      return false;
    }
    if (input.referenceItemId) {
      const [referenceItem] = await tx.select().from(taskChecklistItems).where(eq(taskChecklistItems.id, input.referenceItemId)).limit(1);
      if (!referenceItem || referenceItem.taskId !== input.toTaskId || referenceItem.id === itemId) {
        return false;
      }
    }

    await tx.update(taskChecklistItems).set({ taskId: input.toTaskId, updatedAt: today() }).where(eq(taskChecklistItems.id, itemId));

    const affectedTaskIds = Array.from(new Set([taskId, input.toTaskId]));
    for (const currentTaskId of affectedTaskIds) {
      const rows = await tx
        .select({ id: taskChecklistItems.id, done: taskChecklistItems.done })
        .from(taskChecklistItems)
        .where(eq(taskChecklistItems.taskId, currentTaskId))
        .orderBy(taskChecklistItems.sortOrder);
      const ids = rows.map((row) => row.id);
      const orderedIds =
        currentTaskId === input.toTaskId && input.referenceItemId
          ? reorderIds(ids, itemId, input.referenceItemId, input.placement ?? "after")
          : currentTaskId === input.toTaskId
            ? ids.filter((id) => id !== itemId).concat(itemId)
          : ids;

      await Promise.all(orderedIds.map((id, index) => tx.update(taskChecklistItems).set({ sortOrder: index }).where(eq(taskChecklistItems.id, id))));
      const fallback = currentTaskId === sourceTask.id ? sourceTask.status : targetTask.status;
      await tx.update(tasks).set({ status: statusFromChecklist(rows, fallback), updatedAt: today() }).where(eq(tasks.id, currentTaskId));
    }

    return true;
  });
}

export async function updateTaskStatus(taskId: string, status: TaskStatus): Promise<boolean> {
  const updated = await db.update(tasks).set({ status, updatedAt: today() }).where(eq(tasks.id, taskId)).returning({ id: tasks.id });
  return updated.length > 0;
}

export async function setTaskCompletion(taskId: string, done: boolean): Promise<boolean> {
  const status: TaskStatus = done ? "Done" : "Todo";
  return db.transaction(async (tx) => {
    const updated = await tx.update(tasks).set({ status, updatedAt: today() }).where(eq(tasks.id, taskId)).returning({ id: tasks.id });
    if (updated.length === 0) {
      return false;
    }

    await tx.update(taskChecklistItems).set({ done, updatedAt: today() }).where(eq(taskChecklistItems.taskId, taskId));
    return true;
  });
}

export async function updateChecklistItem(taskId: string, itemId: string, done: boolean): Promise<boolean> {
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(taskChecklistItems)
      .set({ done, updatedAt: today() })
      .where(and(eq(taskChecklistItems.taskId, taskId), eq(taskChecklistItems.id, itemId)))
      .returning({ id: taskChecklistItems.id });

    if (updated.length === 0) {
      return false;
    }

    const checklist = await tx.select({ done: taskChecklistItems.done }).from(taskChecklistItems).where(eq(taskChecklistItems.taskId, taskId));
    const completedCount = checklist.filter((item) => item.done).length;
    const status: TaskStatus = completedCount === checklist.length ? "Done" : completedCount > 0 ? "In Progress" : "Todo";

    await tx.update(tasks).set({ status, updatedAt: today() }).where(eq(tasks.id, taskId));
    return true;
  });
}
