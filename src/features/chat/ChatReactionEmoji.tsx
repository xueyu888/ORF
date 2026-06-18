import { displayChatReactionEmoji, labelChatReactionEmoji } from "./chatReactions";

type ChatReactionEmojiSize = "inline" | "picker" | "quick" | "reaction";

type ChatReactionEmojiProps = {
  decorative?: boolean;
  emojiName: string;
  size: ChatReactionEmojiSize;
};

export function ChatReactionEmoji({ decorative = false, emojiName, size }: ChatReactionEmojiProps) {
  const label = labelChatReactionEmoji(emojiName);

  return (
    <span
      aria-hidden={decorative ? "true" : undefined}
      aria-label={decorative ? undefined : label}
      className={`orf-chat-emoji-symbol orf-chat-emoji-symbol-${size}`}
      role={decorative ? undefined : "img"}
    >
      {displayChatReactionEmoji(emojiName)}
    </span>
  );
}
