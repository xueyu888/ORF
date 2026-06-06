import { Bell, BellOff } from "lucide-react";
import { useEffect, useRef } from "react";
import type { ChatAttachment, ChatMessage, ChatThread, ChatUser } from "../../types/orf";
import { ChatComposer } from "./ChatComposer";
import { ChatMessageItem } from "./ChatMessageItem";
import { scrollChatFeedToLatest, scrollChatFeedToMessage } from "./chatFeedScroll";
import { shouldCompactChatMessage } from "./chatMessagePresentation";
import type { ChatSendHandler } from "./chatModels";

type ChatThreadPanelProps = {
  canPin: boolean;
  currentUserId?: string;
  editingMessageId?: string | null;
  focusMessageId: string | null;
  onAttachmentPreview: (attachment: ChatAttachment) => void;
  onCancelEdit: () => void;
  onCopyLink: (message: ChatMessage) => void;
  onDelete: (message: ChatMessage) => void;
  onDraftStateChange: (channelId: string, hasDraft: boolean) => void;
  onEdit: (message: ChatMessage) => void;
  onMarkUnread: (message: ChatMessage) => void;
  onPin: (message: ChatMessage) => void;
  onReaction: (message: ChatMessage, emojiName: string) => void;
  onSave: (message: ChatMessage) => void;
  onSaveEdit: (message: ChatMessage, body: string) => Promise<void>;
  onSend: ChatSendHandler;
  onToggleFollow: (following: boolean) => void;
  onTyping: (channelId: string) => void;
  thread: ChatThread;
  users: ChatUser[];
  usersById: Map<string, ChatUser>;
};

export function ChatThreadPanel({
  onAttachmentPreview,
  canPin,
  currentUserId,
  editingMessageId,
  focusMessageId,
  onCancelEdit,
  onCopyLink,
  onDelete,
  onDraftStateChange,
  onEdit,
  onMarkUnread,
  onPin,
  onReaction,
  onSave,
  onSaveEdit,
  onSend,
  onToggleFollow,
  onTyping,
  thread,
  users,
  usersById,
}: ChatThreadPanelProps) {
  const threadPanelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    window.requestAnimationFrame(() => {
      const element = threadPanelRef.current;
      if (!element) return;
      if (focusMessageId) {
        if (scrollChatFeedToMessage(element, focusMessageId, { behavior: "smooth", offset: 20 })) return;
      }
      scrollChatFeedToLatest(element, "smooth");
    });
  }, [focusMessageId, thread.replies.length, thread.rootMessage.id]);

  return (
    <div className="orf-chat-thread-panel" ref={threadPanelRef}>
      <ChatMessageItem
        canPin={canPin}
        currentUserId={currentUserId}
        editing={editingMessageId === thread.rootMessage.id}
        focused={focusMessageId === thread.rootMessage.id}
        mentionableUsers={users}
        message={thread.rootMessage}
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
        onThread={() => undefined}
        usersById={usersById}
      />
      <button type="button" className="orf-chat-follow-button" onClick={() => onToggleFollow(!thread.following)}>
        {thread.following ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
        {thread.following ? "取消关注话题" : "关注话题"}
      </button>
      <div className="orf-chat-thread-replies">
        {thread.replies.map((reply, index) => {
          const compact = shouldCompactChatMessage(thread.replies[index - 1], reply);
          return (
            <ChatMessageItem
              canPin={canPin}
              compact={compact}
              currentUserId={currentUserId}
              editing={editingMessageId === reply.id}
              key={reply.id}
              focused={focusMessageId === reply.id}
              mentionableUsers={users}
              message={reply}
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
              onThread={() => undefined}
              usersById={usersById}
            />
          );
        })}
      </div>
      <ChatComposer
        channelId={thread.rootMessage.channelId}
        mentionableUsers={users}
        onDraftStateChange={onDraftStateChange}
        onSend={onSend}
        onTyping={onTyping}
        parentMessageId={thread.replies.at(-1)?.id ?? thread.rootMessage.id}
        rootMessageId={thread.rootMessage.id}
      />
    </div>
  );
}
