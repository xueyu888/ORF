type ChatTypingLineProps = {
  typingByUser: Map<string, { userName: string }>;
};

export function ChatTypingLine({ typingByUser }: ChatTypingLineProps) {
  const names = Array.from(typingByUser.values()).map((typing) => typing.userName);
  return <div className="orf-chat-typing-line">{names.length > 0 ? `${names.join(", ")} 正在输入` : "\u00a0"}</div>;
}
