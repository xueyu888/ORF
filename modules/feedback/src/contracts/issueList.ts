import type { FeedbackImpact, FeedbackPriority, FeedbackResolution, FeedbackStage } from "./index";
import type { FeedbackWebCommentThread, FeedbackWebIssue, FeedbackWebProject, FeedbackWebUser } from "./readModel";
import { feedbackImpactLabel, feedbackLifecycleLabel, feedbackPriorityLabel, feedbackResolutionLabel, feedbackStageLabel } from "./labels";

export type FeedbackIssueListState = "assigned" | "open" | "verification" | "unread" | "triage" | "closed" | "all";
export type FeedbackIssueSortKey = "updated-desc" | "created-desc" | "priority";
export type FeedbackIssuePriorityFilter = "All" | "untriaged" | FeedbackPriority;

export type FeedbackIssueListFilters = {
  assigneeUserId: string;
  authorUserId: string;
  cause: string;
  impact: "All" | FeedbackImpact;
  listState: FeedbackIssueListState;
  priority: FeedbackIssuePriorityFilter;
  projectId: string;
  query: string;
  resolution: "All" | FeedbackResolution;
  sort: FeedbackIssueSortKey;
  stage: "All" | FeedbackStage;
};

export type FeedbackIssueListFilterInput = {
  assignee?: string | readonly string[] | null;
  author?: string | readonly string[] | null;
  impact?: string | readonly string[] | null;
  label?: string | readonly string[] | null;
  priority?: string | readonly string[] | null;
  project?: string | readonly string[] | null;
  q?: string | readonly string[] | null;
  resolution?: string | readonly string[] | null;
  sort?: string | readonly string[] | null;
  stage?: string | readonly string[] | null;
  state?: string | readonly string[] | null;
};

export type FeedbackIssueListPageInput = {
  cursor?: string | readonly string[] | null;
  limit?: string | readonly string[] | null;
};

export type FeedbackIssueListRequestInput = FeedbackIssueListFilterInput & FeedbackIssueListPageInput;

export type FeedbackIssueListPagination = {
  cursor: string | null;
  limit: number;
};

export type FeedbackIssueListLabel = FeedbackIssueLabel;

export type FeedbackIssueLabel = {
  key: string;
  name: string;
  tone: "accent" | "danger" | "gold" | "neutral" | "warning";
};

export type FeedbackIssuePerson = {
  avatarUrl: string | null;
  id: string | null;
  name: string;
};

export type FeedbackIssueListItem = {
  assigneeAvatarUrl: string | null;
  assigneeName: string;
  authorAvatarUrl: string | null;
  authorName: string;
  commentCount: number;
  feedback: FeedbackWebIssue;
  issueNumber: string;
  labels: FeedbackIssueListLabel[];
  lastActivityAt: string;
  preview: string;
  projectName: string | null;
};

export type FeedbackIssueListCounts = Record<FeedbackIssueListState, number>;

export type FeedbackIssueListOption = {
  label: string;
  value: string;
};

export type FeedbackIssueListPageInfo = {
  cursor: string | null;
  hasMore: boolean;
  limit: number | null;
  nextCursor: string | null;
};

export type FeedbackIssueListProjection = {
  assigneeOptions: FeedbackIssueListOption[];
  authorOptions: FeedbackIssueListOption[];
  counts: FeedbackIssueListCounts;
  filters: FeedbackIssueListFilters;
  items: FeedbackIssueListItem[];
  labelOptions: FeedbackIssueListOption[];
  matchedCount: number;
  pageInfo: FeedbackIssueListPageInfo;
  totalCount: number;
};

export type FeedbackIssueListProjectionFacts = Pick<
  FeedbackIssueListProjection,
  "counts" | "matchedCount" | "pageInfo" | "totalCount"
> & {
  assigneeOptions?: readonly FeedbackIssueListOption[];
  authorOptions?: readonly FeedbackIssueListOption[];
  labelOptions?: readonly FeedbackIssueListOption[];
};

export type FeedbackIssueListRequest = {
  filters: FeedbackIssueListFilters;
  pagination: FeedbackIssueListPagination | null;
};

export type FeedbackIssueListCommentSummary = {
  commentCount: number;
  feedbackId: string;
  updatedAt: string | null;
};

export type ParsedFeedbackIssueListQuery = {
  assigneeTerms: string[];
  authorTerms: string[];
  impactTerms: string[];
  labelTerms: string[];
  priorityTerms: string[];
  projectTerms: string[];
  resolutionTerms: string[];
  sort: FeedbackIssueSortKey | null;
  stageTerms: string[];
  stateTerms: FeedbackIssueListState[];
  text: string;
};

