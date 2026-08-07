import type { FeedbackImpact } from "@orf/feedback-module/contracts";
import type { CommentThread, Feedback, OrfProject, OrfUser } from "../../../types/orf";
import { feedbackImpactLabel } from "../../../utils/labels";
import { feedbackIssueBodyPreview, feedbackIssueCommentCount, feedbackIssueDisplayId, feedbackIssueStateLabel, isFeedbackIssueOpen } from "./feedbackIssue";
import { feedbackIssueAssignee, feedbackIssueAuthor, feedbackIssueLabels, type FeedbackIssueLabel } from "./feedbackIssueMetadata";

export type FeedbackIssueListState = "assigned" | "open" | "verification" | "unread" | "triage" | "closed" | "all";
export type FeedbackIssueSortKey = "updated-desc" | "updated-asc" | "created-desc" | "created-asc" | "comments-desc" | "comments-asc";

export type FeedbackIssueListFilters = {
  assigneeUserId: string;
  authorUserId: string;
  cause: string;
  impact: "All" | FeedbackImpact;
  listState: FeedbackIssueListState;
  projectId: string;
  query: string;
  sort: FeedbackIssueSortKey;
};

export type FeedbackIssueListLabel = FeedbackIssueLabel;

export type FeedbackIssueListItem = {
  assigneeAvatarUrl: string | null;
  assigneeName: string;
  authorAvatarUrl: string | null;
  authorName: string;
  commentCount: number;
  feedback: Feedback;
  issueNumber: string;
  labels: FeedbackIssueListLabel[];
  lastActivityAt: string;
  preview: string;
  projectName: string | null;
};

type ParsedFeedbackIssueQuery = {
  assigneeTerms: string[];
  authorTerms: string[];
  impactTerms: string[];
  labelTerms: string[];
  projectTerms: string[];
  sort: FeedbackIssueSortKey | null;
  stateTerms: FeedbackIssueListState[];
  text: string;
};

const queryQualifierPattern = /(?:^|\s)(is|status|assignee|owner|author|label|impact|project|sort):("[^"]+"|\S+)/gi;
const impactValues = new Set<FeedbackImpact>(["low", "medium", "high", "critical"]);

export function buildFeedbackIssueListItems(input: {
  comments: readonly CommentThread[];
  feedback: readonly Feedback[];
  projects?: readonly OrfProject[];
  users: readonly OrfUser[];
}): FeedbackIssueListItem[] {
  const threadsByFeedbackId = new Map<string, CommentThread[]>();
  for (const thread of input.comments) {
    if (thread.targetType !== "feedback") continue;
    const threads = threadsByFeedbackId.get(thread.targetId) ?? [];
    threads.push(thread);
    threadsByFeedbackId.set(thread.targetId, threads);
  }

  const projectById = new Map((input.projects ?? []).map((project) => [project.id, project]));

  return input.feedback.map((feedback) => {
    const assignee = feedbackIssueAssignee(feedback, input.users);
    const author = feedbackIssueAuthor(feedback, input.users);
    const threads = threadsByFeedbackId.get(feedback.id) ?? [];
    const threadActivityAt = latestText(threads.map((thread) => thread.updatedAt));

    return {
      assigneeAvatarUrl: assignee.avatarUrl,
      assigneeName: assignee.name,
      authorAvatarUrl: author.avatarUrl,
      authorName: author.name,
      commentCount: feedbackIssueCommentCount(input.comments, feedback.id),
      feedback,
      issueNumber: feedbackIssueDisplayId(feedback.id),
      labels: feedbackIssueLabels(feedback),
      lastActivityAt: latestText([feedback.updatedAt, threadActivityAt]) || feedback.updatedAt,
      preview: feedbackIssueBodyPreview(feedback.description),
      projectName: feedback.projectId ? projectById.get(feedback.projectId)?.name ?? null : null,
    };
  });
}

