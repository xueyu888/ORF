import { clsx } from "clsx";
import { Bookmark, Edit3, EyeOff, FileText, Link as LinkIcon, Loader2, Pin, Reply, RotateCcw, Smile, Trash2, X } from "lucide-react";
import { type KeyboardEvent, type MouseEvent, useEffect, useRef, useState } from "react";
import { Avatar, IconButton } from "../../components/ui";
import type { ChatAttachment, ChatMessage, ChatUser } from "../../types/orf";
import { formatDateTime, formatFileSize, formatTime } from "./chatFormat";
import { ChatMarkdown } from "./chatMarkdown";
import { ChatReactionPicker } from "./ChatReactionPicker";
import { canonicalChatReactionName, displayChatReactionEmoji, labelChatReactionEmoji, preferredReactionName, quickChatReactionOptions } from "./chatReactions";
import { ChatDraftEditor } from "./ChatDraftEditor";
import { chatMessageDeliveryStatus, draftFromStoredBody, serializeDraft, type ChatDraft } from "./chatModels";
import type { ChatOpenThreadOptions } from "./useChatThreadState";

type ChatMessageItemProps = {
  canPin?: boolean;
  compact?: boolean;
  currentUserId?: string;
  editing?: boolean;
  firstUnread?: boolean;
  focused?: boolean;
  mentionableUsers: ChatUser[];
  message: ChatMessage;
  onAttachmentPreview: (attachment: ChatAttachment) => void;
  onCancelEdit: () => void;
  onCopyLink: (message: ChatMessage) => void;
  onDelete: (message: ChatMessage) => void;
  onEdit: (message: ChatMessage) => void;
  onMarkUnread?: (message: ChatMessage) => void;
  onPin?: (message: ChatMessage) => void;
  onReaction: (message: ChatMessage, emojiName: string) => void;
  onRemovePending?: (message: ChatMessage) => void;
  onRetryPending?: (message: ChatMessage) => void;
  onSave?: (message: ChatMessage) => void;
  onSaveEdit: (message: ChatMessage, body: string) => Promise<void>;
  onThread: (rootMessageId: string, options?: ChatOpenThreadOptions) => void;
  reactionPickerSignal?: number;
  usersById: Map<string, ChatUser>;
};

function isInteractiveMessageTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest([
    "button",
    "a",
    "input",
    "label",
    "select",
    "textarea",
    "[role='button']",
    ".orf-chat-message-actions",
    ".orf-chat-reaction-row",
  ].join(", ")));
}

function hasSelectedMessageText(container: HTMLElement) {
  const selection = window.getSelection?.();
  if (!selection || selection.isCollapsed) return false;
  const { anchorNode, focusNode } = selection;
  return Boolean(
    (anchorNode && container.contains(anchorNode)) ||
    (focusNode && container.contains(focusNode)),
  );
}

function AttachmentGrid({
  attachments,
  onAttachmentPreview,
}: {
  attachments: ChatAttachment[];
  onAttachmentPreview: (attachment: ChatAttachment) => void;
}) {
  if (attachments.length === 0) return null;
  return (
    <div className="orf-chat-attachments">
      {attachments.map((attachment) => {
        const isImage = attachment.mimeType.startsWith("image/");
        return isImage ? (
          <button type="button" className="orf-chat-image-attachment" key={attachment.id} onClick={() => onAttachmentPreview(attachment)}>
            <img src={attachment.contentUrl} alt={attachment.fileName} loading="lazy" />
            <span>{attachment.fileName}</span>
          </button>
        ) : (
          <button type="button" className="orf-chat-file-attachment" key={attachment.id} onClick={() => onAttachmentPreview(attachment)}>
            <FileText className="h-5 w-5" />
            <span>{attachment.fileName}</span>
            <small>{formatFileSize(attachment.fileSize)}</small>
          </button>
        );
      })}
    </div>
  );
}

