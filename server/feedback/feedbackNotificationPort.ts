import type { FeedbackNotificationPort } from "@orf/feedback-module/server";
import { publishNotificationEvent } from "../notifications/publisher";

export const feedbackNotificationPort: FeedbackNotificationPort = async (plan, context) => {
  const notifications = await publishNotificationEvent({
    ...plan,
    recipientFacts: context.recipients.map((recipient) => ({
      attentionLevel: recipient.attentionLevel,
      deliveryClass: recipient.deliveryClass,
      reasons: recipient.reasons,
      userId: recipient.userId,
    })),
    sourceEventKey: context.dispatchId,
  });
  return { notificationEventId: notifications[0]?.id ?? null };
};
