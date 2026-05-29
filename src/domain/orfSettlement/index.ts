import type {
  ContributionAllocation,
  LootResultClaimStatus,
  Objective,
  ObjectiveAcceptedResult,
  ObjectiveContributionReview,
  ObjectiveLoot,
  Result,
  ResultAcceptedResult,
  UncertaintyLevel,
} from "../../types/orf";
import { summarizeContributionReviews } from "../../features/challenge/model/contributionReview";

const uncertaintyScores: Record<UncertaintyLevel, number> = {
  入门: 10,
  进阶: 30,
  破局: 90,
  渡劫: 270,
  飞升: 810,
};

export type SettlementResult = Pick<Result, "id" | "uncertaintyLevel" | "uncertaintyScore">;
export type SettlementObjective = Pick<Objective, "challengers" | "finalDueAt" | "title">;
export type SettlementLoot = Pick<ObjectiveLoot, "resultClaims" | "submittedAt">;
export type SettlementPlan = {
  acceptedResultByResultId: Map<string, ResultAcceptedResult>;
  objectiveAcceptedResult: ObjectiveAcceptedResult;
  basePoints: number;
  completionMultiplier: number;
  settlementPoints: number;
  contributionRatios: ContributionAllocation[];
};

export function uncertaintyScoreFor(level: UncertaintyLevel | null | undefined) {
  return level ? uncertaintyScores[level] : uncertaintyScores["进阶"];
}

export function completionMultiplierFor(result: ObjectiveAcceptedResult, lootSubmittedAt: string | null, finalDueAt: string) {
  if (result === "abandoned") return 0;
  if (result === "overdelivered") return 1.5;
  if (result === "overturned") return 1;
  if (result !== "completed" && result !== "falsified") return 0;
  if (!lootSubmittedAt || !finalDueAt) return 0;
  return lootSubmittedAt.slice(0, 10) <= finalDueAt ? 1 : 0.5;
}

export function normalizeContributionRatios(input: Array<{ member: string; ratio: number }>, challengers: string[]) {
  const challengerSet = new Set(challengers);
  const ratioByMember = new Map<string, number>();
  for (const item of input) {
    const member = item.member.trim();
    const ratio = Number(item.ratio);
    if (!challengerSet.has(member) || !Number.isFinite(ratio) || ratio < 0) continue;
    ratioByMember.set(member, (ratioByMember.get(member) ?? 0) + ratio);
  }

  const ratios = challengers
    .filter((member) => ratioByMember.has(member))
    .map((member) => ({ member, ratio: ratioByMember.get(member) ?? 0 }));
  const total = ratios.reduce((sum, item) => sum + item.ratio, 0);
  if (ratios.length === 0 || total <= 0) return null;
  return ratios.map((item) => ({ member: item.member, ratio: item.ratio / total }));
}

export function objectiveAcceptedResultFromReviews(reviews: ResultAcceptedResult[]): ObjectiveAcceptedResult {
  if (reviews.length === 0) return "abandoned";
  if (reviews.every((review) => review === "completed")) return "completed";
  if (reviews.every((review) => review === "falsified")) return "falsified";
  return "abandoned";
}

export function acceptedResultForClaim(claim: LootResultClaimStatus | undefined): ResultAcceptedResult {
  if (claim === "completed" || claim === "falsified") return claim;
  return "failed";
}

export function planObjectiveSettlement(input: {
  objective: SettlementObjective;
  results: SettlementResult[];
  loot: SettlementLoot;
  resultReviews?: Array<{ resultId: string; acceptedResult: ResultAcceptedResult }>;
  acceptedResult?: ObjectiveAcceptedResult;
  contributionReviews: ObjectiveContributionReview[];
  contributionResolution?: { ratios: ContributionAllocation[] };
  contributionRatios?: Array<{ member: string; ratio: number }>;
}): SettlementPlan | null {
  const resultIds = new Set(input.results.map((result) => result.id));
  const claimByResult = new Map(input.loot.resultClaims.map((claim) => [claim.resultId, claim]));
  const reviewByResult = new Map(
    (input.resultReviews ?? [])
      .filter((review) => resultIds.has(review.resultId))
      .map((review) => [review.resultId, review.acceptedResult]),
  );
  const acceptedResultByResultId = new Map<string, ResultAcceptedResult>();

  for (const result of input.results) {
    acceptedResultByResultId.set(result.id, reviewByResult.get(result.id) ?? acceptedResultForClaim(claimByResult.get(result.id)?.claim));
  }

  const acceptedResults = input.results.map((result) => acceptedResultByResultId.get(result.id) ?? "failed");
  const objectiveAcceptedResult = input.acceptedResult ?? objectiveAcceptedResultFromReviews(acceptedResults);
  const basePoints = input.results.reduce((sum, result) => sum + (result.uncertaintyScore ?? uncertaintyScoreFor(result.uncertaintyLevel)), 0);
  const completionMultiplier = completionMultiplierFor(objectiveAcceptedResult, input.loot.submittedAt, input.objective.finalDueAt);
  const settlementPoints = Number((basePoints * completionMultiplier).toFixed(2));
  const challengers = Array.from(new Set(input.objective.challengers.map((member) => member.trim()).filter(Boolean)));
  const contributionSummary = summarizeContributionReviews(challengers, input.contributionReviews);
  const resolutionRatios = input.contributionResolution?.ratios ?? input.contributionRatios ?? [];
  const contributionRatios =
    contributionSummary.status === "ready"
      ? contributionSummary.ratios
      : normalizeContributionRatios(resolutionRatios, challengers);

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
