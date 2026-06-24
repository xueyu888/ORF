import type { Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import type { ObjectiveFlowStatus } from "../../../src/types/orf";
import { objectivePanelByTitle } from "../../_operators/challenge-workbench.helpers";
import { db } from "../../_operators/testd-db-client";
import { objectives, tasks } from "../../../server/db/schema";

export type ActionItemTarget = {
  objective: {
    id: string;
    title: string;
    flowStatus: ObjectiveFlowStatus;
  };
};

export async function taskTargetFromObjective(objectiveId: string): Promise<ActionItemTarget> {
  const [objective] = await db
    .select({
      id: objectives.id,
      title: objectives.title,
      flowStatus: objectives.flowStatus,
    })
    .from(objectives)
    .where(eq(objectives.id, objectiveId))
    .limit(1);

  if (!objective) {
    throw new Error(`行动项目标不存在: ${objectiveId}`);
  }

  return { objective };
}

export async function deleteTestTask(title: string, task?: { id: string } | null) {
  if (task?.id) {
    await db.delete(tasks).where(eq(tasks.id, task.id));
  }
  await db.delete(tasks).where(eq(tasks.title, title));
}

export async function testTaskAbsent(title: string) {
  const [task] = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.title, title)).limit(1);
  return task === undefined;
}

export function objectivePanel(page: Page, target: ActionItemTarget) {
  return objectivePanelByTitle(page, target.objective.title);
}

export function targetTaskRow(page: Page, target: ActionItemTarget, task: Pick<{ title: string }, "title">) {
  return objectivePanel(page, target).locator(".orf-challenge-row-action").filter({ hasText: task.title }).first();
}

export function targetSubtaskRow(page: Page, target: ActionItemTarget, subtask: Pick<{ label: string }, "label">) {
  return objectivePanel(page, target).locator(".orf-subtask-row").filter({ hasText: subtask.label }).first();
}
