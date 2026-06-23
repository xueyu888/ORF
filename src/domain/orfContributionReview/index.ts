import type {
  ContributionAllocation,
  ObjectiveContributionReview,
} from "../../types/orf";
import type { ContributionMemberTarget } from "../orfObjectiveParticipants";

export type ContributionReviewStatus = "ready" | "missing" | "conflict";

export type ContributionReviewSummary = {
  status: ContributionReviewStatus;
  ratios: ContributionAllocation[];
  missingReviewers: string[];
  reviewers: string[];
};

export const CONTRIBUTION_RATIO_TOTAL = 1;
export const CONTRIBUTION_RATIO_TOLERANCE = 0.0001;
export const CONTRIBUTION_REVIEW_SPREAD_TOLERANCE = 0.1;

export type ContributionAllocationValidation =
  | { status: "ok"; allocations: ContributionAllocation[] }
  | {
      status: "invalid";
      reason: "memberCoverage" | "ratioRange" | "ratioTotal";
    };

export function summarizeContributionReviews(
  targets: ContributionMemberTarget[],
  reviews: ObjectiveContributionReview[],
): ContributionReviewSummary {
  const members = uniqueContributionMemberTargets(targets);
  if (members.length === 0) {
    return {
      status: "missing",
      ratios: [],
      missingReviewers: [],
      reviewers: [],
    };
  }

  if (members.length === 1) {
    return {
      status: "ready",
      ratios: [{ member: members[0]!.member, memberUserId: members[0]!.memberUserId, ratio: 1 }],
      missingReviewers: [],
      reviewers: [],
    };
  }

  const memberByUserId = new Map(members.map((member) => [member.memberUserId, member]));
  const latestReviews = latestReviewByReviewer(reviews, memberByUserId);
  const reviewers = [...latestReviews.keys()].map((userId) => memberByUserId.get(userId)?.member ?? userId).sort();
  const missingReviewers = members.filter(
    (member) => !latestReviews.has(member.memberUserId),
  ).map(
    (member) => member.member,
  );
  if (missingReviewers.length > 0) {
    return {
      status: "missing",
      ratios: equalRatios(members),
      missingReviewers,
      reviewers,
    };
  }

  const reviewEntries: Array<{
    reviewer: string;
    reviewerUserId: string;
    allocations: ContributionAllocation[];
  }> = [];
  for (const [reviewerUserId, review] of latestReviews.entries()) {
    const result = validateContributionAllocationInput(
      review.allocations,
      members,
    );
    if (result.status === "invalid") {
      return {
        status: "conflict",
        ratios: equalRatios(members),
        missingReviewers: [],
        reviewers,
      };
    }
    reviewEntries.push({
      reviewer: review.reviewer,
      reviewerUserId,
      allocations: result.allocations,
    });
  }

  const peerValuesByMember = members.map((member) => ({
    member,
    values: reviewEntries
      .filter((review) => review.reviewerUserId !== member.memberUserId)
      .map(
        (review) =>
          review.allocations.find((allocation) => allocation.memberUserId === member.memberUserId)
            ?.ratio ?? 0,
      ),
  }));
  const rawRatios = peerValuesByMember.map(({ member, values }) => {
    const received = values.reduce((sum, ratio) => sum + ratio, 0);
    return { member: member.member, memberUserId: member.memberUserId, ratio: received / values.length };
  });
  const total = rawRatios.reduce((sum, item) => sum + item.ratio, 0);
  if (
    members.length === 2 &&
    Math.abs(total - CONTRIBUTION_RATIO_TOTAL) >
      CONTRIBUTION_REVIEW_SPREAD_TOLERANCE + CONTRIBUTION_RATIO_TOLERANCE
  ) {
    return {
      status: "conflict",
      ratios: equalRatios(members),
      missingReviewers: [],
      reviewers,
    };
  }
  if (total <= 0) {
    return {
      status: "conflict",
      ratios: equalRatios(members),
      missingReviewers: [],
      reviewers,
    };
  }

  const ratios = rawRatios.map((item) => ({
    member: item.member,
    memberUserId: item.memberUserId,
    ratio: item.ratio / total,
  }));
  const maxSpread = Math.max(
    ...peerValuesByMember.map(
      ({ values }) => Math.max(...values) - Math.min(...values),
    ),
  );

  return {
    status:
      maxSpread <=
      CONTRIBUTION_REVIEW_SPREAD_TOLERANCE + CONTRIBUTION_RATIO_TOLERANCE
        ? "ready"
        : "conflict",
    ratios,
    missingReviewers: [],
    reviewers,
  };
}

export function equalRatios(challengers: ContributionMemberTarget[]): ContributionAllocation[] {
  const members = uniqueContributionMemberTargets(challengers);
  if (members.length === 0) return [];
  const ratio = 1 / members.length;
  return members.map((member) => ({ member: member.member, memberUserId: member.memberUserId, ratio }));
}

function latestReviewByReviewer(
  reviews: ObjectiveContributionReview[],
  memberSet: Map<string, ContributionMemberTarget>,
) {
  const latest = new Map<string, ObjectiveContributionReview>();
  for (const review of reviews) {
    const reviewerUserId = review.reviewerUserId?.trim();
    if (!reviewerUserId || !memberSet.has(reviewerUserId)) continue;
    const current = latest.get(reviewerUserId);
    if (!current || current.submittedAt.localeCompare(review.submittedAt) < 0) {
      latest.set(reviewerUserId, review);
    }
  }
  return latest;
}

export function validateContributionAllocationInput(
  allocations: ContributionAllocation[],
  challengers: ContributionMemberTarget[],
): ContributionAllocationValidation {
  const members = uniqueContributionMemberTargets(challengers);
  const targetByKey = new Map(
    members.map((member) => [contributionMemberKey(member), member]),
  );
  const ratioByMember = new Map<string, number>();
  for (const allocation of allocations) {
    const allocationUserId = allocation.memberUserId?.trim();
    const key = allocationUserId;
    const ratio = Number(allocation.ratio);
    if (!key || !targetByKey.has(key) || ratioByMember.has(key)) {
      return { status: "invalid", reason: "memberCoverage" };
    }
    if (
      !Number.isFinite(ratio) ||
      ratio < 0 ||
      ratio > CONTRIBUTION_RATIO_TOTAL
    ) {
      return { status: "invalid", reason: "ratioRange" };
    }
    ratioByMember.set(key, ratio);
  }

  if (ratioByMember.size !== targetByKey.size) {
    return { status: "invalid", reason: "memberCoverage" };
  }

  const normalized = members.map((member) => ({
    member: member.member,
    memberUserId: member.memberUserId,
    ratio: ratioByMember.get(contributionMemberKey(member)) ?? 0,
  }));
  const total = normalized.reduce((sum, item) => sum + item.ratio, 0);
  if (
    Math.abs(total - CONTRIBUTION_RATIO_TOTAL) > CONTRIBUTION_RATIO_TOLERANCE
  ) {
    return { status: "invalid", reason: "ratioTotal" };
  }

  return { status: "ok", allocations: normalized };
}

function uniqueContributionMemberTargets(
  values: ContributionMemberTarget[],
) {
  const targets: ContributionMemberTarget[] = [];
  const seenKeys = new Set<string>();
  for (const value of values) {
    const member = value.member.trim();
    if (!member) continue;
    const memberUserId = value.memberUserId?.trim();
    if (!memberUserId) continue;
    const target = { member, memberUserId };
    const key = contributionMemberKey(target);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    targets.push(target);
  }
  return targets;
}

function contributionMemberKey(target: ContributionMemberTarget) {
  return target.memberUserId.trim();
}
