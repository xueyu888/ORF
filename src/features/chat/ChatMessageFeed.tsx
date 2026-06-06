import { CheckCheck, ChevronDown, Loader2 } from "lucide-react";
import type { RefObject } from "react";
import type { ChatAttachment, ChatMessage, ChatUser } from "../../types/orf";
import { formatDay } from "./chatFormat";
import { shouldCompactChatMessage } from "./chatMessagePresentation";
import { resolveUnreadJumpTarget, type ChatUnreadJumpTarget, type UnreadAnchor } from "./chatModels";
import { ChatMessageItem } from "./ChatMessageItem";

type ChatMessageFeedProps = {
  canPin: boolean;
  currentUserId?: string;
  editingMessageId?: string | null;
  focusMessageId: string | null;
  hasNewerMessages: boolean;
  hasOlderMessages: boolean;
  loadingMessages: boolean;
  loadingOlderMessages: boolean;
  mentionableUsers: ChatUser[];
  messages: ChatMessage[];
  onAttachmentPreview: (attachment: ChatAttachment) => void;
  onCancelEdit: () => void;
  onClearUnread: () => void;
  onCopyLink: (message: ChatMessage) => void;
  onDelete: (message: ChatMessage) => void;
  onEdit: (message: ChatMessage) => void;
  onJumpUnread: (target: ChatUnreadJumpTarget) => void;
  onLoadLatest: () => void;
  onLoadOlder: () => void;
  onMarkUnread: (message: ChatMessage) => void;
  onPin: (message: ChatMessage) => void;
  onReaction: (message: ChatMessage, emojiName: string) => void;
  onSave: (message: ChatMessage) => void;
  onSaveEdit: (message: ChatMessage, body: string) => Promise<void>;
  onScroll: () => void;
  onThread: (rootMessageId: string) => void;
  pendingNewMessageCount: number;
  scrollRef: RefObject<HTMLDivElement | null>;
  unreadAnchor: UnreadAnchor | null;
  usersById: Map<string, ChatUser>;
};

type MessageListProps = Omit<
  ChatMessageFeedProps,
  "hasNewerMessages" | "loadingMessages" | "onLoadLatest" | "onScroll" | "pendingNewMessageCount" | "scrollRef"
>;

export function ChatMessageFeed({
  canPin,
  currentUserId,
  editingMessageId,
  focusMessageId,
  hasNewerMessages,
  hasOlderMessages,
  loadingMessages,
  loadingOlderMessages,
  mentionableUsers,
  messages,
  onAttachmentPreview,
  onCancelEdit,
  onClearUnread,
  onCopyLink,
  onDelete,
  onEdit,
  onJumpUnread,
  onLoadLatest,
  onLoadOlder,
  onMarkUnread,
  onPin,
  onReaction,
  onSave,
  onSaveEdit,
  onScroll,
  onThread,
  pendingNewMessageCount,
  scrollRef,
  unreadAnchor,
  usersById,
}: ChatMessageFeedProps) {
  return (
    <div className="orf-chat-message-scroll" ref={scrollRef} onScroll={onScroll}>
      {loadingMessages && messages.length > 0 && (
        <div className="orf-chat-message-loading-chip" role="status">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>同步消息</span>
        </div>
      )}
      {loadingMessages && messages.length === 0 ? (
        <div className="orf-chat-message-loading"><Loader2 className="h-5 w-5 animate-spin" /> 加载消息</div>
      ) : (
        <MessageList
          canPin={canPin}
          currentUserId={currentUserId}
          editingMessageId={editingMessageId}
          focusMessageId={focusMessageId}
          hasOlderMessages={hasOlderMessages}
          loadingOlderMessages={loadingOlderMessages}
          mentionableUsers={mentionableUsers}
          messages={messages}
          onAttachmentPreview={onAttachmentPreview}
          onCancelEdit={onCancelEdit}
          onClearUnread={onClearUnread}
          onCopyLink={onCopyLink}
          onDelete={onDelete}
          onEdit={onEdit}
          onJumpUnread={onJumpUnread}
          onLoadOlder={onLoadOlder}
          onMarkUnread={onMarkUnread}
          onPin={onPin}
          onReaction={onReaction}
          onSave={onSave}
          onSaveEdit={onSaveEdit}
          onThread={onThread}
          unreadAnchor={unreadAnchor}
          usersById={usersById}
        />
      )}
      {pendingNewMessageCount > 0 && (
        <button className="orf-chat-scroll-latest" type="button" onClick={onLoadLatest}>
          <ChevronDown className="h-4 w-4" />
          {pendingNewMessageCount} 条新消息
        </button>
      )}
      {hasNewerMessages && pendingNewMessageCount === 0 && (
        <button className="orf-chat-scroll-latest" type="button" onClick={onLoadLatest}>
          <ChevronDown className="h-4 w-4" />
          回到最新
        </button>
      )}
    </div>
  );
}

