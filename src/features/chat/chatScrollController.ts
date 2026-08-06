export const chatScrollProgrammaticAutoSettleFrames = 2;
export const chatScrollProgrammaticSmoothSettleMs = 360;
export const chatScrollUserIntentTrustMs = 1_200;
export const chatScrollUserScrollKeys = new Set(["ArrowDown", "ArrowUp", "End", "Home", "PageDown", "PageUp", " "]);

export type ChatScrollCommandKind =
  | "layout-correction"
  | "latest"
  | "message"
  | "reading-position"
  | "reaction-target"
  | "unread";

export type ChatScrollEventSource = "ambient" | "programmatic" | "user";

export type ChatScrollEventClassificationInput = {
  activelyViewed: boolean;
  now: number;
  programmatic: boolean;
  userIntentUntil: number;
};

export function hasRecentChatScrollUserIntent(now: number, userIntentUntil: number) {
  return now <= userIntentUntil;
}

export function classifyChatScrollEvent(input: ChatScrollEventClassificationInput): ChatScrollEventSource {
  if (input.programmatic) return "programmatic";
  if (!input.activelyViewed) return "ambient";
  return hasRecentChatScrollUserIntent(input.now, input.userIntentUntil) ? "user" : "ambient";
}

export function shouldRecordChatFeedReadingPosition(source: ChatScrollEventSource) {
  return source === "user";
}
