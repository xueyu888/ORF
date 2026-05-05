import assert from "node:assert/strict";
import { after, test } from "node:test";
import { closeDb, db } from "../server/db/client";
import { objectives, results, taskChecklistItems, tasks } from "../server/db/schema";
import type { TaskStatus } from "../src/types/orf";

type Bit = 0 | 1;

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

test("database hierarchy is legal under automatic completion rules", async () => {
  const data = await loadAutomaticCompletionRows();
  const legality = validateDatabaseLegality(data);

  assert.deepEqual(legality.errors, []);
  assert.ok(Object.keys(legality.goalCompletion).length > 0);
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

function validateDatabaseLegality(data: Awaited<ReturnType<typeof loadAutomaticCompletionRows>>) {
  const errors: string[] = [];
  const goalCompletion: Record<string, Bit> = {};
  const resultCompletion: Record<string, Bit> = {};
  const taskCompletion: Record<string, Bit> = {};

  for (const objective of data.objectives) {
    const objectiveResults = data.results.filter((result) => result.objectiveId === objective.id);

    if (objectiveResults.length === 0) {
      errors.push(`goal ${objective.id} must contain at least one ret`);
      continue;
    }

    for (const result of objectiveResults) {
      const resultTasks = data.tasks.filter((task) => task.linkedResultId === result.id);

      if (resultTasks.length === 0) {
        errors.push(`ret ${result.id} must contain at least one task`);
        continue;
      }

      for (const task of resultTasks) {
        if (task.linkedObjectiveId !== objective.id) {
          errors.push(`task ${task.id} linkedObjectiveId must equal goal ${objective.id}`);
        }

        taskCompletion[task.id] = calculateTaskCompletion(task, data.checklistItems.filter((item) => item.taskId === task.id));
      }

      resultCompletion[result.id] = allDone(resultTasks.map((task) => taskCompletion[task.id]));
    }

    if (objectiveResults.every((result) => result.id in resultCompletion)) {
      goalCompletion[objective.id] = allDone(objectiveResults.map((result) => resultCompletion[result.id]));
    }
  }

  return {
    errors,
    goalCompletion,
    resultCompletion,
    taskCompletion,
  };
}

function calculateTaskCompletion(task: TaskRow, checklist: ChecklistRow[]): Bit {
  return checklist.length === 0 ? taskStatusDone(task.status) : allDone(checklist.map((item) => (item.done ? 1 : 0)));
}

function taskStatusDone(status: TaskStatus): Bit {
  return status === "Done" ? 1 : 0;
}

function allDone(values: Bit[]): Bit {
  return values.every((value) => value === 1) ? 1 : 0;
}
