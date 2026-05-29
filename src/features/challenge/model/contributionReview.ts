import type { ContributionAllocation, ObjectiveContributionReview } from "../../../types/orf";

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
  | { status: "invalid"; reason: "memberCoverage" | "ratioRange" | "ratioTotal" };

export function summarizeContributionReviews(
  challengers: string[],
  reviews: ObjectiveContributionReview[],
): ContributionReviewSummary {
  const members = uniqueMembers(challengers);
  if (members.length === 0) {
    return { status: "missing", ratios: [], missingReviewers: [], reviewers: [] };
  }

  if (members.length === 1) {
    return { status: "ready", ratios: [{ member: members[0]!, ratio: 1 }], missingReviewers: [], reviewers: [] };
  }

  const memberSet = new Set(members);
  const latestReviews = latestReviewByReviewer(reviews, memberSet);
  const reviewers = [...latestReviews.keys()].sort();
  const missingReviewers = members.filter((member) => !latestReviews.has(member));
  if (missingReviewers.length > 0) {
    return { status: "missing", ratios: equalRatios(members), missingReviewers, reviewers };
  }

  const reviewEntries: Array<{ reviewer: string; allocations: ContributionAllocation[] }> = [];
  for (const review of latestReviews.values()) {
    const result = validateContributionAllocationInput(review.allocations, members);
    if (result.status === "invalid") {
      return { status: "conflict", ratios: equalRatios(members), missingReviewers: [], reviewers };
    }
    reviewEntries.push({ reviewer: review.reviewer, allocations: result.allocations });
  }

  const peerValuesByMember = members.map((member) => ({
    member,
    values: reviewEntries
      .filter((review) => review.reviewer !== member)
      .map((review) => review.allocations.find((allocation) => allocation.member === member)?.ratio ?? 0),
  }));
  const rawRatios = peerValuesByMember.map(({ member, values }) => {
    const received = values.reduce((sum, ratio) => sum + ratio, 0);
    return { member, ratio: received / values.length };
  });
  const total = rawRatios.reduce((sum, item) => sum + item.ratio, 0);
  if (members.length === 2 && Math.abs(total - CONTRIBUTION_RATIO_TOTAL) > CONTRIBUTION_REVIEW_SPREAD_TOLERANCE + CONTRIBUTION_RATIO_TOLERANCE) {
    return { status: "conflict", ratios: equalRatios(members), missingReviewers: [], reviewers };
  }
  if (total <= 0) {
    return { status: "conflict", ratios: equalRatios(members), missingReviewers: [], reviewers };
  }

  const ratios = rawRatios.map((item) => ({ member: item.member, ratio: item.ratio / total }));
  const maxSpread = Math.max(...peerValuesByMember.map(({ values }) => Math.max(...values) - Math.min(...values)));

  return {
    status: maxSpread <= CONTRIBUTION_REVIEW_SPREAD_TOLERANCE + CONTRIBUTION_RATIO_TOLERANCE ? "ready" : "conflict",
    ratios,
    missingReviewers: [],
    reviewers,
  };
}

export function normalizeContributionAllocations(allocations: ContributionAllocation[], challengers: string[]) {
  const result = validateContributionAllocationInput(allocations, challengers);
  return result.status === "ok" ? result.allocations : [];
}

export function equalRatios(challengers: string[]): ContributionAllocation[] {
  const members = uniqueMembers(challengers);
  if (members.length === 0) return [];
  const ratio = 1 / members.length;
  return members.map((member) => ({ member, ratio }));
}

function latestReviewByReviewer(reviews: ObjectiveContributionReview[], memberSet: Set<string>) {
  const latest = new Map<string, ObjectiveContributionReview>();
  for (const review of reviews) {
    if (!memberSet.has(review.reviewer)) continue;
    const current = latest.get(review.reviewer);
    if (!current || current.submittedAt.localeCompare(review.submittedAt) < 0) {
      latest.set(review.reviewer, review);
    }
  }
  return latest;
}

export function validateContributionAllocationInput(
  allocations: ContributionAllocation[],
  challengers: string[],
): ContributionAllocationValidation {
  const members = uniqueMembers(challengers);
  const memberSet = new Set(members);
  const ratioByMember = new Map<string, number>();
  for (const allocation of allocations) {
    const member = allocation.member.trim();
    const ratio = Number(allocation.ratio);
    if (!memberSet.has(member) || ratioByMember.has(member)) {
      return { status: "invalid", reason: "memberCoverage" };
    }
    if (!Number.isFinite(ratio) || ratio < 0 || ratio > CONTRIBUTION_RATIO_TOTAL) {
      return { status: "invalid", reason: "ratioRange" };
    }
    ratioByMember.set(member, ratio);
  }

  if (ratioByMember.size !== members.length) {
    return { status: "invalid", reason: "memberCoverage" };
  }

  const normalized = members.map((member) => ({ member, ratio: ratioByMember.get(member) ?? 0 }));
  const total = normalized.reduce((sum, item) => sum + item.ratio, 0);
  if (Math.abs(total - CONTRIBUTION_RATIO_TOTAL) > CONTRIBUTION_RATIO_TOLERANCE) {
    return { status: "invalid", reason: "ratioTotal" };
  }

  return { status: "ok", allocations: normalized };
}

function uniqueMembers(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
