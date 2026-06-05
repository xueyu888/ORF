import { desc, eq, inArray } from "drizzle-orm";
import type { BountyHallData, BountyHallItem, TaskManagementData } from "../../src/domain/orfReadModel";
import { objectiveChallengeEntryClosed } from "../../src/domain/orfChallengeEntry";
import {
  canAcceptObjectiveChallengeByFlow,
  canApplyForObjectiveChallenge,
  isObjectiveChallengeDiscoverableByFlow,
} from "../../src/domain/orfLifecycle";
import {
  isObjectiveAssignedChallenger,
  isObjectiveChallenger,
  uniqueParticipantNames,
} from "../../src/domain/orfObjectiveParticipants";
import { objectiveBasePointsForResults } from "../../src/domain/orfSettlement";
import type { Objective, PointLedgerEntry, Result, UncertaintyLevel, UserRole } from "../../src/types/orf";
import { db } from "../db/client";
import {
  evidence,
  objectives,
  pointLedger,
  results,
  resultTrendPoints,
  tasks,
} from "../db/schema";
import { runtimeScopeStorageId } from "../repositories/runtimeScope";
import { getTaskManagementData, type TaskManagementDataScope } from "./orfTaskManagementReadModel";
import {
  getUserMapsForStorageScope,
  groupEvidenceIdsByResult,
  groupResultTrends,
  groupResultsByObjective,
  groupTaskIdsByObjective,
  mapObjectiveRows,
  mapPointLedgerRows,
  mapResultRows,
} from "./orfReadModelMappers";

const difficultyRanks: Record<UncertaintyLevel, number> = {
  入门: 1,
  进阶: 2,
  破局: 3,
  渡劫: 4,
  飞升: 5,
};

function resultDifficultyRank(result: Result) {
  return result.uncertaintyLevel ? difficultyRanks[result.uncertaintyLevel] : 0;
}

function bountySortTitle(item: BountyHallItem) {
  return item.result?.title ?? item.objective.title;
}

function compareBountyItems(left: BountyHallItem, right: BountyHallItem) {
  if (left.isRecruitment !== right.isRecruitment) return left.isRecruitment ? -1 : 1;
  const leftDeadline = left.deadline || "9999-12-31";
  const rightDeadline = right.deadline || "9999-12-31";
  return leftDeadline.localeCompare(rightDeadline) || right.uncertaintyPoints - left.uncertaintyPoints || bountySortTitle(left).localeCompare(bountySortTitle(right));
}

function objectiveVisibleInBountyHall(objective: Objective) {
  return isObjectiveChallengeDiscoverableByFlow(objective) && !objectiveChallengeEntryClosed(objective);
}

function objectiveAvailableForBountyApplication(objective: Objective) {
  return canApplyForObjectiveChallenge(objective) && !objectiveChallengeEntryClosed(objective);
}

function scopedStorageId(scope: TaskManagementDataScope = {}) {
  return scope.scope ? runtimeScopeStorageId(scope.scope).trim() : "";
}

