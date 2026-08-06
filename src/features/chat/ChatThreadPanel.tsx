import { Bell, BellOff } from "lucide-react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { ChatMessage, ChatThread, ChatUser, Feedback } from "../../types/orf";
import { ChatComposer } from "./ChatComposer";
import { ChatMessageItem } from "./ChatMessageItem";
import type { AppAttentionState } from "../interaction/appAttentionState";
import type { ChatAttachmentPreviewHandler } from "./chatAttachmentPreview";
import type { ChatDriveResourceLinkTarget } from "./chatDriveResourceLinks";
import { scrollChatFeedToMessage } from "./chatFeedScroll";
import { shouldCompactChatMessage } from "./chatMessagePresentation";
import { chatMessageSendStatus, type ChatSendHandler } from "./chatModels";
import { useChatLatestScrollStickiness } from "./useChatLatestScrollStickiness";

type ChatThreadPanelProps = {
  appAttentionState: AppAttentionState;
  attachmentMaxBytes: number;
  canDeleteAnyMessage: boolean;
  canPin: boolean;
  currentUserId?: string;
  editingMessageId?: string | null;
  feedbackItems?: readonly Pick<Feedback, "id" | "phenomenon">[];
  focusMessageId: string | null;
  composerFocusSignal?: number;
  onAttachmentPreview: ChatAttachmentPreviewHandler;
  onCancelEdit: () => void;
  onCopyLink: (message: ChatMessage) => void;
  onCopyMessage: (message: ChatMessage) => void;
  onDelete: (message: ChatMessage) => void;
  onDriveResourceLink?: (target: ChatDriveResourceLinkTarget) => void;
  onDraftStateChange: (channelId: string, hasDraft: boolean) => void;
  onEdit: (message: ChatMessage) => void;
  onMarkUnread: (message: ChatMessage) => void;
  onPin: (message: ChatMessage) => void;
  onReaction: (message: ChatMessage, emojiName: string) => void;
  onRemovePending: (message: ChatMessage) => void;
  onRequestAcknowledgement: (message: ChatMessage) => void;
  onRetryPending: (message: ChatMessage) => void;
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
  appAttentionState,
  attachmentMaxBytes,
  onAttachmentPreview,
  canDeleteAnyMessage,
  canPin,
  currentUserId,
  editingMessageId,
  feedbackItems,
  focusMessageId,
  composerFocusSignal,
  onCancelEdit,
  onCopyLink,
  onCopyMessage,
  onDelete,
  onDriveResourceLink,
  onDraftStateChange,
  onEdit,
  onMarkUnread,
  onPin,
  onReaction,
  onRemovePending,
  onRequestAcknowledgement,
  onRetryPending,
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
  const previousThreadIdRef = useRef<string | null>(null);
  const previousReplyCountRef = useRef(0);
  const [reactionPickerRequest, setReactionPickerRequest] = useState<{ messageId: string | null; signal: number }>({
    messageId: null,
    signal: 0,
  });
  const {
    handleScroll: handleThreadStickinessScroll,
    isFollowingLatest,
    requestScrollToLatest,
    runProgrammaticScroll,
    setFollowingLatest,
  } = useChatLatestScrollStickiness({
    appAttentionState,
    contentSelector: "[data-chat-message-id], .orf-chat-thread-replies",
    scrollKey: `${thread.rootMessage.id}:${thread.replies.length}:${focusMessageId ?? ""}`,
    scrollRef: threadPanelRef,
  });
  const editLatestOwnThreadMessage = useCallback(() => {
    const latestOwnMessage = [thread.rootMessage, ...thread.replies]
      .reverse()
      .find((message) => (
        message.authorUserId === currentUserId &&
        !message.deletedAt &&
        !chatMessageSendStatus(message)
      ));
    if (latestOwnMessage) {
      onEdit(latestOwnMessage);
    }
  }, [currentUserId, onEdit, thread.replies, thread.rootMessage]);
  const reactToLatestThreadMessage = useCallback(() => {
    const latestMessage = [thread.rootMessage, ...thread.replies]
      .reverse()
      .find((message) => !message.deletedAt && !chatMessageSendStatus(message));
    if (!latestMessage) return;
    runProgrammaticScroll(
      "reaction-target",
      () => scrollChatFeedToMessage(threadPanelRef.current, latestMessage.id, { behavior: "auto", block: "center" }),
      "auto",
    );
    window.requestAnimationFrame(() => {
      setReactionPickerRequest((current) => ({
        messageId: latestMessage.id,
        signal: current.signal + 1,
      }));
    });
  }, [runProgrammaticScroll, thread.replies, thread.rootMessage]);

  useLayoutEffect(() => {
    const previousThreadId = previousThreadIdRef.current;
    const previousReplyCount = previousReplyCountRef.current;
    const isNewThread = previousThreadId !== thread.rootMessage.id;
    const replyAdded = !isNewThread && thread.replies.length > previousReplyCount;
    const lastReply = thread.replies.at(-1);
    const shouldFollowReply = replyAdded && (isFollowingLatest() || lastReply?.authorUserId === currentUserId);

    previousThreadIdRef.current = thread.rootMessage.id;
    previousReplyCountRef.current = thread.replies.length;

    if (!isNewThread && !focusMessageId && !shouldFollowReply) {
      return;
    }

    if (focusMessageId) {
      setFollowingLatest(false);
      window.requestAnimationFrame(() => {
        const element = threadPanelRef.current;
        if (!element) return;
        if (
          runProgrammaticScroll(
            "message",
            () => scrollChatFeedToMessage(element, focusMessageId, { behavior: "auto", offset: 20 }),
            "auto",
          )
        ) {
          return;
        }
        requestScrollToLatest("auto");
      });
      return;
    }

    requestScrollToLatest(isNewThread ? "auto" : "smooth");
  }, [
    currentUserId,
    focusMessageId,
    isFollowingLatest,
    requestScrollToLatest,
    runProgrammaticScroll,
    setFollowingLatest,
    thread.replies,
    thread.replies.length,
    thread.rootMessage.id,
  ]);

  return (
    <div className="orf-chat-thread-panel">
      <div
        className="orf-chat-thread-scroll"
        ref={threadPanelRef}
        onScroll={handleThreadStickinessScroll}
      >
        <ChatMessageItem
          canDeleteAnyMessage={canDeleteAnyMessage}
          canPin={canPin}
          currentUserId={currentUserId}
          editing={editingMessageId === thread.rootMessage.id}
          feedbackItems={feedbackItems}
          focused={focusMessageId === thread.rootMessage.id}
          mentionableUsers={users}
          message={thread.rootMessage}
          onAttachmentPreview={onAttachmentPreview}
          onCancelEdit={onCancelEdit}
          onCopyLink={onCopyLink}
          onCopyMessage={onCopyMessage}
          onDelete={onDelete}
          onDriveResourceLink={onDriveResourceLink}
          onEdit={onEdit}
          onMarkUnread={onMarkUnread}
          onPin={onPin}
          onReaction={onReaction}
          onRemovePending={onRemovePending}
          onRequestAcknowledgement={onRequestAcknowledgement}
          onRetryPending={onRetryPending}
          onSave={onSave}
          onSaveEdit={onSaveEdit}
          reactionPickerSignal={reactionPickerRequest.messageId === thread.rootMessage.id ? reactionPickerRequest.signal : undefined}
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
                canDeleteAnyMessage={canDeleteAnyMessage}
                canPin={canPin}
                compact={compact}
                currentUserId={currentUserId}
                editing={editingMessageId === reply.id}
                feedbackItems={feedbackItems}
                key={reply.id}
                focused={focusMessageId === reply.id}
                mentionableUsers={users}
                message={reply}
                onAttachmentPreview={onAttachmentPreview}
                onCancelEdit={onCancelEdit}
                onCopyLink={onCopyLink}
                onCopyMessage={onCopyMessage}
                onDelete={onDelete}
                onDriveResourceLink={onDriveResourceLink}
                onEdit={onEdit}
                onMarkUnread={onMarkUnread}
                onPin={onPin}
                onReaction={onReaction}
                onRemovePending={onRemovePending}
                onRequestAcknowledgement={onRequestAcknowledgement}
                onRetryPending={onRetryPending}
                onSave={onSave}
                onSaveEdit={onSaveEdit}
                reactionPickerSignal={reactionPickerRequest.messageId === reply.id ? reactionPickerRequest.signal : undefined}
                usersById={usersById}
              />
            );
          })}
        </div>
      </div>
      <ChatComposer
        attachmentMaxBytes={attachmentMaxBytes}
        channelId={thread.rootMessage.channelId}
        feedbackItems={feedbackItems}
        focusSignal={composerFocusSignal}
        mentionableUsers={users}
        onDraftStateChange={onDraftStateChange}
        onEditLatest={editLatestOwnThreadMessage}
        onReactToLatest={reactToLatestThreadMessage}
        onSend={onSend}
        onTyping={onTyping}
        parentMessageId={thread.replies.at(-1)?.id ?? thread.rootMessage.id}
        rootMessageId={thread.rootMessage.id}
      />
    </div>
  );
}
