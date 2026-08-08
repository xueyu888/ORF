import {
  feedbackNotificationCardReferenceFromPayload,
  type FeedbackNotificationEventPlan,
} from "@orf/feedback-module/contracts";
import type { NotificationRecipientInput } from "../notifications/notificationEventModel";
import { publishNotificationEvent } from "../notifications/publisher";

type FeedbackNotificationPortContext = {
  readonly activityEventId: string;
  readonly dispatchId: string;
  readonly idempotencyKey: string;
  readonly recipients: readonly NotificationRecipientInput[];
};

export const feedbackNotificationPort = async (
  plan: FeedbackNotificationEventPlan,
  context: FeedbackNotificationPortContext,
) => {
  const cardReference = feedbackNotificationCardReferenceFromPayload(plan.payload, context.activityEventId);
  const notifications = await publishNotificationEvent({
    ...plan,
    metadata: {
      ...plan.metadata,
      feedbackActivityId: context.activityEventId,
      feedbackNotificationPayloadType: plan.payload.type,
      feedbackNotificationPayloadVersion: String(plan.payload.version),
    },
    recipientFacts: context.recipients.map((recipient) => ({
      attentionLevel: recipient.attentionLevel,
      deliveryClass: recipient.deliveryClass,
      reasons: recipient.reasons,
      userId: recipient.userId,
    })),
    sourceEventKey: context.dispatchId,
    systemReference: cardReference
      ? {
          namespace: "feedback",
          reference: cardReference,
        }
      : null,
  });
  return { notificationEventId: notifications[0]?.id ?? null };
};
