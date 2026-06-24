import type { Feedback } from "../../../types/orf";

export type FeedbackIssueOrderingFields = Pick<Feedback, "id" | "createdAt" | "updatedAt">;

export function compareFeedbackIssuesByUpdatedAtDescending(
  left: FeedbackIssueOrderingFields,
  right: FeedbackIssueOrderingFields,
) {
  return (
    compareTextDescending(left.updatedAt, right.updatedAt) ||
    compareTextDescending(left.createdAt, right.createdAt) ||
    compareTextDescending(left.id, right.id)
  );
}

export function sortFeedbackIssuesByUpdatedAtDescending<T extends FeedbackIssueOrderingFields>(items: readonly T[]): T[] {
  return [...items].sort(compareFeedbackIssuesByUpdatedAtDescending);
}

function compareTextDescending(left: string, right: string) {
  if (left === right) return 0;
  return right > left ? 1 : -1;
}