export type FeedbackIssueListCursor = {
  feedbackId: string;
  sort: FeedbackIssueSortKey;
};

const queryQualifierPattern = /(?:^|\s)(is|status|assignee|owner|author|label|impact|priority|project|resolution|sort|stage):("[^"]+"|\S+)/gi;
const impactValues = new Set<FeedbackImpact>(["low", "medium", "high", "critical"]);
export const feedbackIssueListDefaultPageLimit = 40;
const maxFeedbackIssueListPageLimit = 120;

export const defaultFeedbackIssueListFilters: FeedbackIssueListFilters = {
  assigneeUserId: "All",
  authorUserId: "All",
  cause: "All",
  impact: "All",
  listState: "open",
  priority: "All",
  projectId: "All",
  query: "",
  resolution: "All",
  sort: "updated-desc",
  stage: "All",
};

export const emptyFeedbackIssueListProjection: FeedbackIssueListProjection = {
  assigneeOptions: [],
  authorOptions: [],
  counts: emptyFeedbackIssueListCounts(),
  filters: defaultFeedbackIssueListFilters,
  items: [],
  labelOptions: [],
  matchedCount: 0,
  pageInfo: emptyFeedbackIssueListPageInfo(),
  totalCount: 0,
};

export function feedbackIssueListRequestFromInput(input: FeedbackIssueListRequestInput): FeedbackIssueListRequest {
  return {
    filters: feedbackIssueListFiltersFromInput(input),
    pagination: feedbackIssueListPaginationFromInput(input),
  };
}

export function feedbackIssueListFiltersFromInput(input: FeedbackIssueListFilterInput): FeedbackIssueListFilters {
  return {
    assigneeUserId: feedbackIssueListStringFilter(input.assignee, "All"),
    authorUserId: feedbackIssueListStringFilter(input.author, "All"),
    cause: feedbackIssueListStringFilter(input.label, "All"),
    impact: feedbackIssueListImpactFilter(input.impact),
    listState: feedbackIssueListStateFilter(input.state),
    priority: feedbackIssueListPriorityFilter(input.priority),
    projectId: feedbackIssueListStringFilter(input.project, "All"),
    query: feedbackIssueListInputValue(input.q),
    resolution: feedbackIssueListResolutionFilter(input.resolution),
    sort: feedbackIssueSortForQueryValue(feedbackIssueListInputValue(input.sort)) ?? defaultFeedbackIssueListFilters.sort,
    stage: feedbackIssueListStageFilter(input.stage),
  };
}

export function feedbackIssueListPaginationFromInput(input: FeedbackIssueListPageInput): FeedbackIssueListPagination | null {
  const cursor = feedbackIssueListInputValue(input.cursor);
  const limitValue = feedbackIssueListInputValue(input.limit);
  if (!cursor && !limitValue) return null;

  const parsedLimit = Number.parseInt(limitValue, 10);
  const limit = Number.isFinite(parsedLimit)
    ? Math.max(1, Math.min(maxFeedbackIssueListPageLimit, parsedLimit))
    : feedbackIssueListDefaultPageLimit;

  return {
    cursor: cursor || null,
    limit,
  };
}

export function buildFeedbackIssueListProjection(input: {
  commentSummaries?: readonly FeedbackIssueListCommentSummary[];
  comments?: readonly FeedbackWebCommentThread[];
  feedback: readonly FeedbackWebIssue[];
  filters: FeedbackIssueListFilters;
  pagination?: FeedbackIssueListPagination | null;
  projectionFacts?: FeedbackIssueListProjectionFacts;
  projects?: readonly FeedbackWebProject[];
  users: readonly FeedbackWebUser[];
}): FeedbackIssueListProjection {
  const items = buildFeedbackIssueListItems(input);
  if (input.projectionFacts) {
    return {
      assigneeOptions: [...(input.projectionFacts.assigneeOptions ?? feedbackIssueAssigneeOptions(items))],
      authorOptions: [...(input.projectionFacts.authorOptions ?? feedbackIssueAuthorOptions(items))],
      counts: input.projectionFacts.counts,
      filters: input.filters,
      items,
      labelOptions: [...(input.projectionFacts.labelOptions ?? feedbackIssueLabelOptions(items))],
      matchedCount: input.projectionFacts.matchedCount,
      pageInfo: input.projectionFacts.pageInfo,
      totalCount: input.projectionFacts.totalCount,
    };
  }

  const filteredItems = filterFeedbackIssueListItems(items, input.filters);
  const effectiveSort = feedbackIssueListEffectiveSort(input.filters);
  const page = paginateFeedbackIssueListItems(filteredItems, input.pagination ?? null, effectiveSort);
  return {
    assigneeOptions: feedbackIssueAssigneeOptions(items),
    authorOptions: feedbackIssueAuthorOptions(items),
    counts: feedbackIssueListCountsForFilters(items, input.filters),
    filters: input.filters,
    items: page.items,
    labelOptions: feedbackIssueLabelOptions(items),
    matchedCount: filteredItems.length,
    pageInfo: page.pageInfo,
    totalCount: items.length,
  };
}

