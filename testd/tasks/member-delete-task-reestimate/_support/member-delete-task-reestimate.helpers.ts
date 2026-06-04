import { eq } from "drizzle-orm";
import { db } from "../../../../server/db/client";
import { objectives } from "../../../../server/db/schema";
import type { MemberDeleteTaskTarget } from "./member-delete-task-reestimate.context";

export async function prepareTaskDeleteReestimateTarget(target: MemberDeleteTaskTarget, memberName: string) {
  const objective = await readObjective(target.objective.id);
  if (!objective) {
    throw new Error("重估中删除行动项用例目标不存在");
  }

  await db
    .update(objectives)
    .set({
      stage: "orfReestimate",
      flowStatus: "reestimating",
      challengers: uniqueMembers([...objective.challengers, memberName]),
      updatedAt: todayIsoDate(),
    })
    .where(eq(objectives.id, target.objective.id));
}

export async function targetCanDeleteReestimateTask(target: MemberDeleteTaskTarget, actor: { name: string; role: string }) {
  const objective = await readObjective(target.objective.id);
  return !!objective && objective.flowStatus === "reestimating" && (actor.role === "admin" || objective.challengers.includes(actor.name));
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

function uniqueMembers(members: string[]) {
  return Array.from(new Set(members.map((member) => member.trim()).filter(Boolean)));
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}
