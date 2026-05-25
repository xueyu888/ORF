import type { Page } from "@playwright/test";
import { and, eq, sql } from "drizzle-orm";
import { closeDb, db } from "../../../../server/db/client";
import { objectives, taskChecklistItems, tasks, teamMembers, users } from "../../../../server/db/schema";
import type {
  MemberCreateTaskCaseData,
  MemberCreateTaskTarget,
  MemberCreatedSubtask,
  MemberCreatedTask,
} from "./member-create-task.context";

export async function closeMemberCreateTaskTestDb() {
  await closeDb();
}

export async function memberAccountActive(email: string) {
  const account = await readMemberAccount(email);
  return !!account && account.role === "member" && account.status === "active";
}

export async function taskTargetAvailable(data: Pick<MemberCreateTaskCaseData, "email">) {
  return (await selectTaskTarget(data)) !== null;
}

export async function selectTaskTarget(data: Pick<MemberCreateTaskCaseData, "email">): Promise<MemberCreateTaskTarget | null> {
  const member = await readMemberAccount(data.email);
  if (!member) {
    return null;
  }

  const objectiveRows = await db
    .select({
      id: objectives.id,
      title: objectives.title,
      stage: objectives.stage,
      flowStatus: objectives.flowStatus,
      status: objectives.status,
      challengers: objectives.challengers,
      assignedChallengers: objectives.assignedChallengers,
      challengeApplications: objectives.challengeApplications,
      lootSubmittedAt: objectives.lootSubmittedAt,
      acceptedResult: objectives.acceptedResult,
      objectiveSettlementPoints: objectives.objectiveSettlementPoints,
      updatedAt: objectives.updatedAt,
      updatedBy: objectives.updatedBy,
    })
    .from(objectives)
    .where(eq(objectives.teamId, member.teamId));

  const taskRows = await db.select({ objectiveId: tasks.linkedObjectiveId }).from(tasks);
  const taskCountByObjective = new Map<string, number>();
  for (const row of taskRows) {
    taskCountByObjective.set(row.objectiveId, (taskCountByObjective.get(row.objectiveId) ?? 0) + 1);
  }

  const titleCounts = new Map<string, number>();
  for (const row of objectiveRows) {
    titleCounts.set(row.title, (titleCounts.get(row.title) ?? 0) + 1);
  }

  const selected = objectiveRows.find((row) => {
    if (titleCounts.get(row.title) !== 1) return false;
    if ((taskCountByObjective.get(row.id) ?? 0) !== 0) return false;
    if (row.lootSubmittedAt || row.acceptedResult || row.objectiveSettlementPoints != null) return false;
    if (row.flowStatus === "submitted" || row.flowStatus === "settled" || row.flowStatus === "closed") return false;
    return true;
  });

  if (!selected) {
    return null;
  }

  return {
    objective: {
      id: selected.id,
      title: selected.title,
    },
    previous: {
      id: selected.id,
      title: selected.title,
      stage: selected.stage,
      flowStatus: selected.flowStatus,
      status: selected.status,
      challengers: selected.challengers,
      assignedChallengers: selected.assignedChallengers,
      challengeApplications: selected.challengeApplications,
      updatedAt: selected.updatedAt,
      updatedBy: selected.updatedBy,
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

export async function restoreTaskTarget(target: MemberCreateTaskTarget | null) {
  if (!target) {
    return;
  }

  await db
    .update(objectives)
    .set({
      stage: target.previous.stage,
      flowStatus: target.previous.flowStatus,
      status: target.previous.status,
      challengers: target.previous.challengers,
      assignedChallengers: target.previous.assignedChallengers,
      challengeApplications: target.previous.challengeApplications,
      updatedAt: target.previous.updatedAt,
      updatedBy: target.previous.updatedBy,
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

export async function recordCreatedSubtask(task: MemberCreatedTask, label: string): Promise<MemberCreatedSubtask> {
  const row = await readSubtask(task.id, label);
  if (!row) {
    throw new Error("未找到新建子行动项");
  }

  return row;
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

export function targetTaskButton(page: Page, target: MemberCreateTaskTarget) {
  return objectivePanel(page, target).getByRole("button", { name: "新增行动项" }).first();
}

export function targetTaskRow(page: Page, target: MemberCreateTaskTarget, task: Pick<MemberCreatedTask, "title">) {
  return objectivePanel(page, target).locator(".orf-challenge-row-action").filter({ hasText: task.title }).first();
}

export function targetSubtaskRow(page: Page, target: MemberCreateTaskTarget, task: Pick<MemberCreatedTask, "title">, subtask: Pick<MemberCreatedSubtask, "label">) {
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
      flowStatus: objectives.flowStatus,
      challengers: objectives.challengers,
    })
    .from(objectives)
    .where(eq(objectives.id, objectiveId))
    .limit(1);

  return row ?? null;
}

async function readMemberAccount(email: string): Promise<{
  userId: string;
  teamId: string;
  role: string;
  status: string;
} | null> {
  const [row] = await db
    .select({
      userId: users.id,
      teamId: teamMembers.teamId,
      role: teamMembers.role,
      status: users.status,
    })
    .from(users)
    .innerJoin(teamMembers, eq(teamMembers.userId, users.id))
    .where(sql`lower(${users.email}) = ${email.toLowerCase()}`)
    .limit(1);

  return row ?? null;
}

function uniqueMembers(members: string[]) {
  return Array.from(new Set(members.map((member) => member.trim()).filter(Boolean)));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
