import type { FeedbackWebFilterPreferenceRecord } from "../types";
import { feedbackIssueListFiltersFromInput, type FeedbackIssueListFilters } from "../../contracts/issueList";

export type FeedbackIssueListUrlState = FeedbackIssueListFilters;

type StoredFeedbackIssueListFilterPreference = {
  query: string;
  version: 1;
};

export const feedbackIssueListFilterPreferenceKey = "feedback.issueList";

const feedbackIssueListFilterStorageKey = "orf:feedback-issue-list-filters:v1";
const feedbackIssueListFilterParamKeys = [
  "project",
  "q",
  "state",
  "stage",
  "resolution",
  "assignee",
  "author",
  "label",
  "impact",
  "priority",
  "sort",
] as const;

export function feedbackIssueListUrlStateFromSearchParams(searchParams: URLSearchParams): FeedbackIssueListUrlState {
  return feedbackIssueListFiltersFromInput({
    assignee: searchParams.get("assignee"),
    author: searchParams.get("author"),
    impact: searchParams.get("impact"),
    label: searchParams.get("label"),
    priority: searchParams.get("priority"),
    project: searchParams.get("project"),
    q: searchParams.get("q"),
    resolution: searchParams.get("resolution"),
    sort: searchParams.get("sort"),
    stage: searchParams.get("stage"),
    state: searchParams.get("state"),
  });
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
  if (state.stage !== "All") next.set("stage", state.stage);
  if (state.resolution !== "All") next.set("resolution", state.resolution);
  if (state.assigneeUserId !== "All") next.set("assignee", state.assigneeUserId);
  if (state.authorUserId !== "All") next.set("author", state.authorUserId);
  if (state.cause !== "All") next.set("label", state.cause);
  if (state.impact !== "All") next.set("impact", state.impact);
  if (state.priority !== "All") next.set("priority", state.priority);
  if (state.sort !== "updated-desc") next.set("sort", state.sort);

  return next.toString();
}

export function feedbackIssueListFilterPreferenceRecordFromSearchParams(
  searchParams: URLSearchParams,
): FeedbackWebFilterPreferenceRecord | null {
  const state = feedbackIssueListUrlStateFromSearchParams(searchParams);
  const query = state.query.trim();
  const values: FeedbackWebFilterPreferenceRecord["values"] = {};

  if (state.projectId !== "All") values.project = state.projectId;
  if (query) values.q = query;
  if (state.listState !== "open") values.state = state.listState;
  if (state.stage !== "All") values.stage = state.stage;
  if (state.resolution !== "All") values.resolution = state.resolution;
  if (state.assigneeUserId !== "All") values.assignee = state.assigneeUserId;
  if (state.authorUserId !== "All") values.author = state.authorUserId;
  if (state.cause !== "All") values.label = state.cause;
  if (state.impact !== "All") values.impact = state.impact;
  if (state.priority !== "All") values.priority = state.priority;
  if (state.sort !== "updated-desc") values.sort = state.sort;

  return Object.keys(values).length > 0 ? { values, version: 1 } : null;
}

export function feedbackIssueListFilterParamsFromPreferenceRecord(
  record: FeedbackWebFilterPreferenceRecord | null | undefined,
) {
  if (!record) return null;

  const searchParams = new URLSearchParams();
  const projectId = filterPreferenceStringValue(record, "project");
  const query = filterPreferenceStringValue(record, "q");
  const listState = filterPreferenceStringValue(record, "state");
  const stage = filterPreferenceStringValue(record, "stage");
  const resolution = filterPreferenceStringValue(record, "resolution");
  const assigneeUserId = filterPreferenceStringValue(record, "assignee");
  const authorUserId = filterPreferenceStringValue(record, "author");
  const cause = filterPreferenceStringValue(record, "label");
  const impact = filterPreferenceStringValue(record, "impact");
  const priority = filterPreferenceStringValue(record, "priority");
  const sort = filterPreferenceStringValue(record, "sort");

  if (projectId) searchParams.set("project", projectId);
  if (query) searchParams.set("q", query);
  if (listState) searchParams.set("state", listState);
  if (stage) searchParams.set("stage", stage);
  if (resolution) searchParams.set("resolution", resolution);
  if (assigneeUserId) searchParams.set("assignee", assigneeUserId);
  if (authorUserId) searchParams.set("author", authorUserId);
  if (cause) searchParams.set("label", cause);
  if (impact) searchParams.set("impact", impact);
  if (priority) searchParams.set("priority", priority);
  if (sort) searchParams.set("sort", sort);

  const queryString = feedbackIssueListFilterQueryFromSearchParams(searchParams);
  return queryString ? new URLSearchParams(queryString) : null;
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

function feedbackIssueListBrowserStorage() {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function filterPreferenceStringValue(record: FeedbackWebFilterPreferenceRecord, key: string) {
  const value = record.values[key];
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.find((item) => item.trim())?.trim() ?? "";
  return "";
}