export function filterFeedbackIssueListItems(items: readonly FeedbackIssueListItem[], filters: FeedbackIssueListFilters) {
  const parsedQuery = parseFeedbackIssueQuery(filters.query);
  const nextSort = parsedQuery.sort ?? filters.sort;

  return filterFeedbackIssueListMatches(items, filters, parsedQuery, filters.listState)
    .sort((left, right) => compareFeedbackIssueListItems(left, right, nextSort));
}

export function feedbackIssueListCounts(items: readonly FeedbackIssueListItem[]) {
  const counts: Record<FeedbackIssueListState, number> = {
    all: items.length,
    assigned: 0,
    closed: 0,
    open: 0,
    triage: 0,
    unread: 0,
    verification: 0,
  };
  for (const item of items) {
    if (itemMatchesListState(item, "assigned")) counts.assigned += 1;
    if (itemMatchesListState(item, "closed")) counts.closed += 1;
    if (itemMatchesListState(item, "open")) counts.open += 1;
    if (itemMatchesListState(item, "triage")) counts.triage += 1;
    if (itemMatchesListState(item, "unread")) counts.unread += 1;
    if (itemMatchesListState(item, "verification")) counts.verification += 1;
  }
  return counts;
}

export function feedbackIssueListCountsForFilters(items: readonly FeedbackIssueListItem[], filters: FeedbackIssueListFilters) {
  const parsedQuery = parseFeedbackIssueQuery(filters.query);
  return feedbackIssueListCounts(filterFeedbackIssueListMatches(items, filters, parsedQuery, "all"));
}

export function feedbackIssueAssigneeOptions(items: readonly FeedbackIssueListItem[]) {
  return uniqueOptions(
    items.map((item) => ({
      label: item.assigneeName,
      value: item.feedback.assigneeUserId ?? "",
    })),
  );
}

export function feedbackIssueAuthorOptions(items: readonly FeedbackIssueListItem[]) {
  return uniqueOptions(
    items
      .filter((item) => Boolean(item.feedback.createdBy))
      .map((item) => ({
        label: item.authorName,
        value: item.feedback.createdBy ?? "",
      })),
  );
}

export function feedbackIssueLabelOptions(items: readonly FeedbackIssueListItem[]) {
  return uniqueOptions(items.flatMap((item) => item.labels.map((label) => ({ label: label.name, value: label.name }))));
}

function filterFeedbackIssueListMatches(
  items: readonly FeedbackIssueListItem[],
  filters: FeedbackIssueListFilters,
  parsedQuery: ParsedFeedbackIssueQuery,
  listState: FeedbackIssueListState,
) {
  return [...items]
    .filter((item) => itemMatchesListState(item, listState))
    .filter((item) => filters.cause === "All" || labelMatches(item, filters.cause))
    .filter((item) => filters.impact === "All" || item.feedback.impact === filters.impact)
    .filter((item) => projectFilterMatches(item, filters.projectId))
    .filter((item) => filters.assigneeUserId === "All" || item.feedback.assigneeUserId === filters.assigneeUserId)
    .filter((item) => filters.authorUserId === "All" || item.feedback.createdBy === filters.authorUserId)
    .filter((item) => parsedQuery.stateTerms.length === 0 || parsedQuery.stateTerms.some((state) => itemMatchesListState(item, state)))
    .filter((item) => parsedQuery.assigneeTerms.every((term) => personMatches(item.feedback.assigneeUserId ?? "", item.assigneeName, term)))
    .filter((item) => parsedQuery.authorTerms.every((term) => personMatches(item.feedback.createdBy ?? "", item.authorName, term)))
    .filter((item) => parsedQuery.labelTerms.every((term) => labelMatches(item, term)))
    .filter((item) => parsedQuery.impactTerms.every((term) => impactMatches(item.feedback.impact, term)))
    .filter((item) => parsedQuery.projectTerms.every((term) => projectMatches(item, term)))
    .filter((item) => textMatches(item, parsedQuery.text));
}

