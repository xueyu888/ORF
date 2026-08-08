import type { FeedbackTransitionType } from "../../contracts";
import { feedbackIssuePath } from "../../contracts/links";
import type { FeedbackWebCommentThread, FeedbackWebIssue } from "../types";
import { feedbackLifecycleLabel } from "../labels";
import { feedbackMarkdownToPlainText } from "../markdown";

export type FeedbackIssueState = "open" | "closed";

export function feedbackIssueState(feedback: Pick<FeedbackWebIssue, "stage">): FeedbackIssueState {
  return feedback.stage === "closed" ? "closed" : "open";
}

export function isFeedbackIssueOpen(feedback: Pick<FeedbackWebIssue, "stage">) {
  return feedbackIssueState(feedback) === "open";
}

export function feedbackIssueStateLabel(feedback: Pick<FeedbackWebIssue, "resolution" | "stage">) {
  return feedbackLifecycleLabel(feedback);
}

export function primaryFeedbackIssueTransition(feedback: Pick<FeedbackWebIssue, "stage">): FeedbackTransitionType {
  if (feedback.stage === "closed") return "reopen";
  if (feedback.stage === "pending_verification") return "accept_verification";
  if (feedback.stage === "open") return "start";
  return "submit_verification";
}

export function feedbackIssueThreads(comments: readonly FeedbackWebCommentThread[], feedbackId: string) {
  return comments.filter((thread) => thread.targetType === "feedback" && thread.targetId === feedbackId);
}

export function feedbackIssueCommentCount(comments: readonly FeedbackWebCommentThread[], feedbackId: string) {
  const messages = feedbackIssueThreads(comments, feedbackId)
    .flatMap((thread) => thread.messages)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  return messages.length;
}

export function feedbackIssueDisplayId(value: string) {
  const normalized = value.replace(/^fb-/, "");
  return normalized.length > 8 ? normalized.slice(0, 8) : normalized;
}

export function feedbackIssueHref(feedbackId: string) {
  return feedbackIssuePath(feedbackId);
}

function normalizeMarkdownLinkText(value: string) {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\\/g, "\\\\")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

export function feedbackIssueMarkdownLabel(feedback: Pick<FeedbackWebIssue, "id" | "title">) {
  const title = feedback.title.replace(/\s+/g, " ").trim() || "未命名反馈";
  return `反馈：${title}`;
}

export function feedbackIssueMarkdownLink(feedback: Pick<FeedbackWebIssue, "id" | "title">) {
  return `[${normalizeMarkdownLinkText(feedbackIssueMarkdownLabel(feedback))}](${feedbackIssueHref(feedback.id)})`;
}

export function feedbackIssueFallbackMarkdownLink(feedbackId: string) {
  return `[反馈链接](${feedbackIssueHref(feedbackId)})`;
}

function safeDecodeUriComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function feedbackIssueIdFromHref(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const pathname = (() => {
    if (/^https?:\/\//i.test(trimmed)) {
      try {
        return new URL(trimmed).pathname;
      } catch {
        return "";
      }
    }
    return trimmed.split(/[?#]/, 1)[0] ?? "";
  })();

  const match = pathname.match(/^\/feedback\/([^/?#]+)/);
  return match ? safeDecodeUriComponent(match[1] ?? "") : null;
}

const feedbackLinkPattern = /https?:\/\/[^\s<>()]+|\/feedback\/[^\s<>()]+/g;
const trailingLinkPunctuationPattern = /[.,;:!?，。；：！？）\]\}]+$/;

function splitTrailingLinkPunctuation(value: string) {
  const trailingText = value.match(trailingLinkPunctuationPattern)?.[0] ?? "";
  return {
    trailingText,
    href: trailingText ? value.slice(0, -trailingText.length) : value,
  };
}

export function formatPastedFeedbackLinks(
  text: string,
  feedbackItems: readonly Pick<FeedbackWebIssue, "id" | "title">[],
) {
  const feedbackById = new Map(feedbackItems.map((feedback) => [feedback.id, feedback]));
  let changed = false;
  const nextText = text.replace(feedbackLinkPattern, (rawValue, offset: number) => {
    if (text.slice(Math.max(0, offset - 2), offset) === "](") return rawValue;

    const { href, trailingText } = splitTrailingLinkPunctuation(rawValue);
    const feedbackId = feedbackIssueIdFromHref(href);
    if (!feedbackId) return rawValue;
    const feedback = feedbackById.get(feedbackId);

    changed = true;
    return `${feedback ? feedbackIssueMarkdownLink(feedback) : feedbackIssueFallbackMarkdownLink(feedbackId)}${trailingText}`;
  });

  return changed ? nextText : text;
}

export function feedbackIssueIdsFromText(text: string) {
  const ids = new Set<string>();
  for (const match of text.matchAll(feedbackLinkPattern)) {
    const rawValue = match[0] ?? "";
    const { href } = splitTrailingLinkPunctuation(rawValue);
    const feedbackId = feedbackIssueIdFromHref(href);
    if (feedbackId) ids.add(feedbackId);
  }
  return Array.from(ids);
}

export function feedbackIssueBodyPreview(value: string) {
  return feedbackMarkdownToPlainText(value, { attachmentText: "[附件]" });
}
