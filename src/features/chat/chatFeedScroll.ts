const chatFeedLatestThresholdPx = 160;
const chatFeedUnreadOffsetPx = 48;

type ChatFeedScrollOptions = {
  behavior?: ScrollBehavior;
  block?: "center" | "start";
  offset?: number;
};

export function isChatFeedNearLatest(element: HTMLElement | null, threshold = chatFeedLatestThresholdPx) {
  if (!element) return true;
  return element.scrollHeight - element.scrollTop - element.clientHeight < threshold;
}

export function scrollChatFeedToLatest(element: HTMLElement | null, behavior: ScrollBehavior = "smooth") {
  if (!element) return false;
  element.scrollTo({ top: element.scrollHeight, behavior });
  return true;
}

export function scrollChatFeedToMessage(
  element: HTMLElement | null,
  messageId: string,
  options: ChatFeedScrollOptions = {},
) {
  if (!element) return false;
  const target = Array.from(element.querySelectorAll<HTMLElement>("[data-chat-message-id]"))
    .find((item) => item.dataset.chatMessageId === messageId) ?? null;
  return scrollChatFeedToElement(element, target, options);
}

export function scrollChatFeedToUnread(element: HTMLElement | null, options: ChatFeedScrollOptions = {}) {
  if (!element) return false;
  const target =
    element.querySelector<HTMLElement>("#orf-chat-unread-divider") ??
    element.querySelector<HTMLElement>("[data-chat-unread-message='true']");
  return scrollChatFeedToElement(element, target, { offset: chatFeedUnreadOffsetPx, ...options });
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
  element.scrollTo({ top: Math.max(0, nextTop), behavior });
  return true;
}
