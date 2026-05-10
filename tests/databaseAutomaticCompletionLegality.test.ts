import assert from "node:assert/strict";
import { after, test } from "node:test";
import { closeDb, db } from "../server/db/client";
import { objectives, results, taskChecklistItems, tasks } from "../server/db/schema";
import { calculateAutomaticCompletion, shouldCallAutomaticCompletion } from "../server/utils/automaticCompletion";
import type { AutomaticCompletionSnapshot } from "../server/utils/automaticCompletion";
import type { Objective, Result, Task, TaskStatus } from "../src/types/orf";

interface ObjectiveRow {
  id: string;
}

interface ResultRow {
  id: string;
  objectiveId: string;
}

interface TaskRow {
  id: string;
  status: TaskStatus;
  linkedObjectiveId: string;
  linkedResultId: string;
}

interface ChecklistRow {
  taskId: string;
  done: boolean;
}

after(async () => {
  await closeDb();
});

test("database rows do not call automatic completion outside goalFrozen", async () => {
  const data = await loadAutomaticCompletionRows();

  assert.ok(data.objectives.length > 0);
  assert.equal(shouldCallAutomaticCompletion({ previousStage: "orfReestimate", currentStage: "orfReestimate", snapshotChanged: true }), false);
});

test("database hierarchy cannot complete illegal frozen inputs", async () => {
  const data = await loadAutomaticCompletionRows();
  const snapshots = databaseSnapshots(data);

  assert.ok(snapshots.length > 0);

  for (const snapshot of snapshots) {
    const actual = calculateAutomaticCompletion(snapshot);

    if (!actual.legal) {
      assert.equal(actual.goal, 0, snapshot.objective.id);
      assert.ok(actual.errors.length > 0, snapshot.objective.id);
      continue;
    }

    assert.deepEqual(actual.errors, []);
  }
});

async function loadAutomaticCompletionRows() {
  const [objectiveRows, resultRows, taskRows, checklistRows] = await Promise.all([
    db.select({ id: objectives.id }).from(objectives),
    db.select({ id: results.id, objectiveId: results.objectiveId }).from(results),
    db
      .select({
        id: tasks.id,
        status: tasks.status,
        linkedObjectiveId: tasks.linkedObjectiveId,
        linkedResultId: tasks.linkedResultId,
      })
      .from(tasks),
    db
      .select({
        taskId: taskChecklistItems.taskId,
        done: taskChecklistItems.done,
      })
      .from(taskChecklistItems),
  ]);

  return {
    objectives: objectiveRows satisfies ObjectiveRow[],
    results: resultRows satisfies ResultRow[],
    tasks: taskRows satisfies TaskRow[],
    checklistItems: checklistRows satisfies ChecklistRow[],
  };
}

function databaseSnapshots(data: Awaited<ReturnType<typeof loadAutomaticCompletionRows>>): AutomaticCompletionSnapshot[] {
  return data.objectives.map((objective) => {
    const objectiveResults = data.results.filter((result) => result.objectiveId === objective.id);
    const resultIds = new Set(objectiveResults.map((result) => result.id));
    const objectiveTasks = data.tasks.filter((task) => task.linkedObjectiveId === objective.id || resultIds.has(task.linkedResultId));
    const checklistByTask = new Map<string, ChecklistRow[]>();

    for (const item of data.checklistItems) {
      checklistByTask.set(item.taskId, [...(checklistByTask.get(item.taskId) ?? []), item]);
    }

    return {
      objective: makeObjective(objective.id, objectiveResults.map((result) => result.id), objectiveTasks.map((task) => task.id)),
      results: objectiveResults.map((result) => makeResult(result.id, objective.id, objectiveTasks.filter((task) => task.linkedResultId === result.id).map((task) => task.id))),
      tasks: objectiveTasks.map((task) => makeTask(task, checklistByTask.get(task.id) ?? [])),
    };
  });
}

function makeObjective(id: string, resultIds: string[], taskIds: string[]): Objective {
  return {
    id,
    title: id,
    description: id,
    whyItMatters: id,
    cycle: "Database",
    stage: "goalFrozen",
    status: "On Track",
    confidence: 100,
    progress: 0,
    boundary: "Database",
    successDefinition: "Database",
    resultIds,
    feedbackIds: [],
    taskIds,
    createdAt: "2026-05-05",
    updatedAt: "2026-05-05",
  };
}

function makeResult(id: string, objectiveId: string, taskIds: string[]): Result {
  return {
    id,
    objectiveId,
    title: id,
    description: id,
    metricName: id,
    baseline: 0,
    current: 0,
    target: 1,
    unit: "",
    direction: "increase",
    status: "On Track",
    confidence: 100,
    owner: "User",
    evidenceIds: [],
    taskIds,
    feedbackIds: [],
    trend: [],
    reviewCadence: "Weekly",
  };
}

function makeTask(task: TaskRow, checklist: ChecklistRow[]): Task {
  return {
    id: task.id,
    title: task.id,
    description: task.id,
    status: task.status,
    priority: "Medium",
    assignee: "User",
    linkedObjectiveId: task.linkedObjectiveId,
    linkedResultId: task.linkedResultId,
    dueDate: "2026-05-05",
    tags: [],
    checklist: checklist.map((item, index) => ({
      id: `${task.id}-ck-${index}`,
      label: `${task.id}-ck-${index}`,
      done: item.done,
      updatedAt: "2026-05-05",
    })),
    createdAt: "2026-05-05",
    updatedAt: "2026-05-05",
  };
}
