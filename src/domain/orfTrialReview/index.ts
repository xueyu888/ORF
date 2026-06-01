import type { Objective, ObjectiveTrialReview, OrfUser } from "../../types/orf";

export const objectiveTrialReviewStatuses = ["requested", "approved", "needsWork"] as const;

export function latestObjectiveTrialReview(
  objectiveId: string,
  reviews: readonly ObjectiveTrialReview[],
): ObjectiveTrialReview | null {
  return reviews
    .filter((review) => review.objectiveId === objectiveId)
    .sort((left, right) => right.requestedAt.localeCompare(left.requestedAt))[0] ?? null;
}

export function canRequestObjectiveTrialReview(
  objective: Objective | null | undefined,
  currentUser: OrfUser | null | undefined,
  existingReview: ObjectiveTrialReview | null | undefined,
): boolean {
  return Boolean(
    objective &&
      currentUser?.role === "member" &&
      objective.flowStatus === "frozen" &&
      objective.challengers.includes(currentUser.name) &&
      !existingReview,
  );
}

export function canReviewObjectiveTrialReview(
  objective: Objective | null | undefined,
  currentUser: OrfUser | null | undefined,
  review: ObjectiveTrialReview | null | undefined,
): boolean {
  return Boolean(
    objective &&
      currentUser?.role === "admin" &&
      objective.flowStatus === "frozen" &&
      review?.status === "requested",
  );
}

export function objectiveTrialReviewStatusLabel(status: ObjectiveTrialReview["status"]) {
  if (status === "approved") return "可正式提交";
  if (status === "needsWork") return "需补充";
  return "待试验收";
}
