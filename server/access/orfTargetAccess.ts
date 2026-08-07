import { and, eq } from "drizzle-orm";
import { findFeedbackTeamId } from "@orf/feedback-module/server";
import { isObjectiveReestimateWindowOpen } from "../../src/domain/orfLifecycle";
import { isObjectiveChallenger } from "../../src/domain/orfObjectiveParticipants";
import { objectiveWorkItemMutationAccess } from "../../src/domain/orfWorkItems";
import { db } from "../db/client";
import { objectives, results, taskChecklistItems, tasks } from "../db/schema";
import { runtimeScope, runtimeScopeStorageId, type RuntimeScope } from "../repositories/runtimeScope";

export type ObjectiveWorkItemTarget =
  | { type: "objective"; id: string }
  | { type: "result"; id: string }
  | { type: "task"; id: string }
  | { type: "subtask"; id: string; taskId?: string };

export type ObjectiveWorkItemActor = {
  id: string;
  role: "admin" | "member";
  scope?: RuntimeScope | null;
};

export type ObjectiveWorkItemMutationOutcome = "allowed" | "forbidden" | "notFound";

function storageScope(id: string | null | undefined): RuntimeScope | null {
  const storageId = id?.trim();
  return storageId ? runtimeScope(storageId) : null;
}

function subtaskTargetCondition(target: Extract<ObjectiveWorkItemTarget, { type: "subtask" }>) {
  return target.taskId
    ? and(eq(taskChecklistItems.id, target.id), eq(taskChecklistItems.taskId, target.taskId))
    : eq(taskChecklistItems.id, target.id);
}

export async function canEditResultDuringReestimate(resultId: string, userId: string): Promise<boolean> {
  const actorUserId = userId.trim();
  if (!actorUserId) return false;

  const [row] = await db
    .select({
      flowStatus: objectives.flowStatus,
      challengerUserIds: objectives.challengerUserIds,
      confirmationDueAt: objectives.confirmationDueAt,
    })
    .from(results)
    .innerJoin(objectives, eq(objectives.id, results.objectiveId))
    .where(eq(results.id, resultId))
    .limit(1);

  return Boolean(
    row &&
      isObjectiveReestimateWindowOpen(row) &&
      isObjectiveChallenger(row, actorUserId),
  );
}

export async function resolveObjectiveIdForWorkItem(target: ObjectiveWorkItemTarget): Promise<string | null> {
  if (target.type === "objective") {
    const [objective] = await db.select({ objectiveId: objectives.id }).from(objectives).where(eq(objectives.id, target.id)).limit(1);
    return objective?.objectiveId ?? null;
  }

  if (target.type === "result") {
    const [result] = await db.select({ objectiveId: results.objectiveId }).from(results).where(eq(results.id, target.id)).limit(1);
    return result?.objectiveId ?? null;
  }

  if (target.type === "task") {
    const [task] = await db.select({ objectiveId: tasks.linkedObjectiveId }).from(tasks).where(eq(tasks.id, target.id)).limit(1);
    return task?.objectiveId ?? null;
  }

  const [item] = await db
    .select({ objectiveId: tasks.linkedObjectiveId })
    .from(taskChecklistItems)
    .innerJoin(tasks, eq(tasks.id, taskChecklistItems.taskId))
    .where(subtaskTargetCondition(target))
    .limit(1);
  return item?.objectiveId ?? null;
}

export async function resolveRuntimeScopeForWorkItem(target: ObjectiveWorkItemTarget): Promise<RuntimeScope | null> {
  if (target.type === "objective") {
    const [objective] = await db.select({ teamId: objectives.teamId }).from(objectives).where(eq(objectives.id, target.id)).limit(1);
    return storageScope(objective?.teamId);
  }

  if (target.type === "result") {
    const [result] = await db.select({ teamId: results.teamId }).from(results).where(eq(results.id, target.id)).limit(1);
    return storageScope(result?.teamId);
  }

  if (target.type === "task") {
    const [task] = await db.select({ teamId: tasks.teamId }).from(tasks).where(eq(tasks.id, target.id)).limit(1);
    return storageScope(task?.teamId);
  }

  const [item] = await db
    .select({ teamId: tasks.teamId })
    .from(taskChecklistItems)
    .innerJoin(tasks, eq(tasks.id, taskChecklistItems.taskId))
    .where(subtaskTargetCondition(target))
    .limit(1);
  return storageScope(item?.teamId);
}

export async function resolveRuntimeScopeForFeedback(feedbackId: string): Promise<RuntimeScope | null> {
  return storageScope(await findFeedbackTeamId(db, feedbackId));
}

export async function canMutateObjectiveWorkItem(
  actor: ObjectiveWorkItemActor,
  objectiveId: string,
): Promise<ObjectiveWorkItemMutationOutcome> {
  const storageScopeId = actor.scope ? runtimeScopeStorageId(actor.scope) : "";
  const [objective] = await db
    .select({ challengerUserIds: objectives.challengerUserIds, flowStatus: objectives.flowStatus, teamId: objectives.teamId })
    .from(objectives)
    .where(eq(objectives.id, objectiveId))
    .limit(1);
  if (!objective) {
    return "notFound";
  }

  if (storageScopeId && objective.teamId !== storageScopeId) {
    return "notFound";
  }

  const access = objectiveWorkItemMutationAccess(objective, actor);
  return access.status === "allowed" ? "allowed" : "forbidden";
}
