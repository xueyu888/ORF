import { eq } from "drizzle-orm";
import { objectiveParticipantSnapshot } from "../../src/domain/orfObjectiveParticipants";
import { objectiveBasePointsForResults, uncertaintyScoreFor } from "../../src/domain/orfSettlement";
import type { Objective, ObjectiveParticipantProfile, PointLedgerEntry, Result, Task } from "../../src/types/orf";
import { addCalendarDays } from "../../src/utils/date";
import { db } from "../db/client";
import { objectives, pointLedger, results, resultTrendPoints, teamMembers, users } from "../db/schema";

export function optional<T>(value: T | null): T | undefined {
  return value ?? undefined;
}

export function addDays(value: string, days: number) {
  return addCalendarDays(value, days, value);
}

export function nameForUserId(userNameById: Map<string, string>, userId: string | null | undefined, fallback = "") {
  return userId ? userNameById.get(userId) ?? fallback : fallback;
}

export async function getUserMapsForStorageScope(storageScopeId: string | null | undefined) {
  const rows = storageScopeId
    ? await db
        .select({ id: users.id, name: users.name })
        .from(teamMembers)
        .innerJoin(users, eq(teamMembers.userId, users.id))
        .where(eq(teamMembers.teamId, storageScopeId))
    : await db.select({ id: users.id, name: users.name }).from(users);
  return {
    userIdByName: new Map(rows.map((member) => [member.name, member.id])),
    userNameById: new Map(rows.map((member) => [member.id, member.name])),
  };
}

export function groupEvidenceIdsByResult(evidenceRows: Array<{ id: string; linkedResultId: string }>) {
  const evidenceIdsByResult = new Map<string, string[]>();
  for (const item of evidenceRows) {
    const ids = evidenceIdsByResult.get(item.linkedResultId) ?? [];
    ids.push(item.id);
    evidenceIdsByResult.set(item.linkedResultId, ids);
  }
  return evidenceIdsByResult;
}

export function groupResultTrends(trendRows: Array<typeof resultTrendPoints.$inferSelect>) {
  const trendByResult = new Map<string, Result["trend"]>();
  for (const point of [...trendRows].sort((left, right) => left.sortOrder - right.sortOrder)) {
    const list = trendByResult.get(point.resultId) ?? [];
    list.push({ date: point.date, value: point.value });
    trendByResult.set(point.resultId, list);
  }
  return trendByResult;
}

export function mapResultRows(input: {
  evidenceIdsByResult: Map<string, string[]>;
  resultRows: Array<typeof results.$inferSelect>;
  trendByResult: Map<string, Result["trend"]>;
  userNameById: Map<string, string>;
}) {
  return [...input.resultRows].sort((left, right) => left.sortOrder - right.sortOrder).map((result): Result => ({
    id: result.id,
    objectiveId: result.objectiveId,
    title: result.title,
    detail: result.detail,
    uncertaintyLevel: optional(result.uncertaintyLevel),
    baseline: result.baseline,
    current: result.current,
    target: result.target,
    unit: result.unit,
    direction: result.direction,
    status: result.status,
    confidence: result.confidence,
    source: result.source,
    definer: nameForUserId(input.userNameById, result.definerUserId, result.definer),
    definerUserId: optional(result.definerUserId),
    uncertaintyScore: result.uncertaintyScore ?? uncertaintyScoreFor(result.uncertaintyLevel),
    acceptedResult: result.acceptedResult ?? "unreviewed",
    evidenceIds: input.evidenceIdsByResult.get(result.id) ?? [],
    trend: input.trendByResult.get(result.id) ?? [],
    reviewCadence: result.reviewCadence,
    createdAt: result.createdAt,
    updatedAt: result.updatedAt,
  }));
}

export function groupResultsByObjective(resultItems: Result[]) {
  const resultsByObjective = new Map<string, Result[]>();
  for (const result of resultItems) {
    const items = resultsByObjective.get(result.objectiveId) ?? [];
    items.push(result);
    resultsByObjective.set(result.objectiveId, items);
  }
  return resultsByObjective;
}

