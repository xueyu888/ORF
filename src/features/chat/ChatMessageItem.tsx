import { clsx } from "clsx";
import { Bookmark, CheckCheck, ChevronDown, ChevronUp, Copy, Edit3, EyeOff, FileText, Link as LinkIcon, type LucideIcon, MoreHorizontal, Pin, Reply, RotateCcw, Smile, Trash2, X } from "lucide-react";
import { type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode, type RefObject, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button, IconButton } from "../../components/ui";
import type { ChatAttachment, ChatMessage, ChatUser, Feedback } from "../../types/orf";
import { formatPastedFeedbackLinks } from "@orf/feedback-module/web";
import type { ChatAttachmentPreviewHandler } from "./chatAttachmentPreview";
import type { ChatDriveResourceLinkTarget } from "./chatDriveResourceLinks";
import { formatDateTime, formatFileSize, formatTime } from "./chatFormat";
import { ChatMarkdown, commentImageAttachmentIdsFromChatSystemMetadata } from "./chatMarkdown";
import { ChatPresenceAvatar } from "./ChatPresenceAvatar";
import { ChatReactionEmoji } from "./ChatReactionEmoji";
import { ChatReactionPicker } from "./ChatReactionPicker";
import { canonicalChatReactionName, isVisibleChatReactionEmoji, labelChatReactionEmoji, preferredReactionName, quickChatReactionOptions } from "./chatReactions";
import { ChatDraftEditor } from "./ChatDraftEditor";
import { chatMessageSendStatus, draftFromStoredBody, serializeDraft, type ChatDraft } from "./chatModels";
import type { ChatOpenThreadOptions } from "./useChatThreadState";

type ChatMessageItemProps = {
  canDeleteAnyMessage?: boolean;
  canPin?: boolean;
  compact?: boolean;
  currentUserId?: string;
  editing?: boolean;
  feedbackItems?: readonly Pick<Feedback, "id" | "title">[];
  firstUnread?: boolean;
  focused?: boolean;
  mentionableUsers: ChatUser[];
  message: ChatMessage;
  onAttachmentPreview: ChatAttachmentPreviewHandler;
  onCancelEdit: () => void;
  onCopyLink: (message: ChatMessage) => void;
  onCopyMessage: (message: ChatMessage) => void;
  onDelete: (message: ChatMessage) => void;
  onDriveResourceLink?: (target: ChatDriveResourceLinkTarget) => void;
  onEdit: (message: ChatMessage) => void;
  onMarkUnread?: (message: ChatMessage) => void;
  onPin?: (message: ChatMessage) => void;
  onReaction: (message: ChatMessage, emojiName: string) => void;
  onRemovePending?: (message: ChatMessage) => void;
  onRequestAcknowledgement?: (message: ChatMessage) => void;
  onRetryPending?: (message: ChatMessage) => void;
  onSave?: (message: ChatMessage) => void;
  onSaveEdit: (message: ChatMessage, body: string) => Promise<void>;
  onThread?: (rootMessageId: string, options?: ChatOpenThreadOptions) => void;
  reactionPickerSignal?: number;
  renderMessageBody?: (message: ChatMessage) => string | null | undefined;
  renderReferenceCard?: (message: ChatMessage) => ReactNode;
  usersById: Map<string, ChatUser>;
};

const chatMessageCollapsedTextMaxHeightPx = 560;

type ChatMessageMoreAction = {
  active?: boolean;
  danger?: boolean;
  icon: LucideIcon;
  id: string;
  label: string;
  onSelect: () => void;
};

