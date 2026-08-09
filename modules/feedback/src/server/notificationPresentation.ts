import {
  feedbackNotificationEventKindValues,
  type FeedbackNotificationEventKind,
} from "../contracts";

export interface FeedbackNotificationPolicyDescriptor {
  readonly kind: string;
  readonly replyTarget: "notification-target" | "metadata-comment-target" | "none";
  readonly stream: "personalNotification";
}

export type FeedbackNotificationAction = {
  readonly href: string;
  readonly label: string;
} | null;

export interface FeedbackNotificationPresentationActionInput {
  readonly body: string;
  readonly kind: string;
  readonly metadata?: Record<string, string> | null;
  readonly targetHref: string;
  readonly targetType: string;
  readonly title: string;
}

export interface FeedbackNotificationPresentationProviderContribution {
  readonly namespace: "feedback";
  readonly kinds: readonly string[];
  policy(kind: string): FeedbackNotificationPolicyDescriptor;
  action(input: FeedbackNotificationPresentationActionInput): FeedbackNotificationAction;
}

const feedbackNotificationKindSet = new Set<string>(feedbackNotificationEventKindValues);

export function createFeedbackNotificationPresentationProvider(): FeedbackNotificationPresentationProviderContribution {
  return {
    namespace: "feedback",
    kinds: feedbackNotificationEventKindValues,
    policy(kind) {
      return {
        kind: assertFeedbackNotificationKind(kind),
        replyTarget: kind === "feedback.assignee.digest" ? "none" : "notification-target",
        stream: "personalNotification",
      };
    },
    action(input) {
      return {
        href: input.targetHref,
        label: feedbackNotificationActionLabel(assertFeedbackNotificationKind(input.kind)),
      };
    },
  };
}

function assertFeedbackNotificationKind(kind: string): FeedbackNotificationEventKind {
  if (!feedbackNotificationKindSet.has(kind)) {
    throw new Error(`Unsupported feedback notification kind ${kind}.`);
  }
  return kind as FeedbackNotificationEventKind;
}

function feedbackNotificationActionLabel(kind: FeedbackNotificationEventKind) {
  if (kind === "feedback.comment.created") return "打开评论";
  if (kind === "feedback.assignee.digest") return "打开反馈列表";
  return "打开反馈";
}
