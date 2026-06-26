import type { Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { objectives, taskChecklistItems, tasks } from "../../../../../../server/db/schema";
import type { OrfStage } from "../../../../../../src/types/orf";
import { db } from "../../../../../_operators/testd-db-client";
import { readTestUserIdByNameInTeam, requiredTestUserIdByNameInTeam } from "../../../../../_operators/common.helpers";
import {
  deleteTestTask,
  objectivePanel,
  testTaskAbsent,
  targetSubtaskRow,
  targetTaskRow,
  taskTargetFromObjective,
} from "../../_shared/action-item.helpers";
import type {
  MemberDeleteSubtaskFixture,
  MemberDeleteTaskFixture,
  MemberDeleteTaskTarget,
} from "./member-delete-task.context";

export { deleteTestTask, objectivePanel, targetSubtaskRow, targetTaskRow, taskTargetFromObjective, testTaskAbsent };

export async function prepareTaskDeleteTarget(target: MemberDeleteTaskTarget, memberName: string) {
  const objective = await readObjective(target.objective.id);
  if (!objective) {
    throw new Error("删除行动项用例目标不存在");
  }
  const memberUserId = await requiredTestUserIdByNameInTeam({ teamId: objective.teamId, name: memberName });

  await db
    .update(objectives)
    .set({
      stage: "goalFrozen",
      flowStatus: "frozen",
      challengers: uniqueMembers([...objective.challengers, memberName]),
      challengerUserIds: uniqueMembers([...objective.challengerUserIds, memberUserId]),
      updatedAt: todayIsoDate(),
    })
    .where(eq(objectives.id, target.objective.id));
}

export async function createFixtureTask(input: {
  id: string;
  linkedObjectiveId: string;
  title: string;
  description: string;
  assignee: string;
  status: MemberDeleteTaskFixture["status"];
  priority: MemberDeleteTaskFixture["priority"];
  teamId: string;
  userId?: string;
}): Promise<MemberDeleteTaskFixture> {
  const today = todayIsoDate();
  const assigneeUserId = await requiredTestUserIdByNameInTeam({
    teamId: input.teamId,
    name: input.assignee,
  });

  await db
    .insert(tasks)
    .values({
      id: input.id,
      teamId: input.teamId,
      title: input.title,
      description: input.description,
      status: input.status,
      priority: input.priority,
      assignee: input.assignee,
      assigneeUserId,
      linkedObjectiveId: input.linkedObjectiveId,
      feedbackOriginId: null,
      dueDate: addDaysIsoDate(14),
      tags: [],
      createdAt: today,
      updatedAt: today,
      sortOrder: 0,
      createdBy: input.userId,
      updatedBy: input.userId,
    })
    .onConflictDoUpdate({
      target: tasks.id,
      set: {
        teamId: input.teamId,
        title: input.title,
        description: input.description,
        status: input.status,
        priority: input.priority,
        assignee: input.assignee,
        assigneeUserId,
        linkedObjectiveId: input.linkedObjectiveId,
        feedbackOriginId: null,
        dueDate: addDaysIsoDate(14),
        tags: [],
        updatedAt: today,
        sortOrder: 0,
        updatedBy: input.userId,
      },
    });

  const task = await readTask(input.id);
  if (!task) {
    throw new Error(`删除行动项测试任务创建失败: ${input.id}`);
  }
  return task;
}

export async function createFixtureSubtask(input: {
  id: string;
  taskId: string;
  label: string;
}): Promise<MemberDeleteSubtaskFixture> {
  const updatedAt = todayIsoDate();
  await db
    .insert(taskChecklistItems)
    .values({
      id: input.id,
      taskId: input.taskId,
      label: input.label,
      done: false,
      sortOrder: 0,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: taskChecklistItems.id,
      set: {
        taskId: input.taskId,
        label: input.label,
        done: false,
        sortOrder: 0,
        updatedAt,
      },
    });

  const subtask = await readSubtaskById(input.id);
  if (!subtask) {
    throw new Error(`删除行动项测试子行动项创建失败: ${input.id}`);
  }
  return subtask;
}

export async function fixtureRecorded(task: MemberDeleteTaskFixture, subtask: MemberDeleteSubtaskFixture) {
  const persistedTask = await readTask(task.id);
  const persistedSubtask = await readSubtaskById(subtask.id);
  return Boolean(
    persistedTask &&
      persistedSubtask &&
      persistedSubtask.taskId === persistedTask.id &&
      persistedTask.title === task.title &&
      persistedSubtask.label === subtask.label,
  );
}

export async function targetFlowStatus(target: MemberDeleteTaskTarget) {
  return (await readObjective(target.objective.id))?.flowStatus ?? null;
}

export async function targetStage(target: MemberDeleteTaskTarget): Promise<OrfStage | null> {
  return (await readObjective(target.objective.id))?.stage ?? null;
}

export async function targetHasChallenger(target: MemberDeleteTaskTarget, memberName: string) {
  const objective = await readObjective(target.objective.id);
  if (!objective) {
    return false;
  }
  const memberUserId = await readTestUserIdByNameInTeam({ teamId: objective.teamId, name: memberName });
  return !!memberUserId && objective.challengerUserIds.includes(memberUserId);
}

export async function targetCanDeleteTask(target: MemberDeleteTaskTarget, actor: { name: string; role: string }) {
  const objective = await readObjective(target.objective.id);
  if (!objective || objective.flowStatus !== "frozen") {
    return false;
  }
  if (actor.role === "admin") {
    return true;
  }
  const actorUserId = await readTestUserIdByNameInTeam({ teamId: objective.teamId, name: actor.name });
  return !!actorUserId && objective.challengerUserIds.includes(actorUserId);
}

export async function targetTaskPresent(target: MemberDeleteTaskTarget, task: Pick<MemberDeleteTaskFixture, "id" | "title">) {
  const row = await readTargetTask(target.objective.id, task.id, task.title);
  return !!row;
}

export async function targetTaskAbsent(target: MemberDeleteTaskTarget, title: string) {
  return (await readTargetTask(target.objective.id, null, title)) === null;
}

export async function taskSubtaskPresent(task: Pick<MemberDeleteTaskFixture, "id">, label: string) {
  return (await readSubtask(task.id, label)) !== null;
}

export async function taskSubtaskAbsent(task: Pick<MemberDeleteTaskFixture, "id">, label: string) {
  return (await readSubtask(task.id, label)) === null;
}

export function taskRowMenuButton(page: Page, target: MemberDeleteTaskTarget, task: Pick<MemberDeleteTaskFixture, "title">) {
  return targetTaskRow(page, target, task).locator('button[aria-label*="打开块菜单"]').first();
}

export function taskDeleteMenuItem(page: Page) {
  return page.locator(".orf-block-menu").getByRole("button", { name: "删除" }).last();
}

export function challengeScopeTab(page: Page, label: string) {
  return page.getByRole("button", { name: label, exact: true });
}

export function challengeStatusTrigger(page: Page) {
  return page.getByRole("button", { name: "挑战状态" });
}

export async function memberWorkbenchTaskMissing(
  page: Page,
  target: MemberDeleteTaskTarget,
  task: Pick<MemberDeleteTaskFixture, "id" | "title">,
) {
  const response = await readMemberWorkbenchData(page);
  if (response.status !== 200) {
    return false;
  }

  const objectivesValue = typeof response.body === "object" && response.body !== null
    ? (response.body as { objectives?: unknown }).objectives
    : undefined;
  const tasksValue = typeof response.body === "object" && response.body !== null
    ? (response.body as { tasks?: unknown }).tasks
    : undefined;

  const objectiveRows = Array.isArray(objectivesValue) ? objectivesValue : [];
  const taskRows = Array.isArray(tasksValue) ? tasksValue : [];

  const objectiveRow = objectiveRows.find((item) => {
    if (typeof item !== "object" || item === null) {
      return false;
    }
    const objective = item as { id?: unknown; title?: unknown };
    return objective.id === target.objective.id || objective.title === target.objective.title;
  }) as { taskIds?: unknown } | undefined;

  if (!objectiveRow) {
    return false;
  }

  const taskIds = Array.isArray(objectiveRow.taskIds)
    ? objectiveRow.taskIds.filter((item): item is string => typeof item === "string")
    : [];

  const taskStillPresent = taskRows.some((item) => {
    if (typeof item !== "object" || item === null) {
      return false;
    }
    const taskRow = item as { id?: unknown; title?: unknown };
    return taskRow.id === task.id || taskRow.title === task.title;
  });

  return !taskStillPresent && !taskIds.includes(task.id);
}

async function readMemberWorkbenchData(page: Page): Promise<{ status: number; body: unknown }> {
  return page.evaluate(async () => {
    const response = await fetch("/api/my-challenges?scope=mine", {
      credentials: "include",
    });
    return {
      status: response.status,
      body: await response.json().catch(() => ({})),
    };
  });
}

async function readObjective(objectiveId: string) {
  const [row] = await db
    .select({
      id: objectives.id,
      teamId: objectives.teamId,
      stage: objectives.stage,
      title: objectives.title,
      flowStatus: objectives.flowStatus,
      challengers: objectives.challengers,
      challengerUserIds: objectives.challengerUserIds,
    })
    .from(objectives)
    .where(eq(objectives.id, objectiveId))
    .limit(1);

  return row ?? null;
}

async function readTargetTask(objectiveId: string, taskId: string | null, title: string) {
  const conditions = [eq(tasks.linkedObjectiveId, objectiveId), eq(tasks.title, title)];
  if (taskId) {
    conditions.push(eq(tasks.id, taskId));
  }

  const [row] = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
      assignee: tasks.assignee,
      linkedObjectiveId: tasks.linkedObjectiveId,
      status: tasks.status,
      priority: tasks.priority,
    })
    .from(tasks)
    .where(and(...conditions))
    .limit(1);

  return row ?? null;
}

