import type { Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { objectives } from "../../../../../../server/db/schema";
import type { OrfStage } from "../../../../../../src/types/orf";
import { db } from "../../../../../_operators/testd-db-client";
import { readTestUserIdByNameInTeam, requiredTestUserIdByNameInTeam } from "../../../../../_operators/common.helpers";
import {
  challengeScopeTab,
  challengeStatusTrigger,
  createFixtureSubtask,
  createFixtureTask,
  deleteTestTask,
  fixtureRecorded,
  objectivePanel,
  targetTaskPresent,
  targetTaskRow,
  taskSubtaskPresent,
  taskTargetFromObjective,
  testTaskAbsent,
} from "../../member-delete-task/_support/member-delete-task.helpers";
import type {
  MemberDeleteTaskReestimateForbiddenFixture,
  MemberDeleteTaskReestimateForbiddenTarget,
} from "./member-delete-task-reestimate-forbidden.context";

export {
  challengeScopeTab,
  challengeStatusTrigger,
  createFixtureSubtask,
  createFixtureTask,
  deleteTestTask,
  fixtureRecorded,
  objectivePanel,
  targetTaskPresent,
  taskSubtaskPresent,
  taskTargetFromObjective,
  testTaskAbsent,
};

export async function prepareForbiddenReestimateDeleteTaskTarget(
  target: MemberDeleteTaskReestimateForbiddenTarget,
  input: { challengerName: string; forbiddenName: string },
) {
  const objective = await readObjective(target.objective.id);
  if (!objective) {
    throw new Error("重估中删除行动项反向用例目标不存在");
  }
  const challengerUserId = await requiredTestUserIdByNameInTeam({ teamId: objective.teamId, name: input.challengerName });
  const forbiddenUserId = await readTestUserIdByNameInTeam({ teamId: objective.teamId, name: input.forbiddenName });

  await db
    .update(objectives)
    .set({
      stage: "orfReestimate",
      flowStatus: "reestimating",
      challengers: uniqueMembers([input.challengerName, ...objective.challengers.filter((name) => name !== input.forbiddenName)]),
      challengerUserIds: uniqueMembers([
        challengerUserId,
        ...objective.challengerUserIds.filter((userId) => userId !== forbiddenUserId),
      ]),
      updatedAt: todayIsoDate(),
    })
    .where(eq(objectives.id, target.objective.id));
}

export async function targetFlowStatus(target: MemberDeleteTaskReestimateForbiddenTarget) {
  return (await readObjective(target.objective.id))?.flowStatus ?? null;
}

export async function targetStage(target: MemberDeleteTaskReestimateForbiddenTarget): Promise<OrfStage | null> {
  return (await readObjective(target.objective.id))?.stage ?? null;
}

export async function targetHasChallenger(target: MemberDeleteTaskReestimateForbiddenTarget, memberName: string) {
  const objective = await readObjective(target.objective.id);
  if (!objective) {
    return false;
  }
  const memberUserId = await readTestUserIdByNameInTeam({ teamId: objective.teamId, name: memberName });
  return !!memberUserId && objective.challengerUserIds.includes(memberUserId);
}

export async function targetCanDeleteTask(target: MemberDeleteTaskReestimateForbiddenTarget, actor: { name: string; role: string }) {
  const objective = await readObjective(target.objective.id);
  if (!objective || (objective.flowStatus !== "frozen" && objective.flowStatus !== "reestimating")) {
    return false;
  }
  if (actor.role === "admin") {
    return true;
  }
  const actorUserId = await readTestUserIdByNameInTeam({ teamId: objective.teamId, name: actor.name });
  return !!actorUserId && objective.challengerUserIds.includes(actorUserId);
}

export function taskDeleteMenuButton(
  page: Page,
  target: MemberDeleteTaskReestimateForbiddenTarget,
  task: Pick<MemberDeleteTaskReestimateForbiddenFixture, "title">,
) {
  return targetTaskRow(page, target, task).locator('button[aria-label*="打开块菜单"]').first();
}

export async function memberWorkbenchMissingObjective(page: Page, target: MemberDeleteTaskReestimateForbiddenTarget) {
  const response = await readMemberWorkbenchData(page);
  if (response.status !== 200) return false;

  const objectiveRows = responseRows(response.body, "objectives");
  return !objectiveRows.some((item) => {
    const objective = item as { id?: unknown; title?: unknown };
    return objective.id === target.objective.id || objective.title === target.objective.title;
  });
}

export async function memberWorkbenchMissingTask(page: Page, task: Pick<MemberDeleteTaskReestimateForbiddenFixture, "id" | "title">) {
  const response = await readMemberWorkbenchData(page);
  if (response.status !== 200) return false;

  const taskRows = responseRows(response.body, "tasks");
  return !taskRows.some((item) => {
    const taskRow = item as { id?: unknown; title?: unknown };
    return taskRow.id === task.id || taskRow.title === task.title;
  });
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

function responseRows(body: unknown, key: "objectives" | "tasks") {
  const value = typeof body === "object" && body !== null ? (body as Record<string, unknown>)[key] : undefined;
  return Array.isArray(value) ? value.filter((item) => typeof item === "object" && item !== null) : [];
}

async function readObjective(objectiveId: string) {
  const [row] = await db
    .select({
      id: objectives.id,
      teamId: objectives.teamId,
      stage: objectives.stage,
      flowStatus: objectives.flowStatus,
      challengers: objectives.challengers,
      challengerUserIds: objectives.challengerUserIds,
    })
    .from(objectives)
    .where(eq(objectives.id, objectiveId))
    .limit(1);

  return row ?? null;
}

function uniqueMembers(members: string[]) {
  return Array.from(new Set(members.map((member) => member.trim()).filter(Boolean)));
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}
