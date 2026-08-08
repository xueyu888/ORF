import { useCallback, type MouseEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { feedbackIssueHref, feedbackIssueIdFromHref, feedbackIssueMarkdownLabel } from "@orf/feedback-module/contracts";
import type { ChatUser } from "../../types/orf";
import {
  OrfRichTextMarkdownViewer,
  type OrfRichTextResolvedLink,
} from "../rich-text/OrfRichTextMarkdownViewer";
import {
  type OrfAttachmentReference,
  orfRichTextMentionLabel,
  type OrfMentionReference,
} from "../rich-text/orfRichTextMarkdown";
import { ChatReactionEmoji } from "./ChatReactionEmoji";
import { parseChatDriveResourceHref, type ChatDriveResourceLinkTarget } from "./chatDriveResourceLinks";
import type { ChatFeedbackReference } from "./chatModels";
import { tokenizeChatReactionEmojiText } from "./chatReactions";

type ChatMarkdownProps = {
  body: string;
  compact?: boolean;
  commentImageAttachmentIds?: readonly string[];
  feedbackItems?: readonly ChatFeedbackReference[];
  onDriveResourceLink?: (target: ChatDriveResourceLinkTarget) => void;
  usersById: Map<string, ChatUser>;
};

function isInternalHref(href: string) {
  return href.startsWith("/") && !href.startsWith("//");
}

function feedbackLinkForHref(href: string, feedbackById: Map<string, ChatFeedbackReference>) {
  const feedbackId = feedbackIssueIdFromHref(href);
  if (!feedbackId) return null;
  const feedback = feedbackById.get(feedbackId);
  return {
    href: feedbackIssueHref(feedbackId),
    label: feedback ? feedbackIssueMarkdownLabel(feedback) : "反馈链接",
  };
}

function renderMarkdownLink(
  href: string,
  children: ReactNode,
  key: string,
  onDriveResourceLink?: (target: ChatDriveResourceLinkTarget) => void,
) {
  const driveResourceTarget = parseChatDriveResourceHref(href);
  if (driveResourceTarget && onDriveResourceLink) {
    return (
      <a
        href={href}
        key={key}
        onClick={(event) => {
          if (shouldLetBrowserOpenLink(event)) return;
          event.preventDefault();
          onDriveResourceLink(driveResourceTarget);
        }}
      >
        {children}
      </a>
    );
  }

  if (driveResourceTarget?.fileId) {
    return (
      <a href={href} key={key} target="_blank" rel="noreferrer noopener">
        {children}
      </a>
    );
  }

  if (isInternalHref(href)) {
    return <Link key={key} to={href}>{children}</Link>;
  }

  return (
    <a href={href} key={key} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  );
}

function shouldLetBrowserOpenLink(event: MouseEvent<HTMLAnchorElement>) {
  return event.defaultPrevented || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
}

function renderEmojiTextFragments(text: string, keyPrefix: string) {
  return tokenizeChatReactionEmojiText(text).map((token, index) => (
    token.kind === "emoji"
      ? <ChatReactionEmoji emojiName={token.emojiName} key={`${keyPrefix}:emoji:${index}`} size="inline" />
      : <span key={`${keyPrefix}:text:${index}`}>{token.text}</span>
  ));
}

function renderSystemMentionFragments(text: string, keyPrefix: string) {
  const nodes: ReactNode[] = [];
  const pattern = /(^|[^A-Za-z0-9_@.])@(all|channel|here|所有人)(?=$|[^A-Za-z0-9_])/gi;
  let index = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const prefix = match[1] ?? "";
    const mention = match[2] ?? "";
    const mentionStart = match.index + prefix.length;
    if (mentionStart > index) nodes.push(...renderEmojiTextFragments(text.slice(index, mentionStart), `${keyPrefix}:text:${index}`));
    nodes.push(
      <span className="orf-chat-mention-token orf-chat-system-mention-token" key={`${keyPrefix}:system-mention:${mentionStart}`}>
        @{mention}
      </span>,
    );
    index = mentionStart + mention.length + 1;
  }

  if (index < text.length) nodes.push(...renderEmojiTextFragments(text.slice(index), `${keyPrefix}:text:${index}`));
  return nodes;
}

function renderChatMention(reference: OrfMentionReference, usersById: Map<string, ChatUser>, key: string) {
  const user = usersById.get(reference.userId);
  const label = orfRichTextMentionLabel(user?.name ?? reference.label ?? "成员");
  return (
    <span className="orf-chat-mention-token" key={key} title={user?.email || label}>
      @{label}
    </span>
  );
}

export function commentImageAttachmentIdsFromChatSystemMetadata(system: { metadata?: Record<string, string> | null } | null | undefined) {
  return (system?.metadata?.commentImageAttachmentIds ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

function commentAttachmentInlineUrl(attachmentId: string) {
  return `/api/comments/attachments/${encodeURIComponent(attachmentId)}/content?disposition=inline`;
}

function renderCommentNotificationImageAttachment(
  reference: OrfAttachmentReference,
  allowedAttachmentIds: ReadonlySet<string>,
  compact: boolean,
  key: string,
) {
  if (reference.kind !== "attached" || !allowedAttachmentIds.has(reference.attachmentId)) {
    return (
      <span key={key} className="orf-rich-text-viewer-attachment-missing">
        附件不可用：{reference.alt}
      </span>
    );
  }

  if (compact) {
    return <span key={key} className="orf-rich-text-markdown-notification-image-compact">图片：{reference.alt}</span>;
  }

  const src = commentAttachmentInlineUrl(reference.attachmentId);
  return (
    <figure key={key} className="orf-rich-text-markdown-notification-image">
      <a href={src} target="_blank" rel="noreferrer noopener" title={`打开图片 ${reference.alt}`}>
        <img alt={reference.alt} loading="lazy" src={src} />
      </a>
      <figcaption>{reference.alt}</figcaption>
    </figure>
  );
}

export function ChatMarkdown({ body, compact = false, commentImageAttachmentIds = [], feedbackItems = [], onDriveResourceLink, usersById }: ChatMarkdownProps) {
  const feedbackById = new Map(feedbackItems.map((feedback) => [feedback.id, feedback]));
  const allowedCommentImageAttachmentIds = new Set(commentImageAttachmentIds.map((id) => id.trim()).filter(Boolean));
  const renderLink = useCallback(
    (href: string, children: ReactNode, key: string) => renderMarkdownLink(href, children, key, onDriveResourceLink),
    [onDriveResourceLink],
  );
  const renderAttachment = useCallback(
    (reference: OrfAttachmentReference, key: string) => renderCommentNotificationImageAttachment(reference, allowedCommentImageAttachmentIds, compact, key),
    [allowedCommentImageAttachmentIds, compact],
  );
  const resolveLink = (href: string, label: ReactNode): OrfRichTextResolvedLink => {
    const feedbackLink = feedbackLinkForHref(href, feedbackById);
    return {
      href: feedbackLink?.href ?? href,
      label: feedbackLink?.label ?? label,
    };
  };

  return (
    <OrfRichTextMarkdownViewer
      body={body}
      compact={compact}
      renderAttachment={allowedCommentImageAttachmentIds.size > 0 ? renderAttachment : undefined}
      renderLink={renderLink}
      renderMention={(reference, key) => renderChatMention(reference, usersById, key)}
      renderPlainText={renderSystemMentionFragments}
      resolveLink={resolveLink}
      usersById={usersById}
    />
  );
}
