import type {
  ContributionAllocation,
  LootResultClaimStatus,
  Objective,
  ObjectiveAcceptedResult,
  ObjectiveFlowStatus,
  ObjectiveSettlementEvent,
  ObjectiveSettlementEventKind,
  ObjectiveLoot,
  Result,
  ResultAcceptedResult,
  UncertaintyLevel,
} from "../../types/orf";
import {
  validateContributionAllocationInput,
} from "../orfContributionAllocation";
import {
  objectiveChallengerTargets,
  type ContributionMemberTarget,
} from "../orfObjectiveParticipants";

export const uncertaintyLevelOptions: UncertaintyLevel[] = [
  "简易",
  "入门",
  "进阶",
  "破局",
  "渡劫",
  "飞升",
];

export const uncertaintyScores: Record<UncertaintyLevel, number> = {
  简易: 0,
  入门: 10,
  进阶: 30,
  破局: 90,
  渡劫: 270,
  飞升: 810,
};

export const OBJECTIVE_BASE_POINTS_MIN = 1;

export type SettlementResult = Pick<
  Result,
  "id"
>;
export type SettlementObjective = Pick<
  Objective,
  "challengers" | "challengerUserIds" | "finalDueAt" | "objectiveBasePoints" | "title"
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
export type ObjectiveAcceptancePlan = Omit<SettlementPlan, "contributionRatios">;
export type ObjectiveSettlementEventPlan = {
  kind: ObjectiveSettlementEventKind;
  basePoints: number;
  multiplier: number;
  settlementPoints: number;
};
export type ObjectiveSettlementReviewWindow = {
  kind: ObjectiveSettlementEventKind | null;
  open: boolean;
  reason:
    | "alreadySettled"
    | "deadlinePending"
    | "notSettlementState"
    | "open";
};
export type SettlementPointAllocation<T extends ContributionAllocation = ContributionAllocation> = T & {
  points: number;
  pointUnits: number;
};
type SettlementReviewObjective = Pick<Objective, "finalDueAt" | "flowStatus">;
type SettlementReviewEvent = Pick<ObjectiveSettlementEvent, "kind">;
type ObjectiveBasePointsTarget = Pick<Objective, "objectiveBasePoints">;
type ObjectiveBasePointsMutationTarget = Pick<Objective, "flowStatus">;

export function uncertaintyScoreFor(
  level: UncertaintyLevel | null | undefined,
) {
  return level ? uncertaintyScores[level] : 0;
}