export function ChatMessageItem({
  onAttachmentPreview,
  canPin,
  compact,
  currentUserId,
  editing,
  firstUnread,
  focused,
  mentionableUsers,
  message,
  onCancelEdit,
  onCopyLink,
  onDelete,
  onEdit,
  onMarkUnread,
  onPin,
  onReaction,
  onRemovePending,
  onRetryPending,
  onSave,
  onSaveEdit,
  onThread,
  reactionPickerSignal,
  usersById,
}: ChatMessageItemProps) {
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [editDraft, setEditDraft] = useState<ChatDraft>(() => draftFromStoredBody(message.body, usersById));
  const [editSaving, setEditSaving] = useState(false);
  const emojiAnchorRef = useRef<HTMLDivElement | null>(null);
  const deliveryStatus = chatMessageDeliveryStatus(message);
  const canMutate = !deliveryStatus && message.authorUserId === currentUserId && !message.deletedAt;
  const canUseServerActions = !deliveryStatus && !message.deletedAt;
  const reactedByCurrentUser = new Set(
    message.reactions
      .filter((reaction) => reaction.reactedByCurrentUser)
      .map((reaction) => canonicalChatReactionName(reaction.emojiName)),
  );

  useEffect(() => {
    if (!editing) return;
    setEditDraft(draftFromStoredBody(message.body, usersById));
    setEditSaving(false);
  }, [editing, message.body, message.id, usersById]);

  useEffect(() => {
    if (!reactionPickerSignal || !canUseServerActions || editing) return;
    setEmojiOpen(true);
  }, [canUseServerActions, editing, reactionPickerSignal]);

  const selectReaction = (emojiName: string) => {
    const reactionName = preferredReactionName(message.reactions.map((reaction) => reaction.emojiName), emojiName);
    setEmojiOpen(false);
    onReaction(message, reactionName);
  };
  const saveEdit = async (draft: ChatDraft) => {
    const body = serializeDraft(draft);
    if (!body.trim()) return false;
    setEditSaving(true);
    try {
      await onSaveEdit(message, body);
      return true;
    } catch {
      return false;
    } finally {
      setEditSaving(false);
    }
  };
  const handleOpenThreadClick = (event: MouseEvent<HTMLElement>) => {
    if (editing || message.deletedAt || deliveryStatus) return;
    if (isInteractiveMessageTarget(event.target) || hasSelectedMessageText(event.currentTarget)) return;
    onThread(message.rootMessageId ?? message.id);
  };
  const handleOpenThreadKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (editing || message.deletedAt || deliveryStatus || isInteractiveMessageTarget(event.target)) return;
    event.preventDefault();
    onThread(message.rootMessageId ?? message.id);
  };

  return (
    <article
      className={clsx(
        "orf-chat-message",
        compact && "orf-chat-message-compact",
        message.pinnedAt && "orf-chat-message-pinned",
        focused && "orf-chat-message-focused",
        emojiOpen && "orf-chat-message-actions-open",
        deliveryStatus === "sending" && "orf-chat-message-pending",
        deliveryStatus === "failed" && "orf-chat-message-failed",
      )}
      data-chat-message-id={message.id}
      data-chat-unread-message={firstUnread ? "true" : undefined}
      id={`chat-message-${message.id}`}
      onClick={handleOpenThreadClick}
      onKeyDown={handleOpenThreadKeyDown}
      tabIndex={!editing && !message.deletedAt && !deliveryStatus ? 0 : undefined}
    >
      {compact ? (
        <div className="orf-chat-message-compact-time" title={formatDateTime(message.createdAt)}>{formatTime(message.createdAt)}</div>
      ) : (
        <Avatar avatarUrl={message.authorAvatarUrl} name={message.authorName} size="md" />
      )}
      <div className="orf-chat-message-body">
        {(!compact || message.pinnedAt || message.editedAt) && (
          <div className="orf-chat-message-meta">
            {!compact && (
              <>
                <strong>{message.authorName}</strong>
                <span title={formatDateTime(message.createdAt)}>{formatTime(message.createdAt)}</span>
              </>
            )}
            {message.pinnedAt && (
              <span className="orf-chat-message-pin-label">
                <Pin className="h-3 w-3" />
                已固定
              </span>
            )}
            {message.editedAt && !message.deletedAt && <em>已编辑</em>}
          </div>
        )}
        {message.deletedAt ? (
          <div className="orf-chat-message-deleted">消息已删除</div>
        ) : editing && canMutate ? (
          <div className="orf-chat-inline-edit">
            <ChatDraftEditor
              autoFocus
              className="orf-chat-inline-edit-box"
              draft={editDraft}
              mentionableUsers={mentionableUsers}
              onChange={setEditDraft}
              onSubmit={saveEdit}
              placeholder="编辑消息..."
              resetKey={message.id}
              rows={4}
              submitDisabled={editSaving || !editDraft.text.trim()}
            />
            <div className="orf-chat-inline-edit-actions">
              <button type="button" onClick={onCancelEdit}>取消</button>
              <button disabled={editSaving || !editDraft.text.trim()} type="button" onClick={() => void saveEdit(editDraft)}>
                {editSaving ? "保存中" : "保存"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="orf-chat-message-text"><ChatMarkdown body={message.body} usersById={usersById} /></div>
            <AttachmentGrid attachments={message.attachments} onAttachmentPreview={onAttachmentPreview} />
            {deliveryStatus && (
              <div className="orf-chat-delivery-status" role={deliveryStatus === "failed" ? "alert" : "status"}>
                {deliveryStatus === "sending" ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>发送中</span>
                  </>
                ) : (
                  <>
                    <span>发送失败</span>
                    {onRetryPending && (
                      <button type="button" onClick={() => onRetryPending(message)}>
                        <RotateCcw className="h-3.5 w-3.5" />
                        重试
                      </button>
                    )}
                    {onRemovePending && (
                      <button type="button" onClick={() => onRemovePending(message)} aria-label="移除失败消息">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
            <div className="orf-chat-reaction-row">
              {message.reactions.map((reaction) => {
                const reactionLabel = labelChatReactionEmoji(reaction.emojiName);
                return (
                  <button
                    type="button"
                    className={clsx("orf-chat-reaction", reaction.reactedByCurrentUser && "orf-chat-reaction-active")}
                    key={reaction.emojiName}
                    title={reactionLabel}
                    aria-label={`${reactionLabel}，${reaction.count} 人`}
                    onClick={() => onReaction(message, reaction.emojiName)}
                  >
                    <span className="orf-chat-reaction-symbol" aria-hidden="true">{displayChatReactionEmoji(reaction.emojiName)}</span>
                    <span>{reaction.count}</span>
                  </button>
                );
              })}
              {!message.rootMessageId && message.replyCount > 0 && (
                <button type="button" className="orf-chat-thread-summary" onClick={() => onThread(message.id)}>
                  <Reply className="h-3.5 w-3.5" />
                  {message.replyCount} 条回复
                  {message.lastReplyAt && <span title={formatDateTime(message.lastReplyAt)}>最后回复 {formatTime(message.lastReplyAt)}</span>}
                </button>
              )}
            </div>
          </>
        )}
      </div>
      {canUseServerActions && !editing && (
        <div className="orf-chat-message-actions">
          {quickChatReactionOptions.map((option) => (
            <button
              type="button"
              className={clsx("orf-chat-quick-reaction", reactedByCurrentUser.has(option.emojiName) && "orf-chat-message-action-active")}
              key={option.emojiName}
              title={option.label}
              aria-label={option.label}
              onClick={() => selectReaction(option.emojiName)}
            >
              {option.symbol}
            </button>
          ))}
          <div className="orf-chat-message-action-anchor" ref={emojiAnchorRef}>
            <IconButton icon={Smile} label="添加反应" onClick={() => setEmojiOpen((open) => !open)} />
            {emojiOpen && <ChatReactionPicker anchorRef={emojiAnchorRef} onClose={() => setEmojiOpen(false)} onSelect={selectReaction} />}
          </div>
          {!message.rootMessageId && (
            <IconButton icon={Reply} label={message.replyCount > 0 ? "打开回复" : "回复"} onClick={() => onThread(message.id, { focusComposer: true })} />
          )}
          {onSave && (
            <IconButton
              className={message.savedByCurrentUser ? "orf-chat-message-action-active" : ""}
              icon={Bookmark}
              label={message.savedByCurrentUser ? "取消保存" : "保存消息"}
              onClick={() => onSave(message)}
            />
          )}
          {canPin && onPin && (
            <IconButton
              className={message.pinnedAt ? "orf-chat-message-action-active" : ""}
              icon={Pin}
              label={message.pinnedAt ? "取消固定" : "固定消息"}
              onClick={() => onPin(message)}
            />
          )}
          {onMarkUnread && <IconButton icon={EyeOff} label="从这里标记未读" onClick={() => onMarkUnread(message)} />}
          <IconButton icon={LinkIcon} label="复制消息链接" onClick={() => onCopyLink(message)} />
          {canMutate && <IconButton icon={Edit3} label="编辑消息" onClick={() => onEdit(message)} />}
          {canMutate && <IconButton icon={Trash2} label="删除消息" onClick={() => onDelete(message)} />}
        </div>
      )}
    </article>
  );
}
