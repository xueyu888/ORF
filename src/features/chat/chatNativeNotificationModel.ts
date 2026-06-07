import type { ChatChannel, ChatMessage } from "../../types/orf";
import type { ChatRealtimeEvent } from "../../types/realtime";
import { currentMembership } from "./chatModels";

export type ChatNativeNotificationSkipReason =
  | "active_channel"
  | "active_thread"
  | "channel_muted"
  | "message_deleted"
  | "missing_channel"
  | "missing_current_user"
  | "missing_member"
  | "missing_message"
  | "not_message_created"
  | "own_message";

export type ChatNativeNotificationFocusState = {
  activeChannelId?: string | null;
  activeThreadRootMessageId?: string | null;
  appFocused: boolean;
};

export type ChatNativeNotificationPayload = {
  body: string;
  channelId: string;
  createdAt: string;
  id: string;
  messageId: string;
  targetPath: string;
  title: string;
};

export type ChatNativeNotificationDecision =
  | { action: "notify"; notification: ChatNativeNotificationPayload }
  | { action: "skip"; reason: ChatNativeNotificationSkipReason };

export function buildChatNativeNotificationDecision(input: {
  currentUserId?: string | null;
  event: ChatRealtimeEvent;
  focus: ChatNativeNotificationFocusState;
}): ChatNativeNotificationDecision {
  const { currentUserId, event, focus } = input;
  if (event.eventType !== "message.created") return { action: "skip", reason: "not_message_created" };
  if (!currentUserId) return { action: "skip", reason: "missing_current_user" };
  if (!event.message) return { action: "skip", reason: "missing_message" };
  if (!event.channel) return { action: "skip", reason: "missing_channel" };

  const { channel, message } = event;
  if (message.authorUserId === currentUserId) return { action: "skip", reason: "own_message" };
  if (message.deletedAt) return { action: "skip", reason: "message_deleted" };

  const membership = currentMembership(channel, currentUserId);
  if (!membership) return { action: "skip", reason: "missing_member" };
  if (membership.muted) return { action: "skip", reason: "channel_muted" };

  if (shouldSuppressChatNotificationForActiveView(message, focus)) {
    return { action: "skip", reason: message.rootMessageId ? "active_thread" : "active_channel" };
  }

  return {
    action: "notify",
    notification: {
      body: chatNotificationBody(channel, message),
      channelId: channel.id,
      createdAt: event.createdAt,
      id: event.id,
      messageId: message.id,
      targetPath: chatNotificationTargetPath(message),
      title: chatNotificationTitle(channel, message),
    },
  };
}

function shouldSuppressChatNotificationForActiveView(message: ChatMessage, focus: ChatNativeNotificationFocusState) {
  if (!focus.appFocused) return false;
  if (message.rootMessageId) {
    return focus.activeThreadRootMessageId === message.rootMessageId;
  }
  return focus.activeChannelId === message.channelId;
}

function chatNotificationTargetPath(message: ChatMessage) {
  return `/chat/${encodeURIComponent(message.channelId)}?message=${encodeURIComponent(message.id)}`;
}

function chatNotificationTitle(channel: ChatChannel, message: ChatMessage) {
  const baseTitle = channel.type === "direct" ? message.authorName : channel.displayName || "聊天";
  return message.rootMessageId ? `回复：${baseTitle}` : baseTitle;
}

function chatNotificationBody(channel: ChatChannel, message: ChatMessage) {
  const preview = chatNotificationPreviewText(message);
  return channel.type === "direct" ? preview : `${message.authorName}: ${preview}`;
}

export function chatNotificationPreviewText(message: Pick<ChatMessage, "attachments" | "body">) {
  const text = stripChatNotificationMarkdown(message.body);
  if (text) return truncateChatNotificationText(text, 100);
  if (message.attachments.length === 0) return "发送了一条消息";
  if (message.attachments.length > 1) return `发送了 ${message.attachments.length} 个附件`;
  return message.attachments[0]?.mimeType.startsWith("image/") ? "发送了一张图片" : "发送了一个文件";
}

export function stripChatNotificationMarkdown(body: string) {
  return body
    .replace(/\r\n?/g, "\n")
    .replace(/@\[([^\]\n]+)\]\(orf-user:[^)]+\)/g, "@$1")
    .replace(/!\[([^\]\n]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]\n]+)\]\([^)]+\)/g, "$1")
    .replace(/^```[^\n]*\n?/gm, "")
    .replace(/```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/[ \t\n]+/g, " ")
    .trim();
}

function truncateChatNotificationText(text: string, limit: number) {
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}
