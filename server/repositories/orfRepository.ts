import { and, eq } from "drizzle-orm";
import type { Evidence, Feedback, OrfState, Result, Task, TaskStatus } from "../../src/types/orf";
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

function optional<T>(value: T | null): T | undefined {
  return value ?? undefined;
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
    list.push({ id: item.id, label: item.label, done: item.done });
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

  const taskItems: Task[] = taskRows.map((task) => ({
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

  const resultItems: Result[] = resultRows.map((result) => ({
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
    deliveryRating: optional(result.deliveryRating),
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
    decisions: [],
    evalRuns: [],
    scenarios: [],
    failureSamples: [],
    causeCategories: Array.from(new Set(data.feedback.flatMap((item) => item.causeCategories))),
    rules: {
      requireResultForTask: true,
      requireEvidenceForFeedback: true,
      weeklyFeedbackCadence: true,
      autoCreateReviewSummary: false,
    },
  };
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

    await tx.update(taskChecklistItems).set({ done }).where(eq(taskChecklistItems.taskId, taskId));
    return true;
  });
}

export async function updateChecklistItem(taskId: string, itemId: string, done: boolean): Promise<boolean> {
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(taskChecklistItems)
      .set({ done })
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
