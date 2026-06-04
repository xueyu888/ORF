import type { Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { db } from "../../../_operators/testd-db-client";
import { objectives, taskChecklistItems, tasks } from "../../../../server/db/schema";
import type { OrfStage } from "../../../../src/types/orf";
import { readTestUserIdByNameInTeam, requiredTestUserIdByNameInTeam } from "../../../_operators/common.helpers";
import {
  deleteTestTask,
  targetCanCreateTask,
  targetTaskAbsent,
  taskTargetFromObjective,
  testTaskAbsent,
} from "../../member-create-task/_support/member-create-task.helpers";
import type { MemberCreateTaskForbiddenTarget } from "./member-create-task-forbidden.context";

export { deleteTestTask, targetCanCreateTask, targetTaskAbsent, taskTargetFromObjective, testTaskAbsent };

export async function prepareForbiddenTaskTarget(
  target: MemberCreateTaskForbiddenTarget,
  input: { challengerName: string; forbiddenName: string },
) {
  const objective = await readObjective(target);
  if (!objective) {
    throw new Error("行动项反向用例目标不存在");
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
      updatedAt: today(),
    })
    .where(eq(objectives.id, target.objective.id));
}

export async function targetFlowStatus(target: MemberCreateTaskForbiddenTarget) {
  return (await readObjective(target))?.flowStatus ?? null;
}

export async function targetStage(target: MemberCreateTaskForbiddenTarget): Promise<OrfStage | null> {
  return (await readObjective(target))?.stage ?? null;
}

export async function targetHasChallenger(target: MemberCreateTaskForbiddenTarget, memberName: string) {
  const objective = await readObjective(target);
  if (!objective) {
    return false;
  }
  const memberUserId = await readTestUserIdByNameInTeam({ teamId: objective.teamId, name: memberName });
  return !!memberUserId && objective.challengerUserIds.includes(memberUserId);
}

export async function targetSubtaskAbsent(target: MemberCreateTaskForbiddenTarget, label: string) {
  const [row] = await db
    .select({ id: taskChecklistItems.id })
    .from(taskChecklistItems)
    .innerJoin(tasks, eq(tasks.id, taskChecklistItems.taskId))
    .where(and(eq(tasks.linkedObjectiveId, target.objective.id), eq(taskChecklistItems.label, label)))
    .limit(1);

  return !row;
}

export function targetPanel(page: Page, target: MemberCreateTaskForbiddenTarget) {
  return page.locator("section.orf-objective-panel").filter({ hasText: target.objective.title });
}

export async function memberWorkbenchMissingObjective(page: Page, target: MemberCreateTaskForbiddenTarget) {
  const response = await readMemberWorkbenchData(page);
  if (response.status !== 200) {
    return false;
  }

  const objectivesValue = typeof response.body === "object" && response.body !== null
    ? (response.body as { objectives?: unknown }).objectives
    : undefined;
  const rows = Array.isArray(objectivesValue) ? objectivesValue : [];
  return !rows.some((item) => {
    if (typeof item !== "object" || item === null) {
      return false;
    }
    const objective = item as { id?: unknown; title?: unknown };
    return objective.id === target.objective.id || objective.title === target.objective.title;
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

async function readObjective(target: MemberCreateTaskForbiddenTarget) {
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
    .where(eq(objectives.id, target.objective.id))
    .limit(1);

  return row ?? null;
}

function uniqueMembers(members: string[]) {
  return Array.from(new Set(members.map((member) => member.trim()).filter(Boolean)));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