async function readTask(taskId: string): Promise<MemberDeleteTaskFixture | null> {
  const [row] = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
      assignee: tasks.assignee,
      linkedObjectiveId: tasks.linkedObjectiveId,
      status: tasks.status,
      priority: tasks.priority,
    })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);

  return row ?? null;
}

async function readSubtask(taskId: string, label: string): Promise<MemberDeleteSubtaskFixture | null> {
  const [row] = await db
    .select({
      id: taskChecklistItems.id,
      taskId: taskChecklistItems.taskId,
      label: taskChecklistItems.label,
      done: taskChecklistItems.done,
    })
    .from(taskChecklistItems)
    .where(and(eq(taskChecklistItems.taskId, taskId), eq(taskChecklistItems.label, label)))
    .limit(1);

  return row ?? null;
}

async function readSubtaskById(subtaskId: string): Promise<MemberDeleteSubtaskFixture | null> {
  const [row] = await db
    .select({
      id: taskChecklistItems.id,
      taskId: taskChecklistItems.taskId,
      label: taskChecklistItems.label,
      done: taskChecklistItems.done,
    })
    .from(taskChecklistItems)
    .where(eq(taskChecklistItems.id, subtaskId))
    .limit(1);

  return row ?? null;
}

function uniqueMembers(members: string[]) {
  return Array.from(new Set(members.map((member) => member.trim()).filter(Boolean)));
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIsoDate(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}