type PopoverPosition = {
  left: number;
  top: number;
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
    ".orf-chat-reference-card",
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

function imageDimension(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function reactionSummaryLabel(
  reaction: ChatMessage["reactions"][number],
  reactionLabel: string,
  usersById: Map<string, ChatUser>,
) {
  const names = reaction.userIds
    .map((userId) => usersById.get(userId)?.name)
    .filter((name): name is string => Boolean(name));
  if (names.length === 0) return `${reactionLabel}，${reaction.count} 人`;
  const visibleNames = names.slice(0, 5).join("、");
  const hiddenCount = Math.max(0, reaction.count - names.length);
  const overflowCount = Math.max(0, names.length - 5) + hiddenCount;
  return overflowCount > 0
    ? `${reactionLabel}，${reaction.count} 人：${visibleNames} 等 ${overflowCount} 人`
    : `${reactionLabel}，${reaction.count} 人：${visibleNames}`;
}

function acknowledgementSummaryLabel(
  acknowledgement: NonNullable<ChatMessage["acknowledgement"]>,
  usersById: Map<string, ChatUser>,
) {
  const acknowledgedCount = acknowledgement.acknowledgedUserIds.length;
  const totalCount = acknowledgement.recipientUserIds.length;
  const pendingNames = acknowledgement.pendingUserIds
    .map((userId) => usersById.get(userId)?.name)
    .filter((name): name is string => Boolean(name));
  if (pendingNames.length === 0) return `回执 ${acknowledgedCount}/${totalCount}，全部已回应`;
  const visibleNames = pendingNames.slice(0, 5).join("、");
  const overflowCount = Math.max(0, pendingNames.length - 5);
  return overflowCount > 0
    ? `回执 ${acknowledgedCount}/${totalCount}，待回应：${visibleNames} 等 ${overflowCount} 人`
    : `回执 ${acknowledgedCount}/${totalCount}，待回应：${visibleNames}`;
}

function MessageAuthorAvatar({
  currentUserId,
  message,
  usersById,
}: {
  currentUserId?: string;
  message: ChatMessage;
  usersById: Map<string, ChatUser>;
}) {
  const author = usersById.get(message.authorUserId);
  return (
    <ChatPresenceAvatar
      avatarUrl={message.authorAvatarUrl}
      className="orf-chat-message-avatar"
      currentUserId={currentUserId}
      name={message.authorName}
      user={author}
    />
  );
}

function CollapsibleMessageText({
  body,
  commentImageAttachmentIds,
  feedbackItems,
  onDriveResourceLink,
  usersById,
}: {
  body: string;
  commentImageAttachmentIds?: readonly string[];
  feedbackItems?: readonly Pick<Feedback, "id" | "title">[];
  onDriveResourceLink?: (target: ChatDriveResourceLinkTarget) => void;
  usersById: Map<string, ChatUser>;
}) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    setExpanded(false);
  }, [body]);

  useEffect(() => {
    const element = contentRef.current;
    if (!element) return undefined;

    let frame: number | null = null;
    const checkOverflow = () => {
      frame = null;
      setOverflowing(element.scrollHeight > chatMessageCollapsedTextMaxHeightPx + 1);
    };
    const scheduleCheck = () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(checkOverflow);
    };

    scheduleCheck();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", scheduleCheck);
      return () => {
        if (frame !== null) window.cancelAnimationFrame(frame);
        window.removeEventListener("resize", scheduleCheck);
      };
    }

    const resizeObserver = new ResizeObserver(scheduleCheck);
    resizeObserver.observe(element);
    window.addEventListener("resize", scheduleCheck);
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener("resize", scheduleCheck);
    };
  }, [body]);

  return (
    <div className={clsx("orf-chat-message-text-wrap", overflowing && "orf-chat-message-text-overflow", expanded && "orf-chat-message-text-expanded")}>
      <div
        className="orf-chat-message-text"
        ref={contentRef}
        style={overflowing && !expanded ? { maxHeight: chatMessageCollapsedTextMaxHeightPx } : undefined}
      >
        <ChatMarkdown
          body={body}
          commentImageAttachmentIds={commentImageAttachmentIds}
          feedbackItems={feedbackItems}
          onDriveResourceLink={onDriveResourceLink}
          usersById={usersById}
        />
      </div>
      {overflowing && (
        <button
          type="button"
          className="orf-chat-message-show-more"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setExpanded((value) => !value);
          }}
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {expanded ? "收起" : "展开完整消息"}
        </button>
      )}
    </div>
  );
}

