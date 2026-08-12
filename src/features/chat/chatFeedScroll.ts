const chatFeedLatestThresholdPx = 160;
const chatFeedLatestStickinessThresholdPx = 12;
const chatFeedOldestThresholdPx = 220;
const chatFeedUnreadOffsetPx = 48;

export type ChatFeedViewportMode = "browsingHistory" | "followingLatest";

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

export function isChatFeedAtLatest(element: HTMLElement | null, threshold = chatFeedLatestStickinessThresholdPx) {
  if (!element) return true;
  return element.scrollHeight - element.scrollTop - element.clientHeight <= threshold;
}

export function chatFeedViewportModeAfterScroll(input: {
  atLatest: boolean;
  currentMode: ChatFeedViewportMode;
  previousScrollTop: number;
  programmatic: boolean;
  scrollTop: number;
}): ChatFeedViewportMode {
  if (input.programmatic) return input.currentMode;
  if (input.scrollTop < input.previousScrollTop) return "browsingHistory";
  if (input.atLatest) return "followingLatest";
  return input.currentMode;
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

export function isChatFeedMessagePositioned(
  element: HTMLElement | null,
  messageId: string,
  options: ChatFeedScrollOptions = {},
  tolerance = 2,
) {
  if (!element) return false;
  const target = findChatFeedMessageElement(element, messageId);
  if (!target) return false;
  return isChatFeedElementPositioned(element, target, options, tolerance);
}

export function scrollChatFeedToUnread(element: HTMLElement | null, options: ChatFeedScrollOptions = {}) {
  if (!element) return false;
  const target =
    element.querySelector<HTMLElement>("#orf-chat-unread-divider") ??
    element.querySelector<HTMLElement>("[data-chat-unread-message='true']");
  return scrollChatFeedToElement(element, target, { offset: chatFeedUnreadOffsetPx, ...options });
}

export function isChatFeedUnreadPositioned(element: HTMLElement | null, tolerance = 2) {
  if (!element) return false;
  const target =
    element.querySelector<HTMLElement>("#orf-chat-unread-divider") ??
    element.querySelector<HTMLElement>("[data-chat-unread-message='true']");
  if (!target) return false;
  return isChatFeedElementPositioned(element, target, { offset: chatFeedUnreadOffsetPx }, tolerance);
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
  setChatFeedScrollTopInstant(element, Math.max(0, targetTop - anchor.offsetTop));
  return true;
}

function scrollChatFeedToElement(
  element: HTMLElement,
  target: HTMLElement | null,
  options: ChatFeedScrollOptions,
) {
  if (!target) return false;
  const behavior = options.behavior ?? "smooth";
  const nextTop = chatFeedScrollTopForElement(element, target, options);
  setChatFeedScrollTop(element, nextTop, behavior);
  return true;
}

function chatFeedScrollTopForElement(
  element: HTMLElement,
  target: HTMLElement,
  options: ChatFeedScrollOptions,
) {
  const block = options.block ?? "start";
  const offset = options.offset ?? 0;
  const elementRect = element.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const targetTop = element.scrollTop + targetRect.top - elementRect.top;
  const intendedTop = block === "center"
    ? targetTop - (element.clientHeight / 2) + (targetRect.height / 2)
    : targetTop - offset;
  const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
  return Math.min(maxScrollTop, Math.max(0, intendedTop));
}

function isChatFeedElementPositioned(
  element: HTMLElement,
  target: HTMLElement,
  options: ChatFeedScrollOptions,
  tolerance: number,
) {
  return Math.abs(element.scrollTop - chatFeedScrollTopForElement(element, target, options)) <= tolerance;
}

function findChatFeedMessageElement(element: HTMLElement, messageId: string) {
  return Array.from(element.querySelectorAll<HTMLElement>("[data-chat-message-id]"))
    .find((item) => item.dataset.chatMessageId === messageId) ?? null;
}

export function setChatFeedScrollTopInstant(element: HTMLElement, top: number) {
  const previousScrollBehavior = element.style.scrollBehavior;
  element.style.scrollBehavior = "auto";
  element.scrollTop = top;
  element.scrollTo({ top, behavior: "auto" });
  element.style.scrollBehavior = previousScrollBehavior;
}

function setChatFeedScrollTop(element: HTMLElement, top: number, behavior: ScrollBehavior) {
  if (behavior === "auto") {
    setChatFeedScrollTopInstant(element, top);
    return;
  }
  element.scrollTo({ top, behavior });
}
