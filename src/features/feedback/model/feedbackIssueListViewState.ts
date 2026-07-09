import type { Impact } from "../../../types/orf";
import type { FeedbackIssueListState, FeedbackIssueSortKey } from "./feedbackIssueList";

export type FeedbackIssueListUrlState = {
  assigneeUserId: string;
  authorUserId: string;
  cause: string;
  impact: "All" | Impact;
  listState: FeedbackIssueListState;
  projectId: string;
  query: string;
  sort: FeedbackIssueSortKey;
};

type StoredFeedbackIssueListFilterPreference = {
  query: string;
  version: 1;
};

const feedbackIssueListFilterStorageKey = "orf:feedback-issue-list-filters:v1";
const feedbackIssueListFilterParamKeys = ["project", "q", "state", "assignee", "author", "label", "impact", "sort"] as const;

export function feedbackIssueListUrlStateFromSearchParams(searchParams: URLSearchParams): FeedbackIssueListUrlState {
  return {
    assigneeUserId: searchParams.get("assignee") || "All",
    authorUserId: searchParams.get("author") || "All",
    cause: searchParams.get("label") || "All",
    impact: feedbackImpactParam(searchParams.get("impact")),
    listState: feedbackListStateParam(searchParams.get("state")),
    projectId: searchParams.get("project") || "All",
    query: searchParams.get("q") ?? "",
    sort: feedbackSortParam(searchParams.get("sort")),
  };
}

export function hasFeedbackIssueListFilterParams(searchParams: URLSearchParams) {
  return feedbackIssueListFilterParamKeys.some((key) => searchParams.has(key));
}

export function feedbackIssueListFilterQueryFromSearchParams(searchParams: URLSearchParams) {
  const state = feedbackIssueListUrlStateFromSearchParams(searchParams);
  const next = new URLSearchParams();
  const query = state.query.trim();

  if (state.projectId !== "All") next.set("project", state.projectId);
  if (query) next.set("q", query);
  if (state.listState !== "open") next.set("state", state.listState);
  if (state.assigneeUserId !== "All") next.set("assignee", state.assigneeUserId);
  if (state.authorUserId !== "All") next.set("author", state.authorUserId);
  if (state.cause !== "All") next.set("label", state.cause);
  if (state.impact !== "All") next.set("impact", state.impact);
  if (state.sort !== "updated-desc") next.set("sort", state.sort);

  return next.toString();
}

export function readStoredFeedbackIssueListFilterParams() {
  const storage = feedbackIssueListBrowserStorage();
  if (!storage) return null;
  try {
    return parseStoredFeedbackIssueListFilterParams(storage.getItem(feedbackIssueListFilterStorageKey));
  } catch {
    return null;
  }
}

export function writeStoredFeedbackIssueListFilterParams(searchParams: URLSearchParams) {
  const storage = feedbackIssueListBrowserStorage();
  if (!storage) return;

  const query = feedbackIssueListFilterQueryFromSearchParams(searchParams);
  try {
    if (!query) {
      storage.removeItem(feedbackIssueListFilterStorageKey);
      return;
    }

    const preference: StoredFeedbackIssueListFilterPreference = { query, version: 1 };
    storage.setItem(feedbackIssueListFilterStorageKey, JSON.stringify(preference));
  } catch {
    // Local persistence is an optional UI preference; feedback facts still come from the URL and API.
  }
}

export function clearStoredFeedbackIssueListFilterParams() {
  const storage = feedbackIssueListBrowserStorage();
  try {
    storage?.removeItem(feedbackIssueListFilterStorageKey);
  } catch {
    // Ignore localStorage failures in private or restricted browser contexts.
  }
}

export function parseStoredFeedbackIssueListFilterParams(raw: string | null) {
  if (!raw) return null;

  try {
    const stored = JSON.parse(raw) as Partial<StoredFeedbackIssueListFilterPreference>;
    if (stored.version !== 1 || typeof stored.query !== "string") return null;

    const query = feedbackIssueListFilterQueryFromSearchParams(new URLSearchParams(stored.query));
    return query ? new URLSearchParams(query) : null;
  } catch {
    return null;
  }
}

function feedbackListStateParam(value: string | null): FeedbackIssueListState {
  if (value === "closed" || value === "all") return value;
  return "open";
}

function feedbackImpactParam(value: string | null): "All" | Impact {
  if (value === "Critical" || value === "High" || value === "Medium" || value === "Low") return value;
  return "All";
}

function feedbackSortParam(value: string | null): FeedbackIssueSortKey {
  if (
    value === "updated-asc" ||
    value === "created-desc" ||
    value === "created-asc" ||
    value === "comments-desc" ||
    value === "comments-asc"
  ) {
    return value;
  }
  return "updated-desc";
}

function feedbackIssueListBrowserStorage() {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}
