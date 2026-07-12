export type ChatMessageNavigationTarget = {
  channelId: string;
  messageId: string;
  threadRootMessageId?: string | null;
};

export function chatMessageTargetPath(target: ChatMessageNavigationTarget) {
  const channelPath = `/chat/${encodeURIComponent(target.channelId)}`;
  const messageQuery = `message=${encodeURIComponent(target.messageId)}`;
  return target.threadRootMessageId
    ? `${channelPath}?thread=${encodeURIComponent(target.threadRootMessageId)}&${messageQuery}`
    : `${channelPath}?${messageQuery}`;
}
