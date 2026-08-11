import {
  feedbackImpactLabel,
  feedbackIssueDisplayId,
  feedbackIssueHref,
  feedbackLifecycleLabel,
  feedbackNotificationCardReferenceV1Schema,
  feedbackPriorityLabel,
  type FeedbackNotificationCardReferenceV1,
} from "@orf/feedback-module/contracts";
import {
  FeedbackWebApiError,
  getFeedbackReferenceCard,
  type FeedbackReferenceCardData,
} from "./feedbackWebClient";
import { CircleDot, MessageSquare, Paperclip } from "lucide-react";
import { replaceOrfAttachmentMarkdownTokens } from "../features/rich-text/orfRichTextMarkdown";
import type {
  ChatReferenceCardAttachment,
  ChatReferenceCardBodyBlock,
  ChatReferenceCardModel,
  ChatReferenceCardRegistration,
} from "../features/chat/chatReferenceCardProvider";

function feedbackReferenceHref(reference: FeedbackNotificationCardReferenceV1) {
  const href = feedbackIssueHref(reference.feedbackId);
  if (reference.kind === "comment") {
    return `${href}?comment=${encodeURIComponent(reference.commentMessageId)}`;
  }
  return href;
}

function feedbackReferenceTitle(feedbackId: string) {
  return `反馈 #${feedbackIssueDisplayId(feedbackId)}`;
}

function feedbackReferenceIcon(reference: FeedbackNotificationCardReferenceV1) {
  return reference.kind === "comment"
    ? <MessageSquare className="h-4 w-4" />
    : <CircleDot className="h-4 w-4" />;
}

function feedbackReferenceEyebrow(reference: FeedbackNotificationCardReferenceV1) {
  return reference.kind === "comment" ? "反馈回复" : "反馈动态";
}

function feedbackReferencePlaceholder(reference: FeedbackNotificationCardReferenceV1): ChatReferenceCardModel {
  return {
    action: { href: feedbackReferenceHref(reference), label: "打开反馈" },
    className: "orf-chat-feedback-reference-card",
    eyebrow: feedbackReferenceEyebrow(reference),
    icon: feedbackReferenceIcon(reference),
    status: "loading",
    title: feedbackReferenceTitle(reference.feedbackId),
  };
}

function feedbackMissingReferenceModel(reference: FeedbackNotificationCardReferenceV1): ChatReferenceCardModel {
  return {
    ...feedbackReferencePlaceholder(reference),
    body: [{ text: "这条反馈已删除或当前不可见", tone: "warning", type: "notice" }],
    status: "missing",
  };
}

function feedbackReferenceSubtitle(reference: FeedbackNotificationCardReferenceV1, data: FeedbackReferenceCardData) {
  const parts = [
    feedbackReferenceTitle(data.feedback.id),
    data.project?.name,
    reference.kind === "comment" ? data.comment?.author : assigneeName(data),
  ].filter(Boolean);
  return parts.join(" · ");
}

function assigneeName(data: FeedbackReferenceCardData) {
  const assigneeUserId = data.feedback.assigneeUserId?.trim();
  if (!assigneeUserId) return "未指派";
  return data.users.find((user) => user.id === assigneeUserId)?.name ?? "未知处理人";
}

function formatFeedbackReferenceTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
  }).format(date);
}

function feedbackReferenceMeta(reference: FeedbackNotificationCardReferenceV1, data: FeedbackReferenceCardData) {
  const value = reference.kind === "comment"
    ? data.comment?.createdAt
    : data.activity?.at ?? data.feedback.updatedAt;
  if (!value) return null;
  return `${reference.kind === "comment" ? "回复于" : "更新于"} ${formatFeedbackReferenceTime(value)}`;
}

function feedbackReferenceAttachmentCount(data: FeedbackReferenceCardData) {
  return data.feedback.reportAttachments.length + (data.comment?.attachments?.length ?? 0);
}

function FeedbackReferenceBadge({ data }: { data: FeedbackReferenceCardData }) {
  const attachmentCount = feedbackReferenceAttachmentCount(data);
  return (
    <>
      <span>{feedbackLifecycleLabel(data.feedback)}</span>
      {data.feedback.priority && <span>{feedbackPriorityLabel[data.feedback.priority]}</span>}
      <span>{feedbackImpactLabel[data.feedback.impact]}</span>
      {attachmentCount > 0 && (
        <span>
          <Paperclip className="h-3 w-3" />
          {attachmentCount}
        </span>
      )}
    </>
  );
}

