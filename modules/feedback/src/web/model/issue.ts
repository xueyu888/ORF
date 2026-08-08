import type { FeedbackTransitionType } from "../../contracts";
import type { FeedbackWebCommentThread, FeedbackWebIssue } from "../types";

export {
  feedbackIssueBodyPreview,
  feedbackIssueCommentCount,
  feedbackIssueDisplayId,
  feedbackIssueStateLabel,
  isFeedbackIssueOpen,
} from "../../contracts/issueList";
export {
  feedbackIssueFallbackMarkdownLink,
  feedbackIssueHref,
  feedbackIssueIdFromHref,
  feedbackIssueIdsFromText,
  feedbackIssueMarkdownLabel,
  feedbackIssueMarkdownLink,
  formatPastedFeedbackLinks,
} from "../../contracts/links";

export type FeedbackIssueState = "open" | "closed";

export function feedbackIssueState(feedback: Pick<FeedbackWebIssue, "stage">): FeedbackIssueState {
  return feedback.stage === "closed" ? "closed" : "open";
}

export function primaryFeedbackIssueTransition(feedback: Pick<FeedbackWebIssue, "stage">): FeedbackTransitionType {
  if (feedback.stage === "closed") return "reopen";
  if (feedback.stage === "pending_verification") return "accept_verification";
  if (feedback.stage === "open") return "start";
  return "submit_verification";
}

export function feedbackIssueThreads(comments: readonly FeedbackWebCommentThread[], feedbackId: string) {
  return comments.filter((thread) => thread.targetType === "feedback" && thread.targetId === feedbackId);
}
