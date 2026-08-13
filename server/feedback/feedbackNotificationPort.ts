import {
  feedbackNotificationCardReferenceFromPayload,
  type FeedbackNotificationEventPlan,
} from "@orf/feedback-module/contracts";
import type { NotificationRecipientInput } from "../notifications/notificationEventModel";
import { publishNotificationEvent } from "../notifications/publisher";
import { notificationPresentationFor } from "../notifications/presentationRegistry";

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
  const notifications = await publishFeedbackNotificationPlan(plan, {
    activityEventId: context.activityEventId,
    recipients: context.recipients,
    sourceEventKey: context.dispatchId,
  });
  return { notificationEventId: notifications[0]?.id ?? null };
};

export const feedbackDailyDigestNotificationPort = async (plan: FeedbackNotificationEventPlan) =>
  publishFeedbackNotificationPlan(plan, {
    recipients: plan.recipientUserIds.map((userId) => ({
      attentionLevel: "normal",
      deliveryClass: "ordinary",
      reasons: ["assignee"],
      userId,
    })),
  });

async function publishFeedbackNotificationPlan(
  plan: FeedbackNotificationEventPlan,
  context: {
    readonly activityEventId?: string | null;
    readonly recipients: readonly NotificationRecipientInput[];
    readonly sourceEventKey?: string | null;
  },
) {
  const recipients = context.recipients
    .filter((recipient) => recipient.userId.trim())
    .map((recipient) => ({
      attentionLevel: recipient.attentionLevel ?? "normal",
      deliveryClass: recipient.deliveryClass ?? "ordinary",
      reasons: recipient.reasons ?? [],
      userId: recipient.userId.trim(),
    }));
  if (recipients.length === 0) return [];
  const presentations = recipients.map((recipient) => notificationPresentationFor({
    namespace: "feedback",
    payload: plan.payload,
    recipient,
  }));
  const presentation = presentations[0];
  const activityEventId = context.activityEventId?.trim() || null;
  const cardReference = feedbackNotificationCardReferenceFromPayload(plan.payload, activityEventId);
  return publishNotificationEvent({
    actorName: presentation.actorName,
    actorUserId: presentation.actorUserId,
    body: presentation.body,
    kind: presentation.kind,
    metadata: {
      ...presentation.metadata,
      ...(activityEventId ? { feedbackActivityId: activityEventId } : {}),
    },
    recipientFacts: presentations.map(({ recipient }) => ({
      attentionLevel: recipient.attentionLevel,
      deliveryClass: recipient.deliveryClass,
      reasons: recipient.reasons,
      userId: recipient.userId,
    })),
    recipientUserIds: presentations.map(({ recipient }) => recipient.userId),
    replyTargetId: presentation.replyTarget?.targetId ?? null,
    replyTargetType: presentation.replyTarget?.targetType ?? null,
    sourceEventKey: context.sourceEventKey,
    stream: presentation.stream,
    systemReference: cardReference
      ? {
          namespace: "feedback",
          reference: cardReference,
        }
      : null,
    targetHref: presentation.target.href,
    targetId: presentation.target.id,
    targetType: presentation.target.type,
    teamId: plan.teamId,
    title: presentation.title,
  });
}
