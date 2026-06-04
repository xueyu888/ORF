import type {
  ContributionAllocation,
  LootResultClaimStatus,
  Objective,
  ObjectiveAcceptedResult,
  ObjectiveLoot,
  Result,
  ResultAcceptedResult,
  UncertaintyLevel,
} from "../../types/orf";
import {
  validateContributionAllocationInput,
  type ContributionMemberTarget,
} from "../../features/challenge/model/contributionReview";

export const uncertaintyLevelOptions: UncertaintyLevel[] = [
  "入门",
  "进阶",
  "破局",
  "渡劫",
  "飞升",
];

export const uncertaintyScores: Record<UncertaintyLevel, number> = {
  入门: 10,
  进阶: 30,
  破局: 90,
  渡劫: 270,
  飞升: 810,
};

export type SettlementResult = Pick<
  Result,
  "id" | "uncertaintyLevel" | "uncertaintyScore"
>;
export type SettlementObjective = Pick<
  Objective,
  "challengers" | "challengerUserIds" | "finalDueAt" | "title"
>;
export type SettlementLoot = Pick<
  ObjectiveLoot,
  "resultClaims" | "submittedAt"
>;
type ResultPointsTarget = {
  uncertaintyLevel?: UncertaintyLevel | null;
  uncertaintyScore: number;
};
export type SettlementPlan = {
  acceptedResultByResultId: Map<string, ResultAcceptedResult>;
  objectiveAcceptedResult: ObjectiveAcceptedResult;
  basePoints: number;
  completionMultiplier: number;
  settlementPoints: number;
  contributionRatios: ContributionAllocation[];
};

export function uncertaintyScoreFor(
  level: UncertaintyLevel | null | undefined,
) {
  return level ? uncertaintyScores[level] : 0;
}

export function isResultPointsCalibrated(
  result: ResultPointsTarget | null | undefined,
) {
  return Boolean(
    result?.uncertaintyLevel &&
    Number.isFinite(result.uncertaintyScore) &&
    result.uncertaintyScore > 0,
  );
}

export function calibratedResultPoints(
  result: ResultPointsTarget | null | undefined,
) {
  return isResultPointsCalibrated(result) ? result!.uncertaintyScore : 0;
}

export function objectiveBasePointsForResults(
  results: readonly ResultPointsTarget[],
) {
  return results.reduce(
    (sum, result) => sum + calibratedResultPoints(result),
    0,
  );
}

export function hasUncalibratedResultPoints(
  results: readonly ResultPointsTarget[],
) {
  return (
    results.length === 0 ||
    results.some((result) => !isResultPointsCalibrated(result))
  );
}

export function completionMultiplierFor(
  result: ObjectiveAcceptedResult,
  lootSubmittedAt: string | null,
  finalDueAt: string,
) {
  if (result === "abandoned") return 0;
  if (result === "overdelivered") return 1.5;
  if (result === "overturned") return 1;
  if (result !== "completed" && result !== "falsified") return 0;
  if (!lootSubmittedAt || !finalDueAt) return 0;
  return lootSubmittedAt.slice(0, 10) <= finalDueAt ? 1 : 0.5;
}

export function normalizeContributionRatios(
  input: ContributionAllocation[],
  challengers: Array<string | ContributionMemberTarget>,
) {
  const result = validateContributionAllocationInput(input, challengers);
  return result.status === "ok" ? result.allocations : null;
}

export function objectiveAcceptedResultFromReviews(
  reviews: ResultAcceptedResult[],
): ObjectiveAcceptedResult {
  if (reviews.length === 0) return "abandoned";
  if (reviews.every((review) => review === "completed")) return "completed";
  if (reviews.every((review) => review === "falsified")) return "falsified";
  return "abandoned";
}

export function acceptedResultForClaim(
  claim: LootResultClaimStatus | undefined,
): ResultAcceptedResult {
  if (claim === "completed" || claim === "falsified") return claim;
  return "failed";
}

export function planObjectiveSettlement(input: {
  objective: SettlementObjective;
  results: SettlementResult[];
  loot: SettlementLoot;
  resultReviews?: Array<{
    resultId: string;
    acceptedResult: ResultAcceptedResult;
  }>;
  acceptedResult?: ObjectiveAcceptedResult;
  contributionResolution?: { ratios: ContributionAllocation[] };
  contributionRatios?: ContributionAllocation[];
}): SettlementPlan | null {
  const resultIds = new Set(input.results.map((result) => result.id));
  const claimByResult = new Map(
    input.loot.resultClaims.map((claim) => [claim.resultId, claim]),
  );
  const reviewByResult = new Map(
    (input.resultReviews ?? [])
      .filter((review) => resultIds.has(review.resultId))
      .map((review) => [review.resultId, review.acceptedResult]),
  );
  const acceptedResultByResultId = new Map<string, ResultAcceptedResult>();

  for (const result of input.results) {
    acceptedResultByResultId.set(
      result.id,
      reviewByResult.get(result.id) ??
        acceptedResultForClaim(claimByResult.get(result.id)?.claim),
    );
  }

  const acceptedResults = input.results.map(
    (result) => acceptedResultByResultId.get(result.id) ?? "failed",
  );
  const objectiveAcceptedResult =
    input.acceptedResult ?? objectiveAcceptedResultFromReviews(acceptedResults);
  const basePoints = objectiveBasePointsForResults(input.results);
  const completionMultiplier = completionMultiplierFor(
    objectiveAcceptedResult,
    input.loot.submittedAt,
    input.objective.finalDueAt,
  );
  const settlementPoints = Number(
    (basePoints * completionMultiplier).toFixed(2),
  );
  const challengerTargets = input.objective.challengers
    .map((member, index) => ({
      member: member.trim(),
      memberUserId: input.objective.challengerUserIds[index]?.trim() || null,
    }))
    .filter((member) => member.member);
  const resolutionRatios =
    input.contributionResolution?.ratios ?? input.contributionRatios;
  const contributionRatios = resolutionRatios
    ? normalizeContributionRatios(resolutionRatios, challengerTargets)
    : challengerTargets.length === 1
      ? [
          {
            member: challengerTargets[0]!.member,
            memberUserId: challengerTargets[0]!.memberUserId,
            ratio: 1,
          },
        ]
      : null;

  if (!contributionRatios || contributionRatios.length === 0) {
    return null;
  }

  return {
    acceptedResultByResultId,
    objectiveAcceptedResult,
    basePoints,
    completionMultiplier,
    settlementPoints,
    contributionRatios,
  };
}