function AttachmentGrid({
  attachments,
  onAttachmentPreview,
}: {
  attachments: ChatAttachment[];
  onAttachmentPreview: ChatAttachmentPreviewHandler;
}) {
  if (attachments.length === 0) return null;
  const singleImage = attachments.length === 1 && Boolean(attachments[0]?.mimeType.startsWith("image/"));
  return (
    <div className={clsx("orf-chat-attachments", singleImage && "orf-chat-attachments-single-image")}>
      {attachments.map((attachment) => {
        const isImage = attachment.mimeType.startsWith("image/");
        return isImage ? (
          <button type="button" className="orf-chat-image-attachment" key={attachment.id} onClick={() => onAttachmentPreview(attachment, attachments)}>
            <img
              src={attachment.contentUrl}
              alt={attachment.fileName}
              height={imageDimension(attachment.height)}
              loading="lazy"
              width={imageDimension(attachment.width)}
            />
            <span>{attachment.fileName}</span>
          </button>
        ) : (
          <button type="button" className="orf-chat-file-attachment" key={attachment.id} onClick={() => onAttachmentPreview(attachment, attachments)}>
            <FileText className="h-5 w-5" />
            <span>{attachment.fileName}</span>
            <small>{formatFileSize(attachment.fileSize)}</small>
          </button>
        );
      })}
    </div>
  );
}

function chatFloatingLayerRoot() {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLElement>(".orf-app-shell[data-chat-page='true']") ?? document.body;
}

function ChatMessageMoreMenu({
  actions,
  anchorRef,
  id,
  initialFocus,
  onClose,
  onInitialFocusHandled,
}: {
  actions: ChatMessageMoreAction[];
  anchorRef: RefObject<HTMLElement | null>;
  id: string;
  initialFocus: "first" | "last" | null;
  onClose: (restoreFocus?: boolean) => void;
  onInitialFocusHandled: () => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<PopoverPosition | null>(null);

  const menuItems = () => (
    Array.from(panelRef.current?.querySelectorAll<HTMLButtonElement>("[role='menuitem']") ?? [])
      .filter((item) => !item.disabled)
  );

  const focusMenuItem = (index: number) => {
    const items = menuItems();
    if (items.length === 0) return;
    const nextIndex = (index + items.length) % items.length;
    items[nextIndex]?.focus();
  };

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const viewportPadding = 8;
    const gap = 6;
    const anchorRect = anchor.getBoundingClientRect();
    const panelRect = panelRef.current?.getBoundingClientRect();
    const panelWidth = panelRect?.width ?? 180;
    const panelHeight = panelRect?.height ?? Math.min(320, actions.length * 32 + 8);
    const rawTopbarHeight = window.getComputedStyle(document.documentElement).getPropertyValue("--orf-topbar-height");
    const topbarHeight = Number.parseFloat(rawTopbarHeight);
    const safeTop = Number.isFinite(topbarHeight) ? topbarHeight + viewportPadding : viewportPadding;
    const belowTop = anchorRect.bottom + gap;
    const aboveTop = anchorRect.top - panelHeight - gap;
    const hasEnoughBelow = belowTop + panelHeight <= window.innerHeight - viewportPadding;
    const preferredTop = hasEnoughBelow ? belowTop : aboveTop;
    const maxTop = Math.max(safeTop, window.innerHeight - panelHeight - viewportPadding);
    const top = Math.max(safeTop, Math.min(preferredTop, maxTop));
    const maxLeft = Math.max(viewportPadding, window.innerWidth - panelWidth - viewportPadding);
    const left = Math.max(viewportPadding, Math.min(anchorRect.right - panelWidth, maxLeft));
    setPosition({ left, top });
  }, [actions.length, anchorRef]);

  useLayoutEffect(() => {
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [updatePosition]);

  useLayoutEffect(() => {
    updatePosition();
  }, [actions.length, updatePosition]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const items = menuItems();
      const targetIndex = initialFocus === "last" ? items.length - 1 : 0;
      onInitialFocusHandled();
      items[targetIndex]?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [actions.length, initialFocus, onInitialFocusHandled]);

  useEffect(() => {
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [anchorRef, onClose]);

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    const items = menuItems();
    const currentIndex = items.findIndex((item) => item === target);
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose(true);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      event.stopPropagation();
      focusMenuItem(currentIndex >= 0 ? currentIndex + 1 : 0);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      focusMenuItem(currentIndex >= 0 ? currentIndex - 1 : items.length - 1);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      event.stopPropagation();
      focusMenuItem(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      event.stopPropagation();
      focusMenuItem(items.length - 1);
      return;
    }
    if (target?.getAttribute("role") === "menuitem" && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      event.stopPropagation();
      target.click();
    }
  };

  const style: CSSProperties = {
    left: position?.left ?? 0,
    top: position?.top ?? 0,
    visibility: position ? "visible" : "hidden",
  };
  const portalRoot = chatFloatingLayerRoot();
  if (!portalRoot) return null;

  return createPortal(
    <div className="orf-chat-message-more-menu" id={id} ref={panelRef} role="menu" style={style} onKeyDown={handleKeyDown}>
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <button
            type="button"
            className={clsx(action.active && "orf-chat-message-more-active", action.danger && "orf-chat-message-more-danger")}
            key={action.id}
            role="menuitem"
            onClick={() => {
              onClose();
              action.onSelect();
            }}
          >
            <Icon className="h-3.5 w-3.5" />
            {action.label}
          </button>
        );
      })}
    </div>,
    portalRoot,
  );
}

