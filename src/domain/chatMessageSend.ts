export const CLIENT_CHAT_MESSAGE_ID_PATTERN = /^chat-message-client-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export type ChatMessageSendRequest = {
  attachmentIds?: string[];
  body: string;
  channelId: string;
  messageId?: string;
  parentMessageId?: string | null;
  requireAcknowledgement?: boolean;
  rootMessageId?: string | null;
};

export function createClientChatMessageId(): string {
  return `chat-message-client-${crypto.randomUUID()}`;
}
