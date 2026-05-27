import type { Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { db } from "../../../../server/db/client";
import { objectives, taskChecklistItems, tasks } from "../../../../server/db/schema";
import type {
  MemberCreateTaskCaseData,
  MemberCreateTaskTarget,
  MemberCreatedSubtask,
  MemberCreatedTask,
} from "./member-create-task.context";

export async function taskTargetFromObjective(objectiveId: string): Promise<MemberCreateTaskTarget> {
  const selected = await readObjective(objectiveId);
  if (!selected) {
    throw new Error(`成员新增行动项目标不存在: ${objectiveId}`);
  }
  return {
    objective: {
      id: selected.id,
      title: selected.title,
      flowStatus: selected.flowStatus,
    },
  };
}

export async function prepareTaskTarget(target: MemberCreateTaskTarget, memberName: string) {
  const objective = await readObjective(target.objective.id);
  if (!objective) {
    throw new Error("目标不存在，无法准备成员新增行动项状态");
  }

  await db
    .update(objectives)
    .set({
      stage: "orfReestimate",
      flowStatus: "reestimating",
      challengers: uniqueMembers([...objective.challengers, memberName]),
      updatedAt: today(),
    })
    .where(eq(objectives.id, target.objective.id));
}

export async function targetCanCreateTask(target: MemberCreateTaskTarget, memberName: string) {
  const objective = await readObjective(target.objective.id);
  return !!objective && objective.flowStatus === "reestimating" && objective.challengers.includes(memberName);
}

export async function testTaskAbsent(title: string) {
  return (await readTaskByTitle(title)) === null;
}

export async function targetTaskAbsent(target: MemberCreateTaskTarget, title: string) {
  return (await readTargetTask(target.objective.id, title)) === null;
}

export async function targetTaskPresent(
  target: MemberCreateTaskTarget,
  expected: Pick<MemberCreateTaskCaseData, "name" | "taskTitle" | "taskDescription">,
) {
  const row = await readTargetTask(target.objective.id, expected.taskTitle);
  return (
    !!row &&
    row.linkedObjectiveId === target.objective.id &&
    row.description === expected.taskDescription &&
    row.assignee === expected.name
  );
}

export async function taskSubtaskPresent(task: MemberCreatedTask, label: string) {
  return (await readSubtask(task.id, label)) !== null;
}

export async function deleteTestTask(title: string, createdTask?: MemberCreatedTask | null) {
  if (createdTask?.id) {
    await db.delete(tasks).where(eq(tasks.id, createdTask.id));
  }
  await db.delete(tasks).where(eq(tasks.title, title));
}

export function objectivePanel(page: Page, target: MemberCreateTaskTarget) {
  return page.locator("section.orf-objective-panel").filter({ hasText: target.objective.title }).first();
}

export function targetAddMenuButton(page: Page, target: MemberCreateTaskTarget) {
  return objectivePanel(page, target).getByRole("button", { name: "新增子级" }).first();
}

export function targetTaskMenuItem(page: Page, target: MemberCreateTaskTarget) {
  return objectivePanel(page, target).getByRole("button", { name: "新增行动项" }).first();
}

export function targetTaskRow(page: Page, target: MemberCreateTaskTarget, task: Pick<MemberCreatedTask, "title">) {
  return objectivePanel(page, target).locator(".orf-challenge-row-action").filter({ hasText: task.title }).first();
}

export function targetSubtaskButton(page: Page, target: MemberCreateTaskTarget, task: Pick<MemberCreatedTask, "title">) {
  return targetTaskRow(page, target, task).getByLabel("新增子行动项");
}

export function targetSubtaskRow(page: Page, target: MemberCreateTaskTarget, subtask: Pick<MemberCreatedSubtask, "label">) {
  return objectivePanel(page, target).locator(".orf-subtask-row").filter({ hasText: subtask.label }).first();
}

export function createdTaskFromResponse(body: unknown): MemberCreatedTask {
  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as { task?: unknown }).task !== "object" ||
    (body as { task?: unknown }).task === null
  ) {
    throw new Error("新建行动项接口响应缺少 task");
  }

  const task = (body as { task: Record<string, unknown> }).task;
  if (
    typeof task.id !== "string" ||
    typeof task.title !== "string" ||
    typeof task.description !== "string" ||
    typeof task.assignee !== "string" ||
    typeof task.linkedObjectiveId !== "string" ||
    typeof task.status !== "string" ||
    typeof task.priority !== "string"
  ) {
    throw new Error("新建行动项接口响应 task 结构不完整");
  }

  return {
    id: task.id,
    title: task.title,
    description: task.description,
    assignee: task.assignee,
    linkedObjectiveId: task.linkedObjectiveId,
    status: task.status as MemberCreatedTask["status"],
    priority: task.priority as MemberCreatedTask["priority"],
  };
}

export function createdSubtaskFromResponse(body: unknown, task: MemberCreatedTask): MemberCreatedSubtask {
  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as { item?: unknown }).item !== "object" ||
    (body as { item?: unknown }).item === null
  ) {
    throw new Error("新建子行动项接口响应缺少 item");
  }

  const item = (body as { item: Record<string, unknown> }).item;
  if (typeof item.id !== "string" || typeof item.label !== "string" || typeof item.done !== "boolean") {
    throw new Error("新建子行动项接口响应 item 结构不完整");
  }

  return {
    id: item.id,
    taskId: task.id,
    label: item.label,
    done: item.done,
  };
}

async function readTargetTask(objectiveId: string, title: string) {
  const [row] = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
      assignee: tasks.assignee,
      linkedObjectiveId: tasks.linkedObjectiveId,
    })
    .from(tasks)
    .where(and(eq(tasks.linkedObjectiveId, objectiveId), eq(tasks.title, title)))
    .limit(1);

  return row ?? null;
}

async function readTaskByTitle(title: string) {
  const [row] = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.title, title)).limit(1);
  return row ?? null;
}

async function readSubtask(taskId: string, label: string): Promise<MemberCreatedSubtask | null> {
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

async function readObjective(objectiveId: string) {
  const [row] = await db
    .select({
      id: objectives.id,
      title: objectives.title,
      flowStatus: objectives.flowStatus,
      challengers: objectives.challengers,
    })
    .from(objectives)
    .where(eq(objectives.id, objectiveId))
    .limit(1);

  return row ?? null;
}

function uniqueMembers(members: string[]) {
  return Array.from(new Set(members.map((member) => member.trim()).filter(Boolean)));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