export function ChatMessageItem({
  onAttachmentPreview,
  canDeleteAnyMessage = false,
  canPin,
  compact,
  currentUserId,
  editing,
  feedbackItems,
  firstUnread,
  focused,
  mentionableUsers,
  message,
  onCancelEdit,
  onCopyLink,
  onCopyMessage,
  onDelete,
  onDriveResourceLink,
  onEdit,
  onMarkUnread,
  onPin,
  onReaction,
  onRemovePending,
  onRequestAcknowledgement,
  onRetryPending,
  onSave,
  onSaveEdit,
  onThread,
  reactionPickerSignal,
  renderMessageBody,
  renderReferenceCard,
  usersById,
}: ChatMessageItemProps) {
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [editDraft, setEditDraft] = useState<ChatDraft>(() => draftFromStoredBody(message.body, usersById));
  const [editSaving, setEditSaving] = useState(false);
  const moreMenuId = useId();
  const emojiAnchorRef = useRef<HTMLDivElement | null>(null);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);
  const moreMenuInitialFocusRef = useRef<"first" | "last" | null>(null);
  const sendStatus = chatMessageSendStatus(message);
  const isSystemMessage = message.source === "system";
  const canMutate = !isSystemMessage && !sendStatus && message.authorUserId === currentUserId && !message.deletedAt;
  const canUseServerActions = !sendStatus && !message.deletedAt;
  const canDeleteMessage = !isSystemMessage && (canMutate || (canDeleteAnyMessage && canUseServerActions));
  const visibleReactions = message.reactions.filter((reaction) => isVisibleChatReactionEmoji(reaction.emojiName));
  const acknowledgement = message.acknowledgement ?? null;
  const transformPastedFeedbackText = useCallback(
    (text: string) => formatPastedFeedbackLinks(text, feedbackItems ?? []),
    [feedbackItems],
  );
  const reactedByCurrentUser = new Set(
    visibleReactions
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

  useEffect(() => {
    if (editing || !canUseServerActions) setMoreOpen(false);
  }, [canUseServerActions, editing]);

  const selectReaction = (emojiName: string) => {
    const reactionName = preferredReactionName(visibleReactions.map((reaction) => reaction.emojiName), emojiName);
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
    if (!onThread) return;
    if (editing || message.deletedAt || sendStatus) return;
    if (isInteractiveMessageTarget(event.target) || hasSelectedMessageText(event.currentTarget)) return;
    onThread(message.rootMessageId ?? message.id);
  };
  const handleReplyToThreadDoubleClick = (event: MouseEvent<HTMLElement>) => {
    if (!onThread) return;
    if (editing || message.deletedAt || sendStatus) return;
    if (isInteractiveMessageTarget(event.target)) return;
    event.preventDefault();
    onThread(message.rootMessageId ?? message.id, { focusComposer: true });
  };
  const handleOpenThreadKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (!onThread) return;
    if (editing || message.deletedAt || sendStatus || isInteractiveMessageTarget(event.target)) return;
    event.preventDefault();
    onThread(message.rootMessageId ?? message.id);
  };
  const clearMoreInitialFocus = useCallback(() => {
    moreMenuInitialFocusRef.current = null;
  }, []);
  const focusMoreButton = useCallback(() => {
    const button = moreMenuRef.current?.querySelector<HTMLButtonElement>(".orf-chat-message-more-trigger");
    window.setTimeout(() => button?.focus(), 0);
  }, []);
  const closeMoreMenu = useCallback((restoreButtonFocus = false) => {
    moreMenuInitialFocusRef.current = null;
    setMoreOpen(false);
    if (restoreButtonFocus) focusMoreButton();
  }, [focusMoreButton]);
  const openMoreMenu = useCallback((initialFocus: "first" | "last" = "first") => {
    moreMenuInitialFocusRef.current = initialFocus;
    setMoreOpen(true);
  }, []);
  const toggleMoreMenu = () => {
    if (moreOpen) {
      closeMoreMenu();
      return;
    }
    openMoreMenu("first");
  };
  const handleMoreTriggerKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      if (!moreOpen) return;
      event.preventDefault();
      event.stopPropagation();
      closeMoreMenu(true);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      event.stopPropagation();
      openMoreMenu("first");
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      openMoreMenu("last");
    }
  };
  const copyMessageAction: ChatMessageMoreAction = {
    icon: Copy,
    id: "copyMessage",
    label: "复制消息",
    onSelect: () => onCopyMessage(message),
  };
  const saveAction: ChatMessageMoreAction | null = onSave ? {
    active: message.savedByCurrentUser,
    icon: Bookmark,
    id: "save",
    label: message.savedByCurrentUser ? "取消保存" : "保存消息",
    onSelect: () => onSave(message),
  } : null;
  const editAction: ChatMessageMoreAction | null = canMutate ? {
    icon: Edit3,
    id: "edit",
    label: "编辑消息",
    onSelect: () => onEdit(message),
  } : null;
  const deleteAction: ChatMessageMoreAction | null = canDeleteMessage ? {
    danger: true,
    icon: Trash2,
    id: "delete",
    label: "删除消息",
    onSelect: () => onDelete(message),
  } : null;
  const acknowledgementAction: ChatMessageMoreAction | null = (
    canMutate && !message.rootMessageId && !acknowledgement && onRequestAcknowledgement
  ) ? {
      icon: CheckCheck,
      id: "requestAcknowledgement",
      label: "要求回执",
      onSelect: () => onRequestAcknowledgement(message),
    } : null;
  const moreActions: ChatMessageMoreAction[] = [
    ...(acknowledgementAction ? [acknowledgementAction] : []),
    {
      icon: LinkIcon,
      id: "copyLink",
      label: "复制消息链接",
      onSelect: () => onCopyLink(message),
    },
    ...(canPin && onPin ? [{
      active: Boolean(message.pinnedAt),
      icon: Pin,
      id: "pin",
      label: message.pinnedAt ? "取消固定" : "固定消息",
      onSelect: () => onPin(message),
    }] : []),
    ...(onMarkUnread ? [{
      icon: EyeOff,
      id: "markUnread",
      label: "从这里标记未读",
      onSelect: () => onMarkUnread(message),
    }] : []),
  ];
  const hasMoreActions = moreActions.length > 0;
  const referenceCard = !message.deletedAt && !editing ? renderReferenceCard?.(message) : null;
  const resolvedMessageBody = !message.deletedAt && !editing ? renderMessageBody?.(message) : undefined;
  const visibleMessageBody = resolvedMessageBody === undefined ? message.body : resolvedMessageBody;

  return (
    <article
      className={clsx(
        "orf-chat-message",
        compact && "orf-chat-message-compact",
        onThread && "orf-chat-message-threadable",
        message.pinnedAt && "orf-chat-message-pinned",
        focused && "orf-chat-message-focused",
        emojiOpen && "orf-chat-message-actions-open",
        moreOpen && "orf-chat-message-actions-open",
        sendStatus === "failed" && "orf-chat-message-failed",
      )}
      data-chat-message-id={message.id}
      data-chat-unread-message={firstUnread ? "true" : undefined}
      id={`chat-message-${message.id}`}
      onClick={onThread ? handleOpenThreadClick : undefined}
      onDoubleClick={onThread ? handleReplyToThreadDoubleClick : undefined}
      onKeyDown={onThread ? handleOpenThreadKeyDown : undefined}
      tabIndex={onThread && !editing && !message.deletedAt && !sendStatus ? 0 : undefined}
    >
      {compact ? (
        <div className="orf-chat-message-compact-time" title={formatDateTime(message.createdAt)}>{formatTime(message.createdAt)}</div>
      ) : (
        <MessageAuthorAvatar currentUserId={currentUserId} message={message} usersById={usersById} />
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
              feedbackItems={feedbackItems}
              mentionableUsers={mentionableUsers}
              onCancel={onCancelEdit}
              onChange={setEditDraft}
              onSubmit={saveEdit}
              placeholder="编辑消息..."
              resetKey={message.id}
              submitDisabled={editSaving || !editDraft.text.trim()}
              transformPastedText={transformPastedFeedbackText}
            />
            <div className="orf-chat-inline-edit-actions">
              <Button size="sm" type="button" variant="secondary" onClick={onCancelEdit}>取消</Button>
              <Button size="sm" disabled={editSaving || !editDraft.text.trim()} type="button" onClick={() => void saveEdit(editDraft)}>
                {editSaving ? "保存中" : "保存"}
              </Button>
            </div>
          </div>
        ) : (
          <>
            {visibleMessageBody !== null && (
              <CollapsibleMessageText
                body={visibleMessageBody}
                commentImageAttachmentIds={commentImageAttachmentIdsFromChatSystemMetadata(message.system)}
                feedbackItems={feedbackItems}
                onDriveResourceLink={onDriveResourceLink}
                usersById={usersById}
              />
            )}
            {referenceCard}
            <AttachmentGrid attachments={message.attachments} onAttachmentPreview={onAttachmentPreview} />
            {sendStatus === "failed" && (
              <div className="orf-chat-delivery-status" role="alert">
                <span>发送失败</span>
                {onRetryPending && (
                  <Button size="sm" type="button" variant="secondary" onClick={() => onRetryPending(message)}>
                    <RotateCcw className="h-3.5 w-3.5" />
                    重试
                  </Button>
                )}
                {onRemovePending && (
                  <IconButton icon={X} label="移除失败消息" size="sm" type="button" variant="danger" onClick={() => onRemovePending(message)} />
                )}
              </div>
            )}
            <div className="orf-chat-reaction-row">
              {acknowledgement && (
                <span
                  className={clsx("orf-chat-ack-summary", acknowledgement.currentUserPending && "orf-chat-ack-summary-pending")}
                  title={acknowledgementSummaryLabel(acknowledgement, usersById)}
                  aria-label={acknowledgementSummaryLabel(acknowledgement, usersById)}
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  回执 {acknowledgement.acknowledgedUserIds.length}/{acknowledgement.recipientUserIds.length}
                </span>
              )}
              {acknowledgement?.currentUserPending && (
                <>
                  <button type="button" className="orf-chat-ack-action" onClick={() => onReaction(message, "thumbsup")}>
                    <ChatReactionEmoji decorative emojiName="thumbsup" size="reaction" />
                    已收到
                  </button>
                  <button type="button" className="orf-chat-ack-action" onClick={() => onReaction(message, "one")}>
                    <ChatReactionEmoji decorative emojiName="one" size="reaction" />
                    扣1
                  </button>
                </>
              )}
              {visibleReactions.map((reaction) => {
                const reactionLabel = labelChatReactionEmoji(reaction.emojiName);
                const summaryLabel = reactionSummaryLabel(reaction, reactionLabel, usersById);
                return (
                  <button
                    type="button"
                    className={clsx("orf-chat-reaction", reaction.reactedByCurrentUser && "orf-chat-reaction-active")}
                    key={reaction.emojiName}
                    title={summaryLabel}
                    aria-label={summaryLabel}
                    onClick={() => onReaction(message, reaction.emojiName)}
                  >
                    <span className="orf-chat-reaction-symbol" aria-hidden="true">
                      <ChatReactionEmoji decorative emojiName={reaction.emojiName} size="reaction" />
                    </span>
                    <span>{reaction.count}</span>
                  </button>
                );
              })}
              {onThread && !message.rootMessageId && message.replyCount > 0 && (
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
              className={clsx(
                "orf-chat-quick-reaction",
                reactedByCurrentUser.has(option.emojiName) && "orf-chat-message-action-active",
              )}
              key={option.emojiName}
              title={option.label}
              aria-label={option.label}
              onClick={() => selectReaction(option.emojiName)}
            >
              <ChatReactionEmoji decorative emojiName={option.emojiName} size="quick" />
            </button>
          ))}
          <div className="orf-chat-message-action-anchor" ref={emojiAnchorRef}>
            <IconButton icon={Smile} label="添加反应" onClick={() => setEmojiOpen((open) => !open)} />
            {emojiOpen && <ChatReactionPicker anchorRef={emojiAnchorRef} onClose={() => setEmojiOpen(false)} onSelect={selectReaction} />}
          </div>
          {onThread && !message.rootMessageId && (
            <IconButton icon={Reply} label={message.replyCount > 0 ? "打开回复" : "回复"} onClick={() => onThread(message.id, { focusComposer: true })} />
          )}
          <IconButton
            className="orf-chat-message-primary-action"
            icon={copyMessageAction.icon}
            label={copyMessageAction.label}
            onClick={copyMessageAction.onSelect}
          />
          {saveAction && (
            <IconButton
              className={clsx(saveAction.active && "orf-chat-message-action-active")}
              icon={saveAction.icon}
              label={saveAction.label}
              onClick={saveAction.onSelect}
            />
          )}
          {editAction && (
            <IconButton
              className="orf-chat-message-primary-action"
              icon={editAction.icon}
              label={editAction.label}
              onClick={editAction.onSelect}
            />
          )}
          {deleteAction && (
            <IconButton
              className="orf-chat-message-danger-action"
              icon={deleteAction.icon}
              label={deleteAction.label}
              onClick={deleteAction.onSelect}
            />
          )}
          {hasMoreActions && (
            <div className="orf-chat-message-more-anchor" ref={moreMenuRef} onKeyDown={handleMoreTriggerKeyDown}>
              <IconButton
                aria-controls={moreOpen ? moreMenuId : undefined}
                aria-expanded={moreOpen}
                aria-haspopup="menu"
                className="orf-chat-message-more-trigger"
                icon={MoreHorizontal}
                label="更多操作"
                onClick={toggleMoreMenu}
              />
              {moreOpen && (
                <ChatMessageMoreMenu
                  actions={moreActions}
                  anchorRef={moreMenuRef}
                  id={moreMenuId}
                  initialFocus={moreMenuInitialFocusRef.current}
                  onClose={closeMoreMenu}
                  onInitialFocusHandled={clearMoreInitialFocus}
                />
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}
