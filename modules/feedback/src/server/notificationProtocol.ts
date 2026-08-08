import type { FeedbackNotificationEventPlan } from "../contracts";

export type FeedbackNotificationRecipientReason =
  | "action_required"
  | "administrator"
  | "assignee"
  | "creator"
  | "follower"
  | "participant"
  | "previous_assignee";

export type FeedbackNotificationDeliveryClass = "direct" | "mandatory" | "ordinary";
export type FeedbackNotificationAttentionLevel = "action_required" | "normal";

export type FeedbackNotificationDispatchRecipient = {
  readonly attentionLevel: FeedbackNotificationAttentionLevel;
  readonly deliveryClass: FeedbackNotificationDeliveryClass;
  readonly muted?: boolean;
  readonly reasons: readonly FeedbackNotificationRecipientReason[];
  readonly userId: string;
};

export type FeedbackNotificationDispatchDraft = {
  readonly plan: FeedbackNotificationEventPlan;
  readonly recipients: readonly FeedbackNotificationDispatchRecipient[];
};

export type FeedbackNotificationPortResult = {
  readonly notificationEventId?: string | null;
};

export type FeedbackNotificationPort = (
  plan: FeedbackNotificationEventPlan,
  context: {
    readonly activityEventId: string;
    readonly dispatchId: string;
    readonly idempotencyKey: string;
    readonly recipients: readonly FeedbackNotificationDispatchRecipient[];
  },
) => Promise<FeedbackNotificationPortResult>;
