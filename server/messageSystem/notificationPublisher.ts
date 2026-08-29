import type { CommentTargetType } from "../../src/types/orf";
import { isCommentTargetType } from "../comments/commentTargetAdapters";
import { notificationPolicy } from "../notifications/policies/registry";
import type { NotificationEventInput } from "../repositories/notificationRepository";
import { createNotificationEvent } from "../repositories/notificationRepository";
import { flushNotificationChatDeliveriesForEvent } from "./notificationChatProjection";

type PublishNotificationEventInput = Omit<NotificationEventInput, "replyTargetId" | "replyTargetType" | "stream"> & {
  replyTargetId?: string | null;
  replyTargetType?: CommentTargetType | null;
  stream?: NotificationEventInput["stream"];
};

export async function publishNotificationEvent(input: PublishNotificationEventInput) {
  const policy = notificationPolicy(input.kind);
  const replyTarget = inferredReplyTarget(input, policy.replyTarget);
  const notifications = await createNotificationEvent({
    ...input,
    replyTargetId: input.replyTargetId ?? replyTarget?.targetId ?? null,
    replyTargetType: input.replyTargetType ?? replyTarget?.targetType ?? null,
    stream: input.stream ?? policy.stream,
  });
  const eventId = notifications[0]?.id;
  if (eventId) {
    await flushNotificationChatDeliveriesForEvent(eventId).catch(() => undefined);
  }
  return notifications;
}

function inferredReplyTarget(
  input: PublishNotificationEventInput,
  mode: ReturnType<typeof notificationPolicy>["replyTarget"],
): { targetId: string; targetType: CommentTargetType } | null {
  if (mode === "none") {
    return null;
  }
  if (mode === "metadata-comment-target") {
    const targetType = input.metadata?.targetType;
    const targetId = input.metadata?.targetId;
    return isCommentTargetType(targetType) && targetId ? { targetId, targetType } : null;
  }
  if (isCommentTargetType(input.targetType)) {
    return { targetId: input.targetId, targetType: input.targetType };
  }
  return null;
}