function parseFeedbackIssueQuery(query: string): ParsedFeedbackIssueQuery {
  const parsed: ParsedFeedbackIssueQuery = {
    assigneeTerms: [],
    authorTerms: [],
    impactTerms: [],
    labelTerms: [],
    projectTerms: [],
    sort: null,
    stateTerms: [],
    text: "",
  };
  const textParts: string[] = [];
  let lastIndex = 0;

  queryQualifierPattern.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = queryQualifierPattern.exec(query)) !== null) {
    textParts.push(query.slice(lastIndex, match.index));
    lastIndex = match.index + match[0].length;

    const qualifier = (match[1] ?? "").toLowerCase();
    const value = unquoteQueryValue(match[2] ?? "");
    if (!value) continue;

    if (qualifier === "is" || qualifier === "status") {
      const state = feedbackIssueListStateForQueryValue(value);
      if (state) parsed.stateTerms.push(state);
      continue;
    }
    if (qualifier === "assignee" || qualifier === "owner") {
      parsed.assigneeTerms.push(value);
      continue;
    }
    if (qualifier === "author") {
      parsed.authorTerms.push(value);
      continue;
    }
    if (qualifier === "label") {
      parsed.labelTerms.push(value);
      continue;
    }
    if (qualifier === "impact") {
      parsed.impactTerms.push(value);
      continue;
    }
    if (qualifier === "project") {
      parsed.projectTerms.push(value);
      continue;
    }
    if (qualifier === "sort") {
      parsed.sort = feedbackIssueSortForQueryValue(value) ?? parsed.sort;
    }
  }

  textParts.push(query.slice(lastIndex));
  parsed.text = textParts.join(" ").replace(/\s+/g, " ").trim();
  return parsed;
}

function itemMatchesListState(item: FeedbackIssueListItem, state: FeedbackIssueListState) {
  if (state === "all") return true;
  if (state === "assigned") return item.feedback.requiresAction && (item.feedback.stage === "open" || item.feedback.stage === "in_progress");
  if (state === "closed") return !isFeedbackIssueOpen(item.feedback);
  if (state === "open") return isFeedbackIssueOpen(item.feedback);
  if (state === "triage") return isFeedbackIssueOpen(item.feedback) && item.feedback.priority === null;
  if (state === "unread") return item.feedback.unread;
  return item.feedback.requiresAction && item.feedback.stage === "pending_verification";
}

function compareFeedbackIssueListItems(left: FeedbackIssueListItem, right: FeedbackIssueListItem, sort: FeedbackIssueSortKey) {
  const direction = sort.endsWith("-asc") ? 1 : -1;
  if (sort.startsWith("comments")) {
    return direction * compareNumber(left.commentCount, right.commentCount) || compareTextDescending(left.lastActivityAt, right.lastActivityAt) || compareTextDescending(left.feedback.id, right.feedback.id);
  }
  if (sort.startsWith("created")) {
    return direction * compareText(left.feedback.createdAt, right.feedback.createdAt) || compareTextDescending(left.feedback.id, right.feedback.id);
  }
  return direction * compareText(left.lastActivityAt, right.lastActivityAt) || compareTextDescending(left.feedback.createdAt, right.feedback.createdAt) || compareTextDescending(left.feedback.id, right.feedback.id);
}

function textMatches(item: FeedbackIssueListItem, text: string) {
  const normalizedText = normalizeSearchText(text);
  if (!normalizedText) return true;

  const searchable = normalizeSearchText([
    item.feedback.id,
    item.issueNumber,
    item.feedback.title,
    item.feedback.description,
    item.assigneeName,
    item.authorName,
    item.projectName ?? (item.feedback.projectId ? item.feedback.projectId : "未归属"),
    feedbackIssueStateLabel(item.feedback),
    feedbackImpactLabel[item.feedback.impact],
    ...item.labels.map((label) => label.name),
  ].join(" "));
  return normalizedText.split(" ").every((token) => searchable.includes(token));
}

