import { createHash } from "node:crypto";
import type {
  ChatMessageSystemMetadata,
  CommentTargetType,
  NotificationKind,
  NotificationStream,
  NotificationTargetType,
} from "../../src/types/orf";

export type NotificationDeliveryChannel = "chat";

export type NotificationDeliveryStatus = "pending" | "delivered" | "failed";

export type NotificationContentInput = {
  body: string;
  targetHref: string;
  title: string;
};

export type NotificationMetadataInput = NotificationContentInput & {
  actorName: string;
  actorUserId?: string | null;
  kind: NotificationKind;
  metadata?: Record<string, string> | null;
  replyTargetId?: string | null;
  replyTargetType?: CommentTargetType | null;
  stream: NotificationStream;
  targetId: string;
  targetType: NotificationTargetType;
};

export type NotificationRecipientFact = {
  readAt: string | null;
  userId: string;
};

function cleanUserIds(userIds: readonly string[]) {
  return Array.from(new Set(userIds.map((id) => id.trim()).filter(Boolean)));
}

export function resolveNotificationRecipients(input: {
  actorUserId?: string | null;
  createdAt: string;
  recipientUserIds: readonly string[];
  stream: NotificationStream;
}): NotificationRecipientFact[] {
  const actorUserId = input.actorUserId?.trim() || null;
  return cleanUserIds(input.recipientUserIds)
    .filter((userId) => input.stream === "teamAnnouncement" || userId !== actorUserId)
    .map((userId) => ({
      readAt: input.stream === "teamAnnouncement" && userId === actorUserId ? input.createdAt : null,
      userId,
    }));
}

export function formatNotificationChatBody(input: NotificationContentInput) {
  const title = input.title.trim();
  const body = input.body.trim();
  const targetHref = input.targetHref.trim();
  const content = body ? `**${title}**\n\n${body}` : `**${title}**`;
  return targetHref ? `${content}\n\n[打开目标](${targetHref})` : content;
}

export function buildNotificationSystemMetadata(
  input: NotificationMetadataInput,
  eventId: string,
  recipientUserId?: string | null,
): ChatMessageSystemMetadata {
  return {
    actorName: input.actorName.trim(),
    actorUserId: input.actorUserId?.trim() || null,
    kind: input.kind,
    metadata: input.metadata ?? {},
    notificationEventId: eventId,
    recipientUserId: recipientUserId ?? null,
    replyTargetId: input.replyTargetId ?? null,
    replyTargetType: input.replyTargetType ?? null,
    stream: input.stream,
    targetHref: input.targetHref,
    targetId: input.targetId,
    targetTitle: input.metadata?.targetTitle ?? input.title,
    targetType: input.targetType,
    title: input.title.trim(),
  };
}

export function notificationChatDeliveryId(eventId: string, recipientUserId?: string | null) {
  const recipientKey = recipientUserId?.trim() || "team";
  const identity = `${eventId}|${recipientKey}|chat`;
  return `ndel-${createHash("md5").update(identity).digest("hex")}`;
}
