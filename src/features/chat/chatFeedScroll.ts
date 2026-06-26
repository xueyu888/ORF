const chatFeedLatestThresholdPx = 160;
const chatFeedOldestThresholdPx = 220;
const chatFeedUnreadOffsetPx = 48;

type ChatFeedScrollOptions = {
  behavior?: ScrollBehavior;
  block?: "center" | "start";
  offset?: number;
};

export type ChatFeedScrollAnchor = {
  messageId: string;
  offsetTop: number;
};

export function isChatFeedNearLatest(element: HTMLElement | null, threshold = chatFeedLatestThresholdPx) {
  if (!element) return true;
  return element.scrollHeight - element.scrollTop - element.clientHeight < threshold;
}

export function isChatFeedNearOldest(element: HTMLElement | null, threshold = chatFeedOldestThresholdPx) {
  if (!element) return false;
  return element.scrollTop < threshold;
}

export function scrollChatFeedToLatest(element: HTMLElement | null, behavior: ScrollBehavior = "smooth") {
  if (!element) return false;
  setChatFeedScrollTop(element, element.scrollHeight, behavior);
  return true;
}

export function scrollChatFeedToMessage(
  element: HTMLElement | null,
  messageId: string,
  options: ChatFeedScrollOptions = {},
) {
  if (!element) return false;
  const target = findChatFeedMessageElement(element, messageId);
  return scrollChatFeedToElement(element, target, options);
}

export function isChatFeedMessageVisible(element: HTMLElement | null, messageId: string, margin = 24) {
  if (!element) return false;
  const target = findChatFeedMessageElement(element, messageId);
  if (!target) return false;
  const elementRect = element.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  return targetRect.bottom > elementRect.top + margin && targetRect.top < elementRect.bottom - margin;
}

export function scrollChatFeedToUnread(element: HTMLElement | null, options: ChatFeedScrollOptions = {}) {
  if (!element) return false;
  const target =
    element.querySelector<HTMLElement>("#orf-chat-unread-divider") ??
    element.querySelector<HTMLElement>("[data-chat-unread-message='true']");
  return scrollChatFeedToElement(element, target, { offset: chatFeedUnreadOffsetPx, ...options });
}

export function readChatFeedScrollAnchor(element: HTMLElement | null): ChatFeedScrollAnchor | null {
  if (!element) return null;
  const elementRect = element.getBoundingClientRect();
  const messages = Array.from(element.querySelectorAll<HTMLElement>("[data-chat-message-id]"));
  for (const message of messages) {
    const rect = message.getBoundingClientRect();
    if (rect.bottom >= elementRect.top) {
      const messageId = message.dataset.chatMessageId;
      return messageId ? { messageId, offsetTop: rect.top - elementRect.top } : null;
    }
  }
  return null;
}

export function restoreChatFeedScrollAnchor(element: HTMLElement | null, anchor: ChatFeedScrollAnchor | null) {
  if (!element || !anchor) return false;
  const target = Array.from(element.querySelectorAll<HTMLElement>("[data-chat-message-id]"))
    .find((item) => item.dataset.chatMessageId === anchor.messageId) ?? null;
  if (!target) return false;
  const elementRect = element.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const targetTop = element.scrollTop + targetRect.top - elementRect.top;
  element.scrollTop = Math.max(0, targetTop - anchor.offsetTop);
  return true;
}

function scrollChatFeedToElement(
  element: HTMLElement,
  target: HTMLElement | null,
  options: ChatFeedScrollOptions,
) {
  if (!target) return false;
  const behavior = options.behavior ?? "smooth";
  const block = options.block ?? "start";
  const offset = options.offset ?? 0;
  const elementRect = element.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const targetTop = element.scrollTop + targetRect.top - elementRect.top;
  const nextTop = block === "center"
    ? targetTop - (element.clientHeight / 2) + (targetRect.height / 2)
    : targetTop - offset;
  setChatFeedScrollTop(element, Math.max(0, nextTop), behavior);
  return true;
}

function findChatFeedMessageElement(element: HTMLElement, messageId: string) {
  return Array.from(element.querySelectorAll<HTMLElement>("[data-chat-message-id]"))
    .find((item) => item.dataset.chatMessageId === messageId) ?? null;
}

function setChatFeedScrollTop(element: HTMLElement, top: number, behavior: ScrollBehavior) {
  if (behavior === "auto") {
    const previousScrollBehavior = element.style.scrollBehavior;
    element.style.scrollBehavior = "auto";
    element.scrollTop = top;
    element.scrollTo({ top, behavior: "auto" });
    window.requestAnimationFrame(() => {
      element.style.scrollBehavior = previousScrollBehavior;
    });
    return;
  }
  element.scrollTo({ top, behavior });
}
