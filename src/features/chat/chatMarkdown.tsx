import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { ChatUser, Feedback } from "../../types/orf";
import { feedbackIssueHref, feedbackIssueIdFromHref, feedbackIssueMarkdownLabel } from "../feedback/model/feedbackIssue";
import {
  OrfRichTextMarkdownViewer,
  type OrfRichTextResolvedLink,
} from "../rich-text/OrfRichTextMarkdownViewer";
import {
  orfRichTextMentionLabel,
  type OrfMentionReference,
} from "../rich-text/orfRichTextMarkdown";

type ChatMarkdownProps = {
  body: string;
  compact?: boolean;
  feedbackItems?: readonly Pick<Feedback, "id" | "phenomenon">[];
  usersById: Map<string, ChatUser>;
};

function isInternalHref(href: string) {
  return href.startsWith("/") && !href.startsWith("//");
}

function feedbackLinkForHref(href: string, feedbackById: Map<string, Pick<Feedback, "id" | "phenomenon">>) {
  const feedbackId = feedbackIssueIdFromHref(href);
  if (!feedbackId) return null;
  const feedback = feedbackById.get(feedbackId);
  return {
    href: feedbackIssueHref(feedbackId),
    label: feedback ? feedbackIssueMarkdownLabel(feedback) : "反馈链接",
  };
}

function renderMarkdownLink(href: string, children: ReactNode, key: string) {
  if (isInternalHref(href)) {
    return <Link key={key} to={href}>{children}</Link>;
  }

  return (
    <a href={href} key={key} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  );
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
    if (mentionStart > index) nodes.push(<span key={`${keyPrefix}:text:${index}`}>{text.slice(index, mentionStart)}</span>);
    nodes.push(
      <span className="orf-chat-mention-token orf-chat-system-mention-token" key={`${keyPrefix}:system-mention:${mentionStart}`}>
        @{mention}
      </span>,
    );
    index = mentionStart + mention.length + 1;
  }

  if (index < text.length) nodes.push(<span key={`${keyPrefix}:text:${index}`}>{text.slice(index)}</span>);
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

export function ChatMarkdown({ body, compact = false, feedbackItems = [], usersById }: ChatMarkdownProps) {
  const feedbackById = new Map(feedbackItems.map((feedback) => [feedback.id, feedback]));
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
      classNamePrefix="orf-chat-markdown"
      compact={compact}
      renderLink={renderMarkdownLink}
      renderMention={(reference, key) => renderChatMention(reference, usersById, key)}
      renderPlainText={renderSystemMentionFragments}
      resolveLink={resolveLink}
      usersById={usersById}
    />
  );
}
