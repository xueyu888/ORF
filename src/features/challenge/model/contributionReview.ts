import type { ContributionAllocation, ObjectiveContributionReview } from "../../../types/orf";

export type ContributionReviewStatus = "ready" | "missing" | "conflict";

export type ContributionReviewSummary = {
  status: ContributionReviewStatus;
  ratios: ContributionAllocation[];
  missingReviewers: string[];
  reviewers: string[];
};

const REVIEW_TOLERANCE = 0.1;

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

  const normalizedReviews = [...latestReviews.values()].map((review) => normalizeAllocations(review.allocations, members));
  if (normalizedReviews.some((allocations) => allocations.length === 0)) {
    return { status: "conflict", ratios: equalRatios(members), missingReviewers: [], reviewers };
  }

  const rawRatios = members.map((member) => {
    const received = normalizedReviews
      .map((allocations) => allocations.find((allocation) => allocation.member === member)?.ratio ?? 0)
      .reduce((sum, ratio) => sum + ratio, 0);
    return { member, ratio: received / normalizedReviews.length };
  });
  const total = rawRatios.reduce((sum, item) => sum + item.ratio, 0);
  if (total <= 0) {
    return { status: "conflict", ratios: equalRatios(members), missingReviewers: [], reviewers };
  }

  const ratios = rawRatios.map((item) => ({ member: item.member, ratio: item.ratio / total }));
  const maxSpread = Math.max(
    ...members.map((member) => {
      const values = normalizedReviews.map((allocations) => allocations.find((allocation) => allocation.member === member)?.ratio ?? 0);
      return Math.max(...values) - Math.min(...values);
    }),
  );

  return {
    status: maxSpread <= REVIEW_TOLERANCE ? "ready" : "conflict",
    ratios,
    missingReviewers: [],
    reviewers,
  };
}

export function normalizeContributionAllocations(allocations: ContributionAllocation[], challengers: string[]) {
  return normalizeAllocations(allocations, uniqueMembers(challengers));
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

function normalizeAllocations(allocations: ContributionAllocation[], members: string[]) {
  const memberSet = new Set(members);
  const ratioByMember = new Map<string, number>();
  for (const allocation of allocations) {
    const member = allocation.member.trim();
    const ratio = Number(allocation.ratio);
    if (!memberSet.has(member) || !Number.isFinite(ratio) || ratio < 0) continue;
    ratioByMember.set(member, (ratioByMember.get(member) ?? 0) + ratio);
  }

  const total = [...ratioByMember.values()].reduce((sum, ratio) => sum + ratio, 0);
  if (total <= 0) return [];
  return members.map((member) => ({ member, ratio: (ratioByMember.get(member) ?? 0) / total }));
}

function uniqueMembers(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
