import type { ChatMessage } from "../types/orf";
import { orfRichTextMarkdownToPlainText } from "../features/rich-text/orfRichTextMarkdown";

export function chatNotificationPreviewText(message: Pick<ChatMessage, "attachments" | "body">) {
  const text = stripChatNotificationMarkdown(message.body);
  if (text) return truncateChatNotificationText(text, 100);
  if (message.attachments.length === 0) return "发送了一条消息";
  if (message.attachments.length > 1) return `发送了 ${message.attachments.length} 个附件`;
  const [attachment] = message.attachments;
  if (attachment?.previewKind === "image") return "发送了一张图片";
  if (attachment?.previewKind === "video") return "发送了一个视频";
  return "发送了一个文件";
}

export function stripChatNotificationMarkdown(body: string) {
  return orfRichTextMarkdownToPlainText(body, { attachmentText: "" });
}

function truncateChatNotificationText(text: string, limit: number) {
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}
