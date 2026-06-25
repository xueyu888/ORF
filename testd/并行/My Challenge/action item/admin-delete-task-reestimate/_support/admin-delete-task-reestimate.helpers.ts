import { eq } from "drizzle-orm";
import { objectives } from "../../../../../../server/db/schema";
import { db } from "../../../../../_operators/testd-db-client";
import { readTestUserIdByNameInTeam, requiredTestUserIdByNameInTeam } from "../../../../../_operators/common.helpers";
import type { AdminDeleteTaskReestimateTarget } from "./admin-delete-task-reestimate.context";

export {
  challengeScopeTab,
  challengeStatusTrigger,
  createFixtureSubtask,
  createFixtureTask,
  deleteTestTask,
  fixtureRecorded,
  memberWorkbenchTaskMissing,
  objectivePanel,
  targetFlowStatus,
  targetHasChallenger,
  targetStage,
  targetSubtaskRow,
  targetTaskAbsent,
  targetTaskPresent,
  targetTaskRow,
  taskDeleteMenuItem,
  taskRowMenuButton,
  taskSubtaskAbsent,
  taskSubtaskPresent,
  taskTargetFromObjective,
  testTaskAbsent,
} from "../../member-delete-task/_support/member-delete-task.helpers";

export async function prepareAdminTaskDeleteReestimateTarget(target: AdminDeleteTaskReestimateTarget, adminName: string) {
  const objective = await readObjective(target.objective.id);
  if (!objective) {
    throw new Error("管理员重估中删除行动项用例目标不存在");
  }
  const adminUserId = await requiredTestUserIdByNameInTeam({ teamId: objective.teamId, name: adminName });

  await db
    .update(objectives)
    .set({
      stage: "orfReestimate",
      flowStatus: "reestimating",
      challengers: uniqueMembers([...objective.challengers, adminName]),
      challengerUserIds: uniqueMembers([...objective.challengerUserIds, adminUserId]),
      updatedAt: todayIsoDate(),
    })
    .where(eq(objectives.id, target.objective.id));
}

export async function targetCanDeleteReestimateTask(target: AdminDeleteTaskReestimateTarget, actor: { name: string; role: string }) {
  const objective = await readObjective(target.objective.id);
  if (!objective || objective.flowStatus !== "reestimating") {
    return false;
  }
  if (actor.role === "admin") {
    return true;
  }
  const actorUserId = await readTestUserIdByNameInTeam({ teamId: objective.teamId, name: actor.name });
  return !!actorUserId && objective.challengerUserIds.includes(actorUserId);
}

async function readObjective(objectiveId: string) {
  const [row] = await db
    .select({
      id: objectives.id,
      teamId: objectives.teamId,
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
