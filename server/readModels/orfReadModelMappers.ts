import { asc, eq } from "drizzle-orm";
import { objectiveParticipantSnapshot } from "../../src/domain/orfObjectiveParticipants";
import { objectiveStageForFlowStatus } from "../../src/domain/orfLifecycle";
import { objectiveBasePointsForResults, uncertaintyScoreFor } from "../../src/domain/orfSettlement";
import { userDisplayProfileFromUser } from "../../src/domain/userDisplayProfile";
import type { Objective, ObjectiveAcceptanceReview, ObjectiveParticipantProfile, ObjectiveSettlementEvent, OrfUserDisplayProfile, PointLedgerEntry, Result, Task } from "../../src/types/orf";
import { addCalendarDays } from "../../src/utils/date";
import { db } from "../db/client";
import { objectiveAcceptanceReviews, objectiveSettlementEvents, objectives, pointLedger, results, resultTrendPoints, teamMembers, users } from "../db/schema";
import { avatarUrlForUser } from "../users/avatar/avatarRepository";

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
        .select({
          avatarObjectKey: users.avatarObjectKey,
          avatarUpdatedAt: users.avatarUpdatedAt,
          id: users.id,
          name: users.name,
        })
        .from(teamMembers)
        .innerJoin(users, eq(teamMembers.userId, users.id))
        .where(eq(teamMembers.teamId, storageScopeId))
        .orderBy(asc(users.name))
    : await db
        .select({
          avatarObjectKey: users.avatarObjectKey,
          avatarUpdatedAt: users.avatarUpdatedAt,
          id: users.id,
          name: users.name,
        })
        .from(users)
        .orderBy(asc(users.name));
  return {
    userNameById: new Map(rows.map((member) => [member.id, member.name])),
    userProfiles: rows
      .map((member) => userDisplayProfileFromUser({
        avatarUrl: avatarUrlForUser(member),
        id: member.id,
        name: member.name,
      }))
      .filter((profile): profile is OrfUserDisplayProfile => Boolean(profile)),
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
    definerUserId: result.definerUserId,
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
  userNameById: Map<string, string>;
}) {
  return input.objectiveRows.map((objective): Objective => {
    const objectiveResults = input.resultsByObjective.get(objective.id) ?? [];
    const participants = objectiveParticipantSnapshot({
      challengerUserIds: objective.challengerUserIds,
      assignedChallengerUserIds: objective.assignedChallengerUserIds,
      userNameById: input.userNameById,
    });
    const challengeApplications = (objective.challengeApplications ?? []).map((application) => ({
      ...application,
      applicant: nameForUserId(input.userNameById, application.applicantUserId, "未知成员"),
      applicantUserId: application.applicantUserId,
    }));
    const profileFor = (name: string, userId?: string | null): ObjectiveParticipantProfile => {
      const resolvedUserId = userId ?? "";
      return {
        name,
        userId: resolvedUserId,
        avatarUrl: input.userAvatarUrlById?.get(resolvedUserId) ?? null,
      };
    };

    return {
      id: objective.id,
      title: objective.title,
      description: objective.description,
      whyItMatters: objective.whyItMatters,
      projectId: objective.projectId,
      cycle: objective.cycle,
      stage: objectiveStageForFlowStatus(objective.flowStatus),
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
      settlementEventId: item.settlementEventId,
      userId: item.userId,
      memberName: nameForUserId(input.userNameById, item.userId, item.memberName),
      points: item.points,
      reason: item.reason,
      settlementPeriodAt: item.settlementPeriodAt,
      createdAt: item.createdAt,
    }));
}

export function mapObjectiveAcceptanceReviewRows(
  reviewRows: Array<typeof objectiveAcceptanceReviews.$inferSelect>,
): ObjectiveAcceptanceReview[] {
  return [...reviewRows]
    .sort((left, right) => right.reviewedAt.localeCompare(left.reviewedAt))
    .map((item) => ({
      id: item.id,
      objectiveId: item.objectiveId,
      lootId: item.lootId,
      reviewerUserId: item.reviewerUserId,
      acceptedResult: item.acceptedResult,
      resultReviews: item.resultReviews,
      reason: item.reason,
      reviewedAt: item.reviewedAt,
    }));
}

export function mapObjectiveSettlementEventRows(
  eventRows: Array<typeof objectiveSettlementEvents.$inferSelect>,
): ObjectiveSettlementEvent[] {
  return [...eventRows]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map((item) => ({
      id: item.id,
      objectiveId: item.objectiveId,
      kind: item.kind,
      lootId: item.lootId,
      basePoints: item.basePoints,
      multiplier: item.multiplier,
      settlementPoints: item.settlementPoints,
      reason: item.reason,
      createdByUserId: item.createdByUserId,
      createdAt: item.createdAt,
    }));
}
