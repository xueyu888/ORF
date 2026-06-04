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
import type { Objective, Result, UncertaintyLevel, UserRole } from "../../src/types/orf";
import { getTaskManagementData, type TaskManagementDataScope } from "./orfTaskManagementReadModel";

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

function contributionSummaryFor(data: TaskManagementData, memberUserId: string) {
  const ledgerPoints = data.pointLedger
    .filter((entry) => entry.userId === memberUserId)
    .reduce((sum, entry) => sum + entry.points, 0);
  if (ledgerPoints > 0) {
    return { points: ledgerPoints };
  }

  return {
    points: data.objectives.reduce((sum, objective) => {
      if (!isObjectiveChallenger(objective, memberUserId)) return sum;
      return sum + (objective.objectiveSettlementPoints ?? 0);
    }, 0),
  };
}

export async function getBountyHallData(viewer: { id: string; name: string; role: UserRole }, scope: TaskManagementDataScope = {}): Promise<BountyHallData> {
  const data = await getTaskManagementData(scope);
  const canUseChallengeActions = viewer.role === "member";
  const items = data.objectives.flatMap((objective) => {
    const objectiveResults = data.results.filter((result) => result.objectiveId === objective.id);
    const result = objectiveResults[0];
    const isRecruitment = canUseChallengeActions && isObjectiveAssignedChallenger(objective, viewer.id) && canAcceptObjectiveChallengeByFlow(objective);
    if (!objectiveVisibleInBountyHall(objective) && !isRecruitment) return [];

    const applications = objective.challengeApplications ?? [];
    const pendingApplications = applications.filter((application) => application.status === "pending");
    const approvedApplicants = applications.filter((application) => application.status === "approved").map((application) => application.applicant);
    const challengers = uniqueParticipantNames(objective.challengers ?? []);
    return [{
      applications,
      approvedApplicants,
      challengers,
      uncertaintyPoints: objectiveBasePointsForResults(objectiveResults),
      deadline: objective.finalDueAt,
      definer: result?.definer ?? "",
      difficultyRank: objectiveResults.length > 0 ? Math.max(...objectiveResults.map(resultDifficultyRank)) : 0,
      hasCurrentApplication: canUseChallengeActions && pendingApplications.some((application) => application.applicantUserId === viewer.id),
      isCurrentChallenger: canUseChallengeActions && isObjectiveChallenger(objective, viewer.id),
      isRecruitment,
      objective,
      pendingApplications,
      result: result ?? null,
      results: objectiveResults,
      source: result?.source ?? "managerDefined",
    }];
  }).sort(compareBountyItems);

  const availableItems = items.filter((item) => !item.isRecruitment && objectiveAvailableForBountyApplication(item.objective));
  const objectiveOptionIds = new Set(items.map((item) => item.objective.id));

  return {
    publicItems: items,
    recruitmentItems: items.filter((item) => item.isRecruitment),
    availableItems,
    objectiveOptions: data.objectives.filter((objective) => objectiveOptionIds.has(objective.id)),
    contribution: contributionSummaryFor(data, viewer.id),
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
    permissionRules: data.permissionRules,
  };
}
