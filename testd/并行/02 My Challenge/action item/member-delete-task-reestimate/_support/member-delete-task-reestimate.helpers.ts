import { eq } from "drizzle-orm";
import { objectives } from "../../../../../../server/db/schema";
import { db } from "../../../../../_operators/testd-db-client";
import { readTestUserIdByNameInTeam, requiredTestUserIdByNameInTeam } from "../../../../../_operators/common.helpers";
import type { MemberDeleteTaskTarget } from "./member-delete-task-reestimate.context";

export async function prepareTaskDeleteReestimateTarget(target: MemberDeleteTaskTarget, memberName: string) {
  const objective = await readObjective(target.objective.id);
  if (!objective) {
    throw new Error("重估中删除行动项用例目标不存在");
  }
  const memberUserId = await requiredTestUserIdByNameInTeam({ teamId: objective.teamId, name: memberName });

  await db
    .update(objectives)
    .set({
      stage: "orfReestimate",
      flowStatus: "reestimating",
      challengers: uniqueMembers([...objective.challengers, memberName]),
      challengerUserIds: uniqueMembers([...objective.challengerUserIds, memberUserId]),
      updatedAt: todayIsoDate(),
    })
    .where(eq(objectives.id, target.objective.id));
}

export async function targetCanDeleteReestimateTask(target: MemberDeleteTaskTarget, actor: { name: string; role: string }) {
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