function feedbackReferenceAttachments(
  attachments: FeedbackReferenceCardData["feedback"]["reportAttachments"],
): ChatReferenceCardAttachment[] {
  return attachments.map((attachment) => ({
    contentUrl: attachment.contentUrl,
    downloadUrl: attachment.downloadUrl,
    fileName: attachment.fileName,
    fileSize: attachment.fileSize,
    id: attachment.id,
    previewKind: attachment.previewKind,
    previewUrl: attachment.previewUrl,
  }));
}

function addAttachmentSection(
  blocks: ChatReferenceCardBodyBlock[],
  attachments: FeedbackReferenceCardData["feedback"]["reportAttachments"],
) {
  if (attachments.length === 0) return;
  blocks.push({
    attachments: feedbackReferenceAttachments(attachments),
    title: "附件",
    type: "attachments",
  });
}

function feedbackReferenceBodyWithoutListedAttachments(
  bodyMarkdown: string,
  attachments: FeedbackReferenceCardData["feedback"]["reportAttachments"],
) {
  const listedAttachmentIds = new Set(attachments.map((attachment) => attachment.id));
  return replaceOrfAttachmentMarkdownTokens(bodyMarkdown, (reference, token) => (
    reference.kind === "attached" && listedAttachmentIds.has(reference.attachmentId) ? "" : token
  )).trim();
}

function feedbackReferenceBodyBlocks(
  reference: FeedbackNotificationCardReferenceV1,
  data: FeedbackReferenceCardData,
): ChatReferenceCardBodyBlock[] {
  const blocks: ChatReferenceCardBodyBlock[] = [];
  if (reference.kind === "comment") {
    const attachments = data.comment?.attachments ?? [];
    const body = feedbackReferenceBodyWithoutListedAttachments(data.comment?.body ?? "", attachments);
    if (body) {
      blocks.push({ bodyMarkdown: body, title: "回复内容", type: "section" });
    }
    addAttachmentSection(blocks, attachments);
    return blocks;
  }

  const description = feedbackReferenceBodyWithoutListedAttachments(
    data.feedback.description,
    data.feedback.reportAttachments,
  );
  if (description) {
    blocks.push({ bodyMarkdown: description, title: "原始报告", type: "section" });
  }
  addAttachmentSection(blocks, data.feedback.reportAttachments);
  return blocks;
}

function feedbackReferenceModel(
  reference: FeedbackNotificationCardReferenceV1,
  data: FeedbackReferenceCardData,
): ChatReferenceCardModel {
  return {
    action: { href: feedbackReferenceHref(reference), label: "打开反馈" },
    badge: <FeedbackReferenceBadge data={data} />,
    body: feedbackReferenceBodyBlocks(reference, data),
    className: "orf-chat-feedback-reference-card",
    eyebrow: feedbackReferenceEyebrow(reference),
    icon: feedbackReferenceIcon(reference),
    meta: feedbackReferenceMeta(reference, data),
    status: "ready",
    subtitle: feedbackReferenceSubtitle(reference, data),
    title: data.feedback.title.trim() || feedbackReferenceTitle(data.feedback.id),
  };
}

function isMissingFeedbackReference(error: unknown) {
  return error instanceof FeedbackWebApiError && (error.status === 403 || error.status === 404);
}

async function loadFeedbackReferenceModel(
  reference: FeedbackNotificationCardReferenceV1,
  signal: AbortSignal,
): Promise<ChatReferenceCardModel> {
  try {
    const response = await getFeedbackReferenceCard({
      activityId: reference.activityId,
      commentMessageId: reference.kind === "comment" ? reference.commentMessageId : null,
      feedbackId: reference.feedbackId,
    }, { signal });
    return feedbackReferenceModel(reference, response.reference);
  } catch (error) {
    if (isMissingFeedbackReference(error)) {
      return feedbackMissingReferenceModel(reference);
    }
    throw error;
  }
}

export const feedbackChatReferenceCardRegistration: ChatReferenceCardRegistration<FeedbackNotificationCardReferenceV1> = {
  cacheKey: (reference) => reference.kind === "comment"
    ? `feedback:${reference.feedbackId}:comment:${reference.commentMessageId}`
    : `feedback:${reference.feedbackId}:activity:${reference.activityId}`,
  placeholder: feedbackReferencePlaceholder,
  provider: {
    namespace: "feedback",
    referenceSchema: feedbackNotificationCardReferenceV1Schema,
    load: loadFeedbackReferenceModel,
  },
};
