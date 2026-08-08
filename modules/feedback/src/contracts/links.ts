export const feedbackRootPath = "/feedback" as const;
export const feedbackCreateBasePath = "/feedback/new" as const;
export const feedbackLabelsPath = "/feedback/labels" as const;
export const feedbackDetailPathTemplate = "/feedback/:feedbackId" as const;

export type FeedbackListHrefInput = {
  readonly assigneeUserId?: string | null;
  readonly label?: string | null;
  readonly sort?: string | null;
  readonly view?: string | null;
};

export function feedbackListPath(input?: FeedbackListHrefInput) {
  const query = new URLSearchParams();
  const view = input?.view?.trim();
  const assigneeUserId = input?.assigneeUserId?.trim();
  const sort = input?.sort?.trim();
  const label = input?.label?.trim();

  if (assigneeUserId) query.set("assignee", assigneeUserId);
  if (sort) query.set("sort", sort);
  if (view) query.set("view", view);
  if (label) query.set("label", label);

  const suffix = query.toString();
  return suffix ? `${feedbackRootPath}?${suffix}` : feedbackRootPath;
}

export function feedbackCreatePath(input?: { readonly projectId?: string | null }) {
  const projectId = input?.projectId?.trim();
  if (!projectId) {
    return feedbackCreateBasePath;
  }

  return `${feedbackCreateBasePath}?project=${encodeURIComponent(projectId)}`;
}

export function feedbackIssuePath(feedbackId: string) {
  return `${feedbackRootPath}/${encodeURIComponent(feedbackId)}`;
}

export function feedbackCommentPath(input: {
  readonly commentMessageId: string;
  readonly feedbackId: string;
}) {
  return `${feedbackIssuePath(input.feedbackId)}?comment=${encodeURIComponent(input.commentMessageId)}`;
}

export type FeedbackIssueLinkTarget = {
  readonly id: string;
  readonly title: string;
};

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

export function feedbackIssueMarkdownLabel(feedback: FeedbackIssueLinkTarget) {
  const title = feedback.title.replace(/\s+/g, " ").trim() || "未命名反馈";
  return `反馈：${title}`;
}

export function feedbackIssueMarkdownLink(feedback: FeedbackIssueLinkTarget) {
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
  feedbackItems: readonly FeedbackIssueLinkTarget[],
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