export function groupTaskIdsByObjective(taskItems: Array<Pick<Task, "id" | "linkedObjectiveId">>) {
  const taskIdsByObjective = new Map<string, Task["id"][]>();
  for (const task of taskItems) {
    const ids = taskIdsByObjective.get(task.linkedObjectiveId) ?? [];
    ids.push(task.id);
    taskIdsByObjective.set(task.linkedObjectiveId, ids);
  }
  return taskIdsByObjective;
}

export function mapObjectiveRows(input: {
  objectiveRows: Array<typeof objectives.$inferSelect>;
  resultsByObjective: Map<string, Result[]>;
  taskIdsByObjective: Map<string, Task["id"][]>;
  userAvatarUrlById?: Map<string, string | null>;
  userIdByName: Map<string, string>;
  userNameById: Map<string, string>;
}) {
  return input.objectiveRows.map((objective): Objective => {
    const objectiveResults = input.resultsByObjective.get(objective.id) ?? [];
    const participants = objectiveParticipantSnapshot({
      challengerUserIds: objective.challengerUserIds,
      challengerNames: objective.challengers ?? [],
      assignedChallengerUserIds: objective.assignedChallengerUserIds,
      assignedChallengerNames: objective.assignedChallengers ?? [],
      userIdByName: input.userIdByName,
      userNameById: input.userNameById,
    });
    const challengeApplications = (objective.challengeApplications ?? []).map((application) => {
      const applicantUserId = application.applicantUserId ?? input.userIdByName.get(application.applicant) ?? null;
      return {
        ...application,
        applicant: nameForUserId(input.userNameById, applicantUserId, application.applicant),
        applicantUserId,
      };
    });
    const profileFor = (name: string, userId?: string | null): ObjectiveParticipantProfile => {
      const resolvedUserId = userId ?? input.userIdByName.get(name) ?? null;
      return {
        name,
        userId: resolvedUserId,
        avatarUrl: resolvedUserId ? input.userAvatarUrlById?.get(resolvedUserId) ?? null : null,
      };
    };

    return {
      id: objective.id,
      title: objective.title,
      description: objective.description,
      whyItMatters: objective.whyItMatters,
      projectId: objective.projectId,
      cycle: objective.cycle,
      stage: objective.stage,
      flowStatus: objective.flowStatus,
      status: objective.status,
      confidence: objective.confidence,
      progress: Math.max(0, Math.min(100, Math.round(objective.progress))),
      boundary: objective.boundary,
      successDefinition: objective.successDefinition,
      resultIds: objectiveResults.map((result) => result.id),
      taskIds: input.taskIdsByObjective.get(objective.id) ?? [],
      finalDueAt: objective.finalDueAt || addDays(objective.updatedAt, 14),
      challengers: participants.challengers,
      challengerUserIds: participants.challengerUserIds,
      challengerProfiles: participants.challengers.map((name, index) => profileFor(name, participants.challengerUserIds[index])),
      assignedChallengers: participants.assignedChallengers,
      assignedChallengerUserIds: participants.assignedChallengerUserIds,
      assignedChallengerProfiles: participants.assignedChallengers.map((name, index) => profileFor(name, participants.assignedChallengerUserIds[index])),
      challengeApplications,
      acceptedAt: objective.acceptedAt,
      confirmationDueAt: objective.confirmationDueAt,
      confirmedAt: objective.confirmedAt,
      lootSubmittedAt: objective.lootSubmittedAt,
      acceptedResult: objective.acceptedResult,
      completionMultiplier: objective.completionMultiplier,
      objectiveBasePoints: objectiveBasePointsForResults(objectiveResults),
      objectiveSettlementPoints: objective.objectiveSettlementPoints,
      publishedAt: objective.publishedAt,
      createdAt: objective.createdAt,
      updatedAt: objective.updatedAt,
    };
  });
}

export function mapPointLedgerRows(input: {
  pointLedgerRows: Array<typeof pointLedger.$inferSelect>;
  userNameById: Map<string, string>;
}) {
  return [...input.pointLedgerRows]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map((item): PointLedgerEntry => ({
      id: item.id,
      objectiveId: item.objectiveId,
      userId: item.userId,
      memberName: nameForUserId(input.userNameById, item.userId, item.memberName),
      points: item.points,
      reason: item.reason,
      createdAt: item.createdAt,
    }));
}
