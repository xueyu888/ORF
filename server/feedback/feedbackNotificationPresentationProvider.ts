import {
  feedbackNotificationEventKindValues,
  type FeedbackNotificationEventKind,
} from "@orf/feedback-module/contracts";
import type { NotificationKind } from "../../src/types/orf";
import { registerNotificationPresentationProvider } from "../notifications/presentationRegistry";

const feedbackNotificationKindSet = new Set<NotificationKind>(feedbackNotificationEventKindValues);

function assertFeedbackNotificationKind(kind: NotificationKind): FeedbackNotificationEventKind {
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

export function registerFeedbackNotificationPresentationProvider() {
  registerNotificationPresentationProvider({
    namespace: "feedback",
    kinds: feedbackNotificationEventKindValues,
    policy(kind) {
      const feedbackKind = assertFeedbackNotificationKind(kind);
      return {
        kind,
        replyTarget: feedbackKind === "feedback.assignee.digest" ? "none" : "notification-target",
        stream: "personalNotification",
      };
    },
    action(input) {
      return {
        href: input.targetHref,
        label: feedbackNotificationActionLabel(assertFeedbackNotificationKind(input.kind)),
      };
    },
  });
}
