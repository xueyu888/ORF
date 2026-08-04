import { createHash } from "node:crypto";
import type {
  CommentAttachmentPreviewKind,
  ChatMessageSystemMetadata,
  CommentTargetType,
  NotificationKind,
  NotificationStream,
  NotificationTargetType,
} from "../../src/types/orf";
import {
  replaceOrfAttachmentMarkdownTokens,
} from "../../src/features/rich-text/orfRichTextMarkdown";

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

export type CommentNotificationAttachmentFact = {
  fileName: string;
  id: string;
  mimeType: string;
  previewKind?: CommentAttachmentPreviewKind | null;
};

export type CommentNotificationContent = {
  body: string;
  metadata: Record<string, string>;
};

const commentNotificationImageMetadataKey = "commentImageAttachmentIds";

function cleanUserIds(userIds: readonly string[]) {
  return Array.from(new Set(userIds.map((id) => id.trim()).filter(Boolean)));
}

function isCommentNotificationImageAttachment(attachment: CommentNotificationAttachmentFact) {
  return attachment.previewKind === "image" || attachment.mimeType.trim().toLowerCase().startsWith("image/");
}

function commentNotificationImageAttachmentIds(attachments: readonly CommentNotificationAttachmentFact[]) {
  return Array.from(new Set(attachments.filter(isCommentNotificationImageAttachment).map((attachment) => attachment.id.trim()).filter(Boolean)));
}

function markdownWithOnlyCommentImages(markdown: string, imageAttachmentIds: readonly string[]) {
  const imageIds = new Set(imageAttachmentIds);
  return replaceOrfAttachmentMarkdownTokens(markdown, (reference, token) => {
    return reference.kind === "attached" && imageIds.has(reference.attachmentId) ? token : "";
  })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function buildCommentNotificationContent(input: {
  attachments?: readonly CommentNotificationAttachmentFact[];
  commentBody: string;
  summary: string;
}): CommentNotificationContent {
  const imageAttachmentIds = commentNotificationImageAttachmentIds(input.attachments ?? []);
  const commentBody = markdownWithOnlyCommentImages(input.commentBody, imageAttachmentIds);
  const summary = input.summary.trim();
  const metadata: Record<string, string> = imageAttachmentIds.length > 0 ? { [commentNotificationImageMetadataKey]: imageAttachmentIds.join(",") } : {};
  return {
    body: commentBody ? `${summary}\n\n${commentBody}` : summary,
    metadata,
  };
}

export function commentNotificationImageAttachmentIdsFromMetadata(metadata?: Record<string, string> | null) {
  return (metadata?.[commentNotificationImageMetadataKey] ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
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

export function notificationChatDeliveryId(eventId: string, recipientUserId?: string | null, destinationId?: string | null) {
  const destinationKey = destinationId?.trim();
  const recipientKey = destinationKey ? `destination:${destinationKey}` : recipientUserId?.trim() || "team";
  const identity = `${eventId}|${recipientKey}|chat`;
  return `ndel-${createHash("md5").update(identity).digest("hex")}`;
}
