import type { ChatMessage } from "../../types/orf";
import type { UnreadAnchor } from "./chatModels";

export const chatReadReceiptStableMs = 1000;
export const chatReadReceiptVisibleRatio = 0.5;

type ChatReadThroughCandidateInput = {
  container: HTMLElement | null;
  currentUserId?: string;
  messages: ChatMessage[];
  minVisibleRatio?: number;
  unreadAnchor: UnreadAnchor | null;
};

export function isChatMessageUnreadForAnchor(message: ChatMessage, unreadAnchor: UnreadAnchor | null, currentUserId?: string) {
  if (!unreadAnchor || message.rootMessageId || message.deletedAt || message.id.startsWith("pending-")) return false;
  if (unreadAnchor.lastReadAt && message.createdAt <= unreadAnchor.lastReadAt) return false;
  return unreadAnchor.manuallyUnread || message.authorUserId !== currentUserId;
}

export function chatMessageVisibleRatio(container: HTMLElement, messageElement: HTMLElement) {
  const containerRect = container.getBoundingClientRect();
  const messageRect = messageElement.getBoundingClientRect();
  if (containerRect.height <= 0 || messageRect.height <= 0) return 0;

  const visibleHeight = Math.min(containerRect.bottom, messageRect.bottom) - Math.max(containerRect.top, messageRect.top);
  if (visibleHeight <= 0) return 0;

  return visibleHeight / Math.min(containerRect.height, messageRect.height);
}

export function selectChatReadThroughCandidate({
  container,
  currentUserId,
  messages,
  minVisibleRatio = chatReadReceiptVisibleRatio,
  unreadAnchor,
}: ChatReadThroughCandidateInput) {
  if (!container || !unreadAnchor) return null;

  const elementsByMessageId = new Map<string, HTMLElement>();
  for (const element of Array.from(container.querySelectorAll<HTMLElement>("[data-chat-message-id]"))) {
    const messageId = element.dataset.chatMessageId;
    if (messageId) elementsByMessageId.set(messageId, element);
  }

  let candidate: ChatMessage | null = null;
  for (const message of messages) {
    if (!isChatMessageUnreadForAnchor(message, unreadAnchor, currentUserId)) continue;
    const element = elementsByMessageId.get(message.id);
    if (!element) continue;
    if (chatMessageVisibleRatio(container, element) >= minVisibleRatio) {
      candidate = message;
    }
  }

  return candidate;
}
