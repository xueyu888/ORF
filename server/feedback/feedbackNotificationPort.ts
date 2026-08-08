import { feedbackNotificationCardReferenceFromPayload } from "@orf/feedback-module/contracts";
import type { FeedbackNotificationPort } from "@orf/feedback-module/server";
import { publishNotificationEvent } from "../notifications/publisher";

export const feedbackNotificationPort: FeedbackNotificationPort = async (plan, context) => {
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
