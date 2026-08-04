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

export type NotificationActionInput = NotificationContentInput & {
  kind: NotificationKind;
  targetType: NotificationTargetType;
};

export type NotificationAction = {
  href: string;
  label: string;
} | null;

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

function unreachableNotificationAction(_kind: never): NotificationAction {
  return null;
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

export function notificationActionFor(input: NotificationActionInput): NotificationAction {
  const href = input.targetHref.trim();
  if (!href) return null;

  switch (input.kind) {
    case "objective.published":
      return { href, label: "打开悬赏" };
    case "challenge.application.created":
      return { href, label: "处理申请" };
    case "challenge.application.approved":
    case "challenge.application.rejected":
      return { href, label: "打开悬赏" };
    case "objective.recruitment.created":
      return { href, label: "响应征召" };
    case "objective.reinforcement.added":
      return { href, label: "打开我的挑战" };
    case "objective.challenge.accepted":
      return { href, label: "打开挑战" };
    case "objective.alignment.requested":
      return { href, label: href.includes("/loot") ? "打开验收页" : "处理对齐" };
    case "objective.alignment.reviewed":
      return { href, label: href.includes("/loot") ? "打开验收页" : "查看对齐" };
    case "objective.loot.submitted":
      return { href, label: "验收战利品" };
    case "objective.revision.required":
      return { href, label: "打开战利品" };
    case "objective.peerReview.requested":
      return { href, label: "检查互评" };
    case "objective.settlement.updated":
    case "objective.settled":
      return { href, label: "打开统计" };
    case "feedback.created":
    case "feedback.status.changed":
    case "feedback.assigned":
      return { href, label: "打开反馈" };
    case "feedback.commented":
      return { href, label: "打开评论" };
    case "feedback.assignee.daily_digest":
      return { href, label: "打开反馈列表" };
    case "comment.reply.created":
    case "comment.thread.status.changed":
    case "comment.mention.created":
      return { href, label: "打开评论" };
    case "data.sync.conflict":
      return { href, label: "打开通知中心" };
    case "worklog.submitted":
      return { href, label: "打开工作日志" };
    case "worklog.reminder":
      return { href, label: "去补工作日志" };
  }

  return unreachableNotificationAction(input.kind);
}

export function formatNotificationChatBody(input: NotificationActionInput) {
  const title = input.title.trim();
  const body = input.body.trim();
  const content = body ? `**${title}**\n\n${body}` : `**${title}**`;
  const action = notificationActionFor(input);
  return action ? `${content}\n\n[${action.label}](${action.href})` : content;
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
