import {
  feedbackNotificationCardReferenceV1Schema,
  type FeedbackNotificationCardReferenceV1,
} from "@orf/feedback-module/contracts";
import {
  FeedbackWebApiError,
  feedbackImpactLabel,
  feedbackIssueDisplayId,
  feedbackIssueHref,
  feedbackLifecycleLabel,
  feedbackPriorityLabel,
  getFeedbackReferenceCard,
  type FeedbackReferenceCardData,
} from "@orf/feedback-module/web";
import { CircleDot, MessageSquare, Paperclip } from "lucide-react";
import type {
  ChatReferenceCardBodyBlock,
  ChatReferenceCardModel,
  ChatReferenceCardRegistration,
} from "../features/chat/chatReferenceCardProvider";

const visibleAttachmentLimit = 5;

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
    subtitle: feedbackReferenceTitle(reference.feedbackId),
    title: reference.kind === "comment" ? "正在读取反馈回复" : "正在读取反馈内容",
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

function escapeMarkdownText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/([\[\]()`*_{}#+\-.!|>])/g, "\\$1");
}

function formatAttachmentSize(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function attachmentSectionMarkdown(attachments: FeedbackReferenceCardData["feedback"]["reportAttachments"]) {
  const visible = attachments.slice(0, visibleAttachmentLimit);
  const lines = visible.map((attachment) => `- ${escapeMarkdownText(attachment.fileName)} (${formatAttachmentSize(attachment.fileSize)})`);
  if (attachments.length > visible.length) {
    lines.push(`- 还有 ${attachments.length - visible.length} 个附件`);
  }
  return lines.join("\n");
}

function addAttachmentSection(
  blocks: ChatReferenceCardBodyBlock[],
  attachments: FeedbackReferenceCardData["feedback"]["reportAttachments"],
) {
  if (attachments.length === 0) return;
  blocks.push({
    bodyMarkdown: attachmentSectionMarkdown(attachments),
    title: "附件",
    type: "section",
  });
}

function feedbackReferenceBodyBlocks(
  reference: FeedbackNotificationCardReferenceV1,
  data: FeedbackReferenceCardData,
): ChatReferenceCardBodyBlock[] {
  const blocks: ChatReferenceCardBodyBlock[] = [];
  if (reference.kind === "comment") {
    const body = data.comment?.body.trim();
    if (body) {
      blocks.push({ bodyMarkdown: body, title: "回复内容", type: "section" });
    }
    addAttachmentSection(blocks, data.comment?.attachments ?? []);
    return blocks;
  }

  const description = data.feedback.description.trim();
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