export function buildFeedbackIssueListItems(input: {
  commentSummaries?: readonly FeedbackIssueListCommentSummary[];
  comments?: readonly FeedbackWebCommentThread[];
  feedback: readonly FeedbackWebIssue[];
  projects?: readonly FeedbackWebProject[];
  users: readonly FeedbackWebUser[];
}): FeedbackIssueListItem[] {
  const comments = input.comments ?? [];
  const threadsByFeedbackId = new Map<string, FeedbackWebCommentThread[]>();
  for (const thread of comments) {
    if (thread.targetType !== "feedback") continue;
    const threads = threadsByFeedbackId.get(thread.targetId) ?? [];
    threads.push(thread);
    threadsByFeedbackId.set(thread.targetId, threads);
  }

  const projectById = new Map((input.projects ?? []).map((project) => [project.id, project]));
  const commentSummaryByFeedbackId = new Map((input.commentSummaries ?? []).map((summary) => [summary.feedbackId, summary]));

  return input.feedback.map((feedback) => {
    const assignee = feedbackIssueAssignee(feedback, input.users);
    const author = feedbackIssueAuthor(feedback, input.users);
    const threads = threadsByFeedbackId.get(feedback.id) ?? [];
    const commentSummary = commentSummaryByFeedbackId.get(feedback.id) ?? null;
    const threadActivityAt = commentSummary?.updatedAt ?? latestText(threads.map((thread) => thread.updatedAt));

    return {
      assigneeAvatarUrl: assignee.avatarUrl,
      assigneeName: assignee.name,
      authorAvatarUrl: author.avatarUrl,
      authorName: author.name,
      commentCount: commentSummary?.commentCount ?? feedbackIssueCommentCount(comments, feedback.id),
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
  return filterFeedbackIssueListItemsWithSort(items, filters).items;
}

function filterFeedbackIssueListItemsWithSort(items: readonly FeedbackIssueListItem[], filters: FeedbackIssueListFilters) {
  const parsedQuery = parseFeedbackIssueListQuery(filters.query);
  const sort = parsedQuery.sort ?? filters.sort;
  return {
    items: filterFeedbackIssueListMatches(items, filters, parsedQuery, filters.listState)
      .sort((left, right) => compareFeedbackIssueListItems(left, right, sort)),
    sort,
  };
}

export function feedbackIssueListEffectiveSort(filters: FeedbackIssueListFilters) {
  return parseFeedbackIssueListQuery(filters.query).sort ?? filters.sort;
}

function paginateFeedbackIssueListItems(
  items: readonly FeedbackIssueListItem[],
  pagination: FeedbackIssueListPagination | null,
  sort: FeedbackIssueSortKey,
) {
  if (!pagination) {
    return {
      items: [...items],
      pageInfo: emptyFeedbackIssueListPageInfo(),
    };
  }

  const cursor = feedbackIssueListCursorFromText(pagination.cursor);
  const startIndex = cursor && cursor.sort === sort
    ? Math.max(0, items.findIndex((item) => item.feedback.id === cursor.feedbackId) + 1)
    : 0;
  const pageItems = items.slice(startIndex, startIndex + pagination.limit);
  const hasMore = startIndex + pagination.limit < items.length;
  const lastItem = pageItems.at(-1) ?? null;

  return {
    items: pageItems,
    pageInfo: {
      cursor: pagination.cursor,
      hasMore,
      limit: pagination.limit,
      nextCursor: hasMore && lastItem ? feedbackIssueListCursorForFeedback(lastItem.feedback, sort) : null,
    },
  };
}

export function feedbackIssueListCounts(items: readonly FeedbackIssueListItem[]) {
  const counts = emptyFeedbackIssueListCounts(items.length);
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
  const parsedQuery = parseFeedbackIssueListQuery(filters.query);
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
  return uniqueOptions(items.flatMap((item) => item.feedback.causeCategories.map((cause) => ({ label: cause, value: cause }))));
}

function filterFeedbackIssueListMatches(
  items: readonly FeedbackIssueListItem[],
  filters: FeedbackIssueListFilters,
  parsedQuery: ParsedFeedbackIssueListQuery,
  listState: FeedbackIssueListState,
) {
  return [...items]
    .filter((item) => itemMatchesListState(item, listState))
    .filter((item) => filters.cause === "All" || labelMatches(item, filters.cause))
    .filter((item) => filters.impact === "All" || item.feedback.impact === filters.impact)
    .filter((item) => filters.priority === "All" || priorityMatches(item.feedback.priority, filters.priority))
    .filter((item) => projectFilterMatches(item, filters.projectId))
    .filter((item) => filters.resolution === "All" || item.feedback.resolution === filters.resolution)
    .filter((item) => filters.stage === "All" || item.feedback.stage === filters.stage)
    .filter((item) => filters.assigneeUserId === "All" || item.feedback.assigneeUserId === filters.assigneeUserId)
    .filter((item) => filters.authorUserId === "All" || item.feedback.createdBy === filters.authorUserId)
    .filter((item) => parsedQuery.stateTerms.length === 0 || parsedQuery.stateTerms.some((state) => itemMatchesListState(item, state)))
    .filter((item) => parsedQuery.assigneeTerms.every((term) => personMatches(item.feedback.assigneeUserId ?? "", term)))
    .filter((item) => parsedQuery.authorTerms.every((term) => personMatches(item.feedback.createdBy ?? "", term)))
    .filter((item) => parsedQuery.labelTerms.every((term) => labelMatches(item, term)))
    .filter((item) => parsedQuery.impactTerms.every((term) => impactMatches(item.feedback.impact, term)))
    .filter((item) => parsedQuery.priorityTerms.every((term) => priorityMatchesTerm(item.feedback.priority, term)))
    .filter((item) => parsedQuery.projectTerms.every((term) => projectMatches(item, term)))
    .filter((item) => parsedQuery.resolutionTerms.every((term) => resolutionMatches(item.feedback.resolution, term)))
    .filter((item) => parsedQuery.stageTerms.every((term) => stageMatches(item.feedback.stage, term)))
    .filter((item) => textMatches(item, parsedQuery.text));
}

export function parseFeedbackIssueListQuery(query: string): ParsedFeedbackIssueListQuery {
  const parsed: ParsedFeedbackIssueListQuery = {
    assigneeTerms: [],
    authorTerms: [],
    impactTerms: [],
    labelTerms: [],
    priorityTerms: [],
    projectTerms: [],
    resolutionTerms: [],
    sort: null,
    stageTerms: [],
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
    if (qualifier === "priority") {
      parsed.priorityTerms.push(value);
      continue;
    }
    if (qualifier === "project") {
      parsed.projectTerms.push(value);
      continue;
    }
    if (qualifier === "resolution") {
      parsed.resolutionTerms.push(value);
      continue;
    }
    if (qualifier === "sort") {
      parsed.sort = feedbackIssueSortForQueryValue(value) ?? parsed.sort;
    }
    if (qualifier === "stage") {
      parsed.stageTerms.push(value);
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

export function isFeedbackIssueOpen(feedback: Pick<FeedbackWebIssue, "stage">) {
  return feedback.stage !== "closed";
}

export function feedbackIssueStateLabel(feedback: Pick<FeedbackWebIssue, "resolution" | "stage">) {
  return feedbackLifecycleLabel(feedback);
}

export function feedbackIssueDisplayId(value: string) {
  const normalized = value.replace(/^fb-/, "");
  return normalized.length > 8 ? normalized.slice(0, 8) : normalized;
}

export function feedbackIssueBodyPreview(value: string) {
  return feedbackMarkdownToPlainText(value, { attachmentText: "[附件]" });
}

export function feedbackIssueCommentCount(comments: readonly FeedbackWebCommentThread[], feedbackId: string) {
  const messages = comments
    .filter((thread) => thread.targetType === "feedback" && thread.targetId === feedbackId)
    .flatMap((thread) => thread.messages)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  return messages.length;
}

export function feedbackIssueLabels(feedback: Pick<FeedbackWebIssue, "causeCategories">): FeedbackIssueLabel[] {
  const causes = Array.from(new Set(feedback.causeCategories.map((cause) => cause.trim()).filter(Boolean)));
  return causes.map((cause) => ({
    key: `cause:${cause}`,
    name: cause,
    tone: causeLabelTone(cause),
  }));
}

export function feedbackIssueAssignee(feedback: Pick<FeedbackWebIssue, "assigneeUserId">, users: readonly FeedbackWebUser[]): FeedbackIssuePerson {
  const user = feedback.assigneeUserId ? users.find((item) => item.id === feedback.assigneeUserId) ?? null : null;
  return {
    avatarUrl: user?.avatarUrl ?? null,
    id: feedback.assigneeUserId || user?.id || null,
    name: user?.name ?? "未指派",
  };
}

export function feedbackIssueAuthor(feedback: Pick<FeedbackWebIssue, "createdBy">, users: readonly FeedbackWebUser[]): FeedbackIssuePerson {
  const user = users.find((item) => item.id === feedback.createdBy) ?? null;
  return {
    avatarUrl: user?.avatarUrl ?? null,
    id: user?.id ?? feedback.createdBy ?? null,
    name: user?.name ?? "未知成员",
  };
}

function feedbackMarkdownToPlainText(value: string, options: { attachmentText?: string } = {}) {
  const attachmentText = options.attachmentText ?? "[附件]";
  return value
    .replace(/!\[[^\]]*]\([^)]+\)/g, attachmentText)
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*_~>#-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compareFeedbackIssueListItems(left: FeedbackIssueListItem, right: FeedbackIssueListItem, sort: FeedbackIssueSortKey) {
  if (sort === "priority") {
    return compareNumber(priorityRank(left.feedback.priority), priorityRank(right.feedback.priority))
      || compareTextDescending(left.lastActivityAt, right.lastActivityAt)
      || compareTextDescending(left.feedback.createdAt, right.feedback.createdAt)
      || compareTextDescending(left.feedback.id, right.feedback.id);
  }
  if (sort === "created-desc") {
    return compareTextDescending(left.feedback.createdAt, right.feedback.createdAt) || compareTextDescending(left.feedback.id, right.feedback.id);
  }
  return compareTextDescending(left.lastActivityAt, right.lastActivityAt) || compareTextDescending(left.feedback.createdAt, right.feedback.createdAt) || compareTextDescending(left.feedback.id, right.feedback.id);
}

function textMatches(item: FeedbackIssueListItem, text: string) {
  const normalizedText = normalizeSearchText(text);
  if (!normalizedText) return true;

  const searchable = normalizeSearchText([
    item.feedback.id,
    item.issueNumber,
    item.feedback.title,
    item.feedback.description,
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
  return normalizeSearchText(projectId).includes(normalizedTerm);
}

function labelMatches(item: FeedbackIssueListItem, term: string) {
  const normalizedTerm = normalizeSearchText(term);
  return item.labels.some((label) => normalizeSearchText(label.name).includes(normalizedTerm));
}

function personMatches(userId: string, term: string) {
  const normalizedTerm = normalizeSearchText(term);
  return normalizeSearchText(userId).includes(normalizedTerm);
}

function impactMatches(impact: FeedbackImpact, term: string) {
  const normalizedTerm = normalizeSearchText(term);
  return normalizeSearchText(impact).includes(normalizedTerm) || normalizeSearchText(feedbackImpactLabel[impact]).includes(normalizedTerm);
}

function priorityMatches(priority: FeedbackPriority | null, filter: FeedbackIssuePriorityFilter) {
  if (filter === "All") return true;
  if (filter === "untriaged") return priority === null;
  return priority === filter;
}

function priorityMatchesTerm(priority: FeedbackPriority | null, term: string) {
  const normalizedTerm = normalizeSearchText(term);
  if (!normalizedTerm) return true;
  if (priority === null) {
    return ["untriaged", "none", "null", "未分诊"].some((value) => normalizeSearchText(value).includes(normalizedTerm));
  }
  return normalizeSearchText(priority).includes(normalizedTerm) || normalizeSearchText(feedbackPriorityLabel[priority]).includes(normalizedTerm);
}

function resolutionMatches(resolution: FeedbackResolution | null, term: string) {
  const normalizedTerm = normalizeSearchText(term);
  if (!normalizedTerm) return true;
  if (resolution === null) {
    return ["none", "null", "无结论"].some((value) => normalizeSearchText(value).includes(normalizedTerm));
  }
  return normalizeSearchText(resolution).includes(normalizedTerm) || normalizeSearchText(feedbackResolutionLabel[resolution]).includes(normalizedTerm);
}

function stageMatches(stage: FeedbackStage, term: string) {
  const normalizedTerm = normalizeSearchText(term);
  return normalizeSearchText(stage).includes(normalizedTerm) || normalizeSearchText(feedbackStageLabel[stage]).includes(normalizedTerm);
}

function causeLabelTone(value: string): FeedbackIssueLabel["tone"] {
  if (/管理|流程|协作/.test(value)) return "gold";
  if (/技术|系统|质量|缺陷|bug/i.test(value)) return "accent";
  if (/风险|事故|阻塞/.test(value)) return "warning";
  return "neutral";
}

function feedbackIssueListInputValue(value: string | readonly string[] | null | undefined) {
  const raw = Array.isArray(value) ? value[0] ?? "" : value ?? "";
  return typeof raw === "string" ? raw.trim() : "";
}

function feedbackIssueListStringFilter(value: string | readonly string[] | null | undefined, fallback: string) {
  return feedbackIssueListInputValue(value) || fallback;
}

function feedbackIssueListStateFilter(value: string | readonly string[] | null | undefined): FeedbackIssueListState {
  const state = feedbackIssueListStateForQueryValue(feedbackIssueListInputValue(value));
  return state ?? defaultFeedbackIssueListFilters.listState;
}

function feedbackIssueListImpactFilter(value: string | readonly string[] | null | undefined): "All" | FeedbackImpact {
  const normalized = feedbackIssueListInputValue(value).toLowerCase();
  return impactValues.has(normalized as FeedbackImpact) ? normalized as FeedbackImpact : "All";
}

function feedbackIssueListPriorityFilter(value: string | readonly string[] | null | undefined): FeedbackIssuePriorityFilter {
  const normalized = feedbackIssueListInputValue(value).toLowerCase();
  if (normalized === "untriaged" || normalized === "none" || normalized === "null" || normalized === "未分诊") return "untriaged";
  return feedbackIssueListLabelKey(normalized, feedbackPriorityLabel) ?? "All";
}

function feedbackIssueListResolutionFilter(value: string | readonly string[] | null | undefined): "All" | FeedbackResolution {
  return feedbackIssueListLabelKey(feedbackIssueListInputValue(value), feedbackResolutionLabel) ?? "All";
}

function feedbackIssueListStageFilter(value: string | readonly string[] | null | undefined): "All" | FeedbackStage {
  return feedbackIssueListLabelKey(feedbackIssueListInputValue(value), feedbackStageLabel) ?? "All";
}

function feedbackIssueListLabelKey<T extends string>(value: string, labels: Record<T, string>): T | null {
  const normalized = normalizeSearchText(value);
  if (!normalized) return null;
  for (const key of Object.keys(labels) as T[]) {
    if (normalizeSearchText(key) === normalized || normalizeSearchText(labels[key]) === normalized) return key;
  }
  return null;
}

function emptyFeedbackIssueListCounts(total = 0): FeedbackIssueListCounts {
  return {
    all: total,
    assigned: 0,
    closed: 0,
    open: 0,
    triage: 0,
    unread: 0,
    verification: 0,
  };
}

function emptyFeedbackIssueListPageInfo(): FeedbackIssueListPageInfo {
  return {
    cursor: null,
    hasMore: false,
    limit: null,
    nextCursor: null,
  };
}

export function feedbackIssueListCursorForFeedback(feedback: Pick<FeedbackWebIssue, "id">, sort: FeedbackIssueSortKey) {
  return ["v1", sort, feedback.id].map(encodeURIComponent).join("|");
}

export function feedbackIssueListCursorFromText(value: string | null): FeedbackIssueListCursor | null {
  if (!value) return null;
  const [version, sort, feedbackId] = value.split("|").map((part) => {
    try {
      return decodeURIComponent(part);
    } catch {
      return "";
    }
  });
  if (version !== "v1") return null;
  const normalizedSort = sort ? feedbackIssueSortForQueryValue(sort) : null;
  if (!normalizedSort || !feedbackId) return null;
  return { feedbackId, sort: normalizedSort };
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
  if (normalized === "updated-desc" || normalized === "updated") return "updated-desc";
  if (normalized === "created-desc") return "created-desc";
  if (normalized === "priority") return "priority";
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

function priorityRank(priority: FeedbackPriority | null) {
  if (priority === "p0") return 0;
  if (priority === "p1") return 1;
  if (priority === "p2") return 2;
  if (priority === "p3") return 3;
  return 4;
}
