import { clsx } from "clsx";
import { Bookmark, Edit3, EyeOff, FileText, Link as LinkIcon, Pin, Reply, Smile, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { Avatar, IconButton } from "../../components/ui";
import type { ChatAttachment, ChatMessage, ChatUser } from "../../types/orf";
import { formatFileSize, formatTime } from "./chatFormat";
import { ChatMarkdown } from "./chatMarkdown";
import { ChatReactionPicker } from "./ChatReactionPicker";
import { displayChatReactionEmoji, labelChatReactionEmoji, preferredReactionName } from "./chatReactions";

type ChatMessageItemProps = {
  canPin?: boolean;
  currentUserId?: string;
  firstUnread?: boolean;
  focused?: boolean;
  message: ChatMessage;
  onAttachmentPreview: (attachment: ChatAttachment) => void;
  onCopyLink: (message: ChatMessage) => void;
  onDelete: (message: ChatMessage) => void;
  onEdit: (message: ChatMessage) => void;
  onMarkUnread?: (message: ChatMessage) => void;
  onPin?: (message: ChatMessage) => void;
  onReaction: (message: ChatMessage, emojiName: string) => void;
  onSave?: (message: ChatMessage) => void;
  onThread: (rootMessageId: string) => void;
  usersById: Map<string, ChatUser>;
};

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
  currentUserId,
  firstUnread,
  focused,
  message,
  onCopyLink,
  onDelete,
  onEdit,
  onMarkUnread,
  onPin,
  onReaction,
  onSave,
  onThread,
  usersById,
}: ChatMessageItemProps) {
  const [emojiOpen, setEmojiOpen] = useState(false);
  const emojiAnchorRef = useRef<HTMLDivElement | null>(null);
  const canMutate = message.authorUserId === currentUserId && !message.deletedAt;
  const selectReaction = (emojiName: string) => {
    const reactionName = preferredReactionName(message.reactions.map((reaction) => reaction.emojiName), emojiName);
    setEmojiOpen(false);
    onReaction(message, reactionName);
  };

  return (
    <article
      className={clsx("orf-chat-message", message.pinnedAt && "orf-chat-message-pinned", focused && "orf-chat-message-focused")}
      data-chat-message-id={message.id}
      data-chat-unread-message={firstUnread ? "true" : undefined}
      id={`chat-message-${message.id}`}
    >
      <Avatar avatarUrl={message.authorAvatarUrl} name={message.authorName} size="md" />
      <div className="orf-chat-message-body">
        <div className="orf-chat-message-meta">
          <strong>{message.authorName}</strong>
          <span>{formatTime(message.createdAt)}</span>
          {message.pinnedAt && (
            <span className="orf-chat-message-pin-label">
              <Pin className="h-3 w-3" />
              已固定
            </span>
          )}
          {message.editedAt && !message.deletedAt && <em>已编辑</em>}
        </div>
        {message.deletedAt ? (
          <div className="orf-chat-message-deleted">消息已删除</div>
        ) : (
          <>
            <div className="orf-chat-message-text"><ChatMarkdown body={message.body} usersById={usersById} /></div>
            <AttachmentGrid attachments={message.attachments} onAttachmentPreview={onAttachmentPreview} />
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
              <div className="orf-chat-emoji-anchor" ref={emojiAnchorRef}>
                <button type="button" className="orf-chat-mini-action" onClick={() => setEmojiOpen((open) => !open)} title="添加反应">
                  <Smile className="h-3.5 w-3.5" />
                </button>
                {emojiOpen && <ChatReactionPicker anchorRef={emojiAnchorRef} onClose={() => setEmojiOpen(false)} onSelect={selectReaction} />}
              </div>
              <button type="button" className="orf-chat-thread-link" onClick={() => onThread(message.id)}>
                <Reply className="h-3.5 w-3.5" />
                {message.replyCount > 0 ? `${message.replyCount} 条回复` : "回复"}
              </button>
            </div>
          </>
        )}
      </div>
      {!message.deletedAt && (
        <div className="orf-chat-message-actions">
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