async function getBountyHallSourceRows(scope: TaskManagementDataScope = {}) {
  const storageScopeId = scopedStorageId(scope);
  const objectiveRows = storageScopeId
    ? await db.select().from(objectives).where(eq(objectives.teamId, storageScopeId)).orderBy(desc(objectives.createdAt), desc(objectives.id))
    : await db.select().from(objectives).orderBy(desc(objectives.createdAt), desc(objectives.id));
  const resultRows = storageScopeId ? await db.select().from(results).where(eq(results.teamId, storageScopeId)) : await db.select().from(results);
  const pointLedgerRows = storageScopeId ? await db.select().from(pointLedger).where(eq(pointLedger.teamId, storageScopeId)) : await db.select().from(pointLedger);
  const taskRows = storageScopeId
    ? await db
        .select({ id: tasks.id, linkedObjectiveId: tasks.linkedObjectiveId, sortOrder: tasks.sortOrder })
        .from(tasks)
        .where(eq(tasks.teamId, storageScopeId))
    : await db.select({ id: tasks.id, linkedObjectiveId: tasks.linkedObjectiveId, sortOrder: tasks.sortOrder }).from(tasks);
  const resultIds = resultRows.map((result) => result.id);
  const trendRows = resultIds.length > 0 ? await db.select().from(resultTrendPoints).where(inArray(resultTrendPoints.resultId, resultIds)) : [];
  const evidenceRows =
    resultIds.length > 0
      ? await db.select({ id: evidence.id, linkedResultId: evidence.linkedResultId }).from(evidence).where(inArray(evidence.linkedResultId, resultIds))
      : [];

  return {
    evidenceRows,
    objectiveRows,
    pointLedgerRows,
    resultRows,
    storageScopeId,
    taskRows,
    trendRows,
  };
}

function bountyHallItemFromObjective(input: {
  canUseChallengeActions: boolean;
  objective: Objective;
  results: Result[];
  viewerId: string;
}) {
  const result = input.results[0];
  const applications = input.objective.challengeApplications ?? [];
  const pendingApplications = applications.filter((application) => application.status === "pending");
  const approvedApplicants = applications.filter((application) => application.status === "approved").map((application) => application.applicant);
  const challengers = uniqueParticipantNames(input.objective.challengers ?? []);

  return {
    applications,
    approvedApplicants,
    challengers,
    uncertaintyPoints: objectiveBasePointsForResults(input.results),
    deadline: input.objective.finalDueAt,
    definer: result?.definer ?? "",
    difficultyRank: input.results.length > 0 ? Math.max(...input.results.map(resultDifficultyRank)) : 0,
    hasCurrentApplication: input.canUseChallengeActions && pendingApplications.some((application) => application.applicantUserId === input.viewerId),
    isCurrentChallenger: input.canUseChallengeActions && isObjectiveChallenger(input.objective, input.viewerId),
    isRecruitment: input.canUseChallengeActions && isObjectiveAssignedChallenger(input.objective, input.viewerId) && canAcceptObjectiveChallengeByFlow(input.objective),
    objective: input.objective,
    pendingApplications,
    result: result ?? null,
    results: input.results,
    source: result?.source ?? "managerDefined",
  } satisfies BountyHallItem;
}

function bountyContributionSummary(input: {
  memberUserId: string;
  objectives: Objective[];
  pointLedger: PointLedgerEntry[];
}) {
  const ledgerPoints = input.pointLedger
    .filter((entry) => entry.userId === input.memberUserId)
    .reduce((sum, entry) => sum + entry.points, 0);
  if (ledgerPoints > 0) {
    return { points: ledgerPoints };
  }

  return {
    points: input.objectives.reduce((sum, objective) => {
      if (!isObjectiveChallenger(objective, input.memberUserId)) return sum;
      return sum + (objective.objectiveSettlementPoints ?? 0);
    }, 0),
  };
}

