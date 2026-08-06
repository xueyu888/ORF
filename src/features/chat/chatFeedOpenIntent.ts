import type { UnreadAnchor } from "./chatModels";
import { hasMainFeedUnread } from "./chatModels";
import type { ChatFeedReadingPosition } from "./chatFeedReadingPosition";

export type ChatFeedOpenIntent =
  | { kind: "latest" }
  | { kind: "message"; messageId: string }
  | { kind: "restore"; position: ChatFeedReadingPosition }
  | { anchor: UnreadAnchor; kind: "unread" };

export function resolveChatFeedOpenIntent(input: {
  readingPosition: ChatFeedReadingPosition | null;
  requestedMessageId: string | null;
  unreadAnchor: UnreadAnchor | null;
}): ChatFeedOpenIntent {
  if (input.requestedMessageId) {
    return { kind: "message", messageId: input.requestedMessageId };
  }
  if (hasMainFeedUnread(input.unreadAnchor)) {
    return { anchor: input.unreadAnchor, kind: "unread" };
  }
  if (input.readingPosition) {
    return { kind: "restore", position: input.readingPosition };
  }
  return { kind: "latest" };
}