export function isResultPointsCalibrated(
  result: ResultPointsTarget | null | undefined,
) {
  if (!result?.uncertaintyLevel) return false;
  return (
    Number.isFinite(result.uncertaintyScore) &&
    result.uncertaintyScore === uncertaintyScoreFor(result.uncertaintyLevel)
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

export function normalizedObjectiveBasePoints(
  objective: ObjectiveBasePointsTarget | null | undefined,
) {
  const points = Number(objective?.objectiveBasePoints ?? 0);
  if (!Number.isFinite(points)) return 0;
  return Math.max(0, Math.floor(points));
}

export function hasPositiveObjectiveBasePoints(
  objective: ObjectiveBasePointsTarget | null | undefined,
) {
  return normalizedObjectiveBasePoints(objective) >= OBJECTIVE_BASE_POINTS_MIN;
}

export function canEditObjectiveBasePointsByFlow(
  objective: ObjectiveBasePointsMutationTarget | null | undefined,
) {
  return Boolean(
    objective &&
      [
        "candidate",
        "open",
        "applying",
        "recruiting",
        "reestimating",
        "frozen",
        "submitted",
      ].includes(objective.flowStatus),
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

export function settlementEventMultiplierFor(input: {
  acceptedResult: ObjectiveAcceptedResult;
  finalDueAt: string;
  hasDeadlinePenaltyEvent: boolean;
  kind: ObjectiveSettlementEventKind;
  lootSubmittedAt: string | null;
}) {
  if (input.kind === "deadlinePenalty") return 0.5;
  if (input.kind === "finalCompletion" && input.hasDeadlinePenaltyEvent) return 0;
  return completionMultiplierFor(
    input.acceptedResult,
    input.lootSubmittedAt,
    input.finalDueAt,
  );
}

export function planObjectiveSettlementEvent(input: {
  acceptedResult: ObjectiveAcceptedResult;
  basePoints: number;
  finalDueAt: string;
  hasDeadlinePenaltyEvent: boolean;
  kind: ObjectiveSettlementEventKind;
  lootSubmittedAt: string | null;
}): ObjectiveSettlementEventPlan {
  const multiplier = settlementEventMultiplierFor(input);
  return {
    kind: input.kind,
    basePoints: input.basePoints,
    multiplier,
    settlementPoints: Number((input.basePoints * multiplier).toFixed(2)),
  };
}

export function objectiveSettlementEventKindForFlowStatus(
  flowStatus: ObjectiveFlowStatus | null | undefined,
): ObjectiveSettlementEventKind | null {
  if (flowStatus === "revisionRequired") return "deadlinePenalty";
  if (flowStatus === "accepted") return "finalCompletion";
  return null;
}

export function objectiveSettlementReviewWindow(input: {
  objective: SettlementReviewObjective | null | undefined;
  settlementEvents: readonly SettlementReviewEvent[];
  today: string;
}): ObjectiveSettlementReviewWindow {
  const kind = objectiveSettlementEventKindForFlowStatus(
    input.objective?.flowStatus,
  );
  if (!input.objective || !kind) {
    return { kind, open: false, reason: "notSettlementState" };
  }

  if (input.settlementEvents.some((event) => event.kind === kind)) {
    return { kind, open: false, reason: "alreadySettled" };
  }

  if (kind === "deadlinePenalty" && input.today < input.objective.finalDueAt) {
    return { kind, open: false, reason: "deadlinePending" };
  }

  return { kind, open: true, reason: "open" };
}

export function normalizeContributionRatios(
  input: ContributionAllocation[],
  challengers: ContributionMemberTarget[],
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

export function planObjectiveAcceptance(input: {
  objective: SettlementObjective;
  results: SettlementResult[];
  loot: SettlementLoot;
  resultReviews?: Array<{
    resultId: string;
    acceptedResult: ResultAcceptedResult;
  }>;
  acceptedResult?: ObjectiveAcceptedResult;
}): ObjectiveAcceptancePlan {
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
  const basePoints = normalizedObjectiveBasePoints(input.objective);
  const completionMultiplier = completionMultiplierFor(
    objectiveAcceptedResult,
    input.loot.submittedAt,
    input.objective.finalDueAt,
  );
  const settlementPoints = Number(
    (basePoints * completionMultiplier).toFixed(2),
  );

  return {
    acceptedResultByResultId,
    objectiveAcceptedResult,
    basePoints,
    completionMultiplier,
    settlementPoints,
  };
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
  const acceptancePlan = planObjectiveAcceptance(input);
  const challengerTargets = objectiveChallengerTargets(input.objective);
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
    ...acceptancePlan,
    contributionRatios,
  };
}

export function allocateSettlementPoints<T extends ContributionAllocation>(input: {
  contributionRatios: T[];
  settlementPoints: number;
}): Array<SettlementPointAllocation<T>> {
  const settlementUnits = Math.round(input.settlementPoints * 100);
  if (input.contributionRatios.length === 0) return [];
  if (settlementUnits <= 0) {
    return input.contributionRatios.map((item) => ({
      ...item,
      points: 0,
      pointUnits: 0,
    }));
  }

  const totalRatio = input.contributionRatios.reduce((sum, item) => {
    const ratio = Number(item.ratio);
    return sum + (Number.isFinite(ratio) && ratio > 0 ? ratio : 0);
  }, 0);
  if (totalRatio <= 0) {
    return input.contributionRatios.map((item) => ({
      ...item,
      points: 0,
      pointUnits: 0,
    }));
  }

  const raw = input.contributionRatios.map((item, index) => {
    const ratio = Math.max(0, Number(item.ratio) || 0);
    const exactUnits = (settlementUnits * ratio) / totalRatio;
    const pointUnits = Math.floor(exactUnits);
    return {
      index,
      item,
      pointUnits,
      remainder: exactUnits - pointUnits,
    };
  });
  let remainingUnits = settlementUnits - raw.reduce((sum, item) => sum + item.pointUnits, 0);
  const units = raw.map((item) => item.pointUnits);
  for (const item of [...raw].sort((left, right) => right.remainder - left.remainder || left.index - right.index)) {
    if (remainingUnits <= 0) break;
    units[item.index] = (units[item.index] ?? 0) + 1;
    remainingUnits -= 1;
  }

  return input.contributionRatios.map((item, index) => {
    const pointUnits = units[index] ?? 0;
    return {
      ...item,
      points: pointUnits / 100,
      pointUnits,
    };
  });
}