export async function getBountyHallData(viewer: { id: string; name: string; role: UserRole }, scope: TaskManagementDataScope = {}): Promise<BountyHallData> {
  const rows = await getBountyHallSourceRows(scope);
  const { userIdByName, userNameById } = await getUserMapsForStorageScope(rows.storageScopeId);
  const resultItems = mapResultRows({
    evidenceIdsByResult: groupEvidenceIdsByResult(rows.evidenceRows),
    resultRows: rows.resultRows,
    trendByResult: groupResultTrends(rows.trendRows),
    userNameById,
  });
  const resultsByObjective = groupResultsByObjective(resultItems);
  const taskIdsByObjective = groupTaskIdsByObjective([...rows.taskRows].sort((left, right) => left.sortOrder - right.sortOrder));
  const objectiveItems = mapObjectiveRows({
    objectiveRows: rows.objectiveRows,
    resultsByObjective,
    taskIdsByObjective,
    userIdByName,
    userNameById,
  });
  const pointLedgerItems = mapPointLedgerRows({ pointLedgerRows: rows.pointLedgerRows, userNameById });
  const canUseChallengeActions = viewer.role === "member";
  const items = objectiveItems.flatMap((objective) => {
    const objectiveResults = resultsByObjective.get(objective.id) ?? [];
    const item = bountyHallItemFromObjective({
      canUseChallengeActions,
      objective,
      results: objectiveResults,
      viewerId: viewer.id,
    });
    if (!objectiveVisibleInBountyHall(objective) && !item.isRecruitment) return [];
    return [item];
  }).sort(compareBountyItems);

  const availableItems = items.filter((item) => !item.isRecruitment && objectiveAvailableForBountyApplication(item.objective));
  const objectiveOptionIds = new Set(items.map((item) => item.objective.id));

  return {
    publicItems: items,
    recruitmentItems: items.filter((item) => item.isRecruitment),
    availableItems,
    objectiveOptions: objectiveItems.filter((objective) => objectiveOptionIds.has(objective.id)),
    contribution: bountyContributionSummary({ memberUserId: viewer.id, objectives: objectiveItems, pointLedger: pointLedgerItems }),
  };
}

function filterComments(data: TaskManagementData, ids: {
  feedbackIssueIds: Set<string>;
  objectiveIds: Set<string>;
  resultIds: Set<string>;
  taskIds: Set<string>;
  checklistItemIds: Set<string>;
}) {
  return data.comments.filter((thread) => {
    if (thread.targetType === "objective") return ids.objectiveIds.has(thread.targetId);
    if (thread.targetType === "result") return ids.resultIds.has(thread.targetId);
    if (thread.targetType === "task") return ids.taskIds.has(thread.targetId);
    if (thread.targetType === "subtask") return ids.checklistItemIds.has(thread.targetId);
    if (thread.targetType === "feedback") return ids.feedbackIssueIds.has(thread.targetId);
    return false;
  });
}

export async function getMyChallengesData(memberUserId: string, includeAll = false, scope: TaskManagementDataScope = {}): Promise<TaskManagementData> {
  const data = await getTaskManagementData(scope);
  if (includeAll) return data;

  const objectivesForMember = data.objectives.filter((objective) => isObjectiveChallenger(objective, memberUserId));
  const objectiveIds = new Set(objectivesForMember.map((objective) => objective.id));
  const resultsForMember = data.results.filter((result) => objectiveIds.has(result.objectiveId));
  const resultIds = new Set(resultsForMember.map((result) => result.id));
  const tasksForMember = data.tasks.filter((task) => objectiveIds.has(task.linkedObjectiveId));
  const taskIds = new Set(tasksForMember.map((task) => task.id));
  const checklistItemIds = new Set(tasksForMember.flatMap((task) => task.checklist.map((item) => item.id)));
  const feedbackIssueIds = new Set(data.feedback.map((item) => item.id));

  return {
    projects: data.projects.filter((project) => objectivesForMember.some((objective) => objective.projectId === project.id)),
    objectives: objectivesForMember,
    results: resultsForMember,
    tasks: tasksForMember,
    evidence: data.evidence.filter((item) => resultIds.has(item.linkedResultId)),
    feedback: data.feedback,
    comments: filterComments(data, { feedbackIssueIds, objectiveIds, resultIds, taskIds, checklistItemIds }),
    objectiveLoot: data.objectiveLoot.filter((item) => objectiveIds.has(item.objectiveId)),
    objectiveTrialReviews: data.objectiveTrialReviews.filter((item) => objectiveIds.has(item.objectiveId)),
    objectiveAlignmentRequests: data.objectiveAlignmentRequests.filter((item) => objectiveIds.has(item.objectiveId)),
    pointLedger: data.pointLedger,
  };
}
