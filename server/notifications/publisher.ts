import type { CommentTargetType } from "../../src/types/orf";
import type { NotificationEventInput } from "../repositories/notificationRepository";
import { createNotificationEvent } from "../repositories/notificationRepository";
import { notificationPolicy } from "./policies/registry";

type PublishNotificationEventInput = Omit<NotificationEventInput, "replyTargetId" | "replyTargetType" | "stream"> & {
  replyTargetId?: string | null;
  replyTargetType?: CommentTargetType | null;
  stream?: NotificationEventInput["stream"];
};

export async function publishNotificationEvent(input: PublishNotificationEventInput) {
  const policy = notificationPolicy(input.kind);
  const replyTarget = inferredReplyTarget(input, policy.replyTarget);
  return createNotificationEvent({
    ...input,
    replyTargetId: input.replyTargetId ?? replyTarget?.targetId ?? null,
    replyTargetType: input.replyTargetType ?? replyTarget?.targetType ?? null,
    stream: input.stream ?? policy.stream,
  });
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
  if (input.targetType === "feedback") {
    return { targetId: input.targetId, targetType: "feedback" };
  }
  if (input.targetType === "objective") {
    return { targetId: input.targetId, targetType: "objective" };
  }
  return null;
}

function isCommentTargetType(value: string | undefined): value is CommentTargetType {
  return value === "objective" || value === "result" || value === "task" || value === "subtask" || value === "feedback";
}
