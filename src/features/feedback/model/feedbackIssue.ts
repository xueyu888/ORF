import type { CommentThread, Feedback, FeedbackStatus } from "../../../types/orf";

export type FeedbackIssueState = "open" | "closed";

export function feedbackIssueState(feedback: Pick<Feedback, "status">): FeedbackIssueState {
  return feedback.status === "Closed" ? "closed" : "open";
}

export function isFeedbackIssueOpen(feedback: Pick<Feedback, "status">) {
  return feedbackIssueState(feedback) === "open";
}

export function feedbackIssueStateLabel(feedback: Pick<Feedback, "status">) {
  return isFeedbackIssueOpen(feedback) ? "Open" : "Closed";
}

export function nextFeedbackIssueStatus(feedback: Pick<Feedback, "status">): FeedbackStatus {
  return isFeedbackIssueOpen(feedback) ? "Closed" : "Open";
}

export function feedbackIssueThreads(comments: readonly CommentThread[], feedbackId: string) {
  return comments.filter((thread) => thread.targetType === "feedback" && thread.targetId === feedbackId);
}

export function feedbackIssueCommentCount(comments: readonly CommentThread[], feedbackId: string) {
  return feedbackIssueThreads(comments, feedbackId).reduce((count, thread) => count + thread.messages.length, 0);
}

export function feedbackIssueDisplayId(value: string) {
  const normalized = value.replace(/^fb-/, "");
  return normalized.length > 8 ? normalized.slice(0, 8) : normalized;
}