function projectFilterMatches(item: FeedbackIssueListItem, projectId: string) {
  if (projectId === "All") return true;
  const currentProjectId = item.feedback.projectId?.trim() || null;
  if (projectId === "unassigned") return currentProjectId === null;
  return currentProjectId === projectId;
}

function projectMatches(item: FeedbackIssueListItem, term: string) {
  const normalizedTerm = normalizeSearchText(term);
  const projectId = item.feedback.projectId?.trim() || "";
  if (!projectId) {
    return ["unassigned", "none", "未归属", "无项目"].some((value) => normalizeSearchText(value).includes(normalizedTerm));
  }
  return normalizeSearchText(projectId).includes(normalizedTerm) || normalizeSearchText(item.projectName ?? "").includes(normalizedTerm);
}

function labelMatches(item: FeedbackIssueListItem, term: string) {
  const normalizedTerm = normalizeSearchText(term);
  return item.labels.some((label) => normalizeSearchText(label.name).includes(normalizedTerm));
}

function personMatches(userId: string, name: string, term: string) {
  const normalizedTerm = normalizeSearchText(term);
  return normalizeSearchText(userId).includes(normalizedTerm) || normalizeSearchText(name).includes(normalizedTerm);
}

function impactMatches(impact: FeedbackImpact, term: string) {
  const normalizedTerm = normalizeSearchText(term);
  return normalizeSearchText(impact).includes(normalizedTerm) || normalizeSearchText(feedbackImpactLabel[impact]).includes(normalizedTerm);
}

export function feedbackIssueListStateForQueryValue(value: string): FeedbackIssueListState | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === "assigned" || normalized === "todo" || normalized === "work") return "assigned";
  if (normalized === "open" || normalized === "opened") return "open";
  if (normalized === "verification" || normalized === "verify" || normalized === "review") return "verification";
  if (normalized === "unread" || normalized === "new") return "unread";
  if (normalized === "triage" || normalized === "untriaged") return "triage";
  if (normalized === "closed" || normalized === "close") return "closed";
  if (normalized === "all") return "all";
  return null;
}

function feedbackIssueSortForQueryValue(value: string): FeedbackIssueSortKey | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === "updated-asc" || normalized === "updated") return "updated-asc";
  if (normalized === "updated-desc") return "updated-desc";
  if (normalized === "created-asc" || normalized === "created") return "created-asc";
  if (normalized === "created-desc") return "created-desc";
  if (normalized === "comments-asc" || normalized === "comments") return "comments-asc";
  if (normalized === "comments-desc") return "comments-desc";
  return null;
}

function unquoteQueryValue(value: string) {
  return value.trim().replace(/^"|"$/g, "");
}

function uniqueOptions(options: Array<{ label: string; value: string }>) {
  const byValue = new Map<string, { label: string; value: string }>();
  for (const option of options) {
    if (!option.value.trim() || byValue.has(option.value)) continue;
    byValue.set(option.value, option);
  }
  return [...byValue.values()].sort((left, right) => left.label.localeCompare(right.label, "zh-Hans-CN"));
}

function latestText(values: Array<string | null | undefined>) {
  let latest = "";
  for (const value of values) {
    if (!value) continue;
    if (!latest || timestamp(value) > timestamp(latest)) latest = value;
  }
  return latest;
}

function timestamp(value: string) {
  const dateValue = Date.parse(value);
  return Number.isFinite(dateValue) ? dateValue : 0;
}

function normalizeSearchText(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function compareText(left: string, right: string) {
  if (left === right) return 0;
  return left > right ? 1 : -1;
}

function compareTextDescending(left: string, right: string) {
  return compareText(right, left);
}

function compareNumber(left: number, right: number) {
  return left === right ? 0 : left > right ? 1 : -1;
}