function MessageList({
  onAttachmentPreview,
  canPin,
  currentUserId,
  editingMessageId,
  focusMessageId,
  hasOlderMessages,
  loadingOlderMessages,
  mentionableUsers,
  messages,
  onCopyLink,
  onCancelEdit,
  onClearUnread,
  onDelete,
  onEdit,
  onJumpUnread,
  onLoadOlder,
  onMarkUnread,
  onPin,
  onReaction,
  onSave,
  onSaveEdit,
  onThread,
  usersById,
  unreadAnchor,
}: MessageListProps) {
  if (messages.length === 0) {
    return <div className="orf-chat-message-empty">这里还没有消息。</div>;
  }
  let lastDay = "";
  const unreadTarget = resolveUnreadJumpTarget({ currentUserId, hasOlderMessages, messages, unreadAnchor });
  const unreadDividerIndex = unreadTarget?.dividerIndex ?? -1;
  const unreadMessageId = unreadTarget?.messageId ?? null;
  return (
    <div className="orf-chat-message-list">
      {unreadTarget && (
        <div className="orf-chat-unread-controls">
          <button className="orf-chat-unread-jump" type="button" onClick={() => onJumpUnread(unreadTarget.jumpTarget)}>
            <ChevronDown className="h-4 w-4" />
            跳到未读
          </button>
          <button className="orf-chat-unread-clear" type="button" onClick={onClearUnread}>
            <CheckCheck className="h-4 w-4" />
            标记已读
          </button>
        </div>
      )}
      {hasOlderMessages && (
        <button className="orf-chat-load-older" disabled={loadingOlderMessages} type="button" onClick={onLoadOlder}>
          {loadingOlderMessages ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronDown className="h-4 w-4" />}
          加载更早消息
        </button>
      )}
      {messages.map((message, index) => {
        const day = formatDay(message.createdAt);
        const showDay = day !== lastDay;
        lastDay = day;
        const compact = !showDay && unreadDividerIndex !== index && shouldCompactChatMessage(messages[index - 1], message);
        return (
          <div key={message.id}>
            {showDay && <div className="orf-chat-day-divider"><span>{day}</span></div>}
            {unreadDividerIndex === index && (
              <div className="orf-chat-unread-divider" id="orf-chat-unread-divider">
                <span>新消息</span>
              </div>
            )}
            <ChatMessageItem
              canPin={canPin}
              compact={compact}
              currentUserId={currentUserId}
              editing={editingMessageId === message.id}
              firstUnread={unreadMessageId === message.id}
              focused={focusMessageId === message.id}
              mentionableUsers={mentionableUsers}
              message={message}
              onAttachmentPreview={onAttachmentPreview}
              onCancelEdit={onCancelEdit}
              onCopyLink={onCopyLink}
              onDelete={onDelete}
              onEdit={onEdit}
              onMarkUnread={onMarkUnread}
              onPin={onPin}
              onReaction={onReaction}
              onSave={onSave}
              onSaveEdit={onSaveEdit}
              onThread={onThread}
              usersById={usersById}
            />
          </div>
        );
      })}
    </div>
  );
}
