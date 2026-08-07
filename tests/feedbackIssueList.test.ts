import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFeedbackIssueListItems,
  feedbackIssueListCountsForFilters,
  filterFeedbackIssueListItems,
  type FeedbackIssueListFilters,
} from "../src/features/feedback/model/feedbackIssueList";
import { feedbackIssueLinkedFeedback } from "../src/features/feedback/model/feedbackIssueMetadata";
import {
  feedbackIssueListFilterParamsFromPreferenceRecord,
  feedbackIssueListFilterPreferenceRecordFromSearchParams,
  feedbackIssueListFilterQueryFromSearchParams,
  parseStoredFeedbackIssueListFilterParams,
} from "../src/features/feedback/model/feedbackIssueListViewState";
import type { Feedback, OrfProject, OrfUser } from "../src/types/orf";

const users: OrfUser[] = [
  { email: "creator@example.com", id: "user-creator", name: "创建者", role: "member", status: "active" },
  { email: "owner@example.com", id: "user-owner", name: "处理人", role: "member", status: "active" },
];

const projects: OrfProject[] = [
  { createdAt: "2026-07-07", id: "project-client", name: "客户端项目", updatedAt: "2026-07-07" },
  { createdAt: "2026-07-07", id: "project-backend", name: "后端项目", updatedAt: "2026-07-07" },
];

test("feedback list filters by explicit project id and unassigned project bucket", () => {
  const items = buildFeedbackIssueListItems({
    comments: [],
    feedback: [
      feedback({ id: "fb-client", projectId: "project-client", title: "客户端崩溃" }),
      feedback({ id: "fb-unassigned", projectId: null, title: "无项目反馈" }),
    ],
    projects,
    users,
  });

  assert.deepEqual(
    filterFeedbackIssueListItems(items, filters({ projectId: "project-client" })).map((item) => item.feedback.id),
    ["fb-client"],
  );
  assert.deepEqual(
    filterFeedbackIssueListItems(items, filters({ projectId: "unassigned" })).map((item) => item.feedback.id),
    ["fb-unassigned"],
  );
});

test("feedback query supports project qualifier by project name and unassigned alias", () => {
  const items = buildFeedbackIssueListItems({
    comments: [],
    feedback: [
      feedback({ id: "fb-client", projectId: "project-client", title: "客户端崩溃" }),
      feedback({ id: "fb-backend", projectId: "project-backend", title: "接口超时" }),
      feedback({ id: "fb-unassigned", projectId: null, title: "无项目反馈" }),
    ],
    projects,
    users,
  });

  assert.deepEqual(
    filterFeedbackIssueListItems(items, filters({ query: "project:客户端" })).map((item) => item.feedback.id),
    ["fb-client"],
  );
  assert.deepEqual(
    filterFeedbackIssueListItems(items, filters({ query: "project:unassigned" })).map((item) => item.feedback.id),
    ["fb-unassigned"],
  );
});

test("feedback issue state counts follow active filters without swallowing other state tabs", () => {
  const items = buildFeedbackIssueListItems({
    comments: [],
    feedback: [
      feedback({ id: "fb-client-open", projectId: "project-client", title: "客户端崩溃", stage: "open" }),
      feedback({ id: "fb-client-closed", projectId: "project-client", title: "客户端已修复", stage: "closed", resolution: "resolved", closedAt: "2026-07-08", closedByUserId: "user-creator" }),
      feedback({ id: "fb-backend-open", projectId: "project-backend", title: "接口超时", stage: "open" }),
    ],
    projects,
    users,
  });

  const projectOpenFilters = filters({ listState: "open", projectId: "project-client" });

  assert.deepEqual(
    filterFeedbackIssueListItems(items, projectOpenFilters).map((item) => item.feedback.id),
    ["fb-client-open"],
  );
  assert.deepEqual(feedbackIssueListCountsForFilters(items, projectOpenFilters), { all: 2, closed: 1, open: 1 });
  assert.deepEqual(feedbackIssueListCountsForFilters(items, { ...projectOpenFilters, query: "is:open" }), { all: 1, closed: 0, open: 1 });
});

test("feedback linked issues come from relation facts instead of report or comment text", () => {
  const source = feedback({
    id: "fb-source",
    title: "源反馈",
    description: "正文提到了 #fb-text-only，但没有关系事实。",
    relations: [
      {
        id: "rel-1",
        type: "duplicates",
        sourceFeedbackId: "fb-source",
        targetFeedbackId: "fb-target",
        createdBy: "user-creator",
        createdAt: "2026-07-07",
      },
    ],
  });
  const target = feedback({ id: "fb-target", title: "目标反馈" });
  const textOnly = feedback({ id: "fb-text-only", title: "只出现在正文里的反馈" });

  assert.deepEqual(feedbackIssueLinkedFeedback({ feedback: source, feedbackItems: [source, target, textOnly] }), [
    {
      direction: "outgoing",
      id: "fb-target",
      relationId: "rel-1",
      title: "目标反馈",
      type: "duplicates",
    },
  ]);
});

test("feedback list filter preference stores project first and skips default filters", () => {
  const query = feedbackIssueListFilterQueryFromSearchParams(
    new URLSearchParams({
      impact: "high",
      project: "project-client",
      q: "  crash  ",
      sort: "updated-desc",
      state: "open",
    }),
  );

  assert.equal(query, "project=project-client&q=crash&impact=high");
});

test("feedback list filter preference restores sanitized query params", () => {
  const restored = parseStoredFeedbackIssueListFilterParams(JSON.stringify({
    query: "project=project-client&state=closed&impact=Broken&sort=created-desc&unknown=1",
    version: 1,
  }));

  assert.equal(restored?.toString(), "project=project-client&state=closed&sort=created-desc");
});

test("feedback list user preference stores active filter slots without default values", () => {
  const record = feedbackIssueListFilterPreferenceRecordFromSearchParams(
    new URLSearchParams({
      impact: "high",
      project: "project-client",
      q: "  crash  ",
      sort: "updated-desc",
      state: "open",
    }),
  );

  assert.deepEqual(record, {
    values: {
      impact: "high",
      project: "project-client",
      q: "crash",
    },
    version: 1,
  });
});

test("feedback list user preference restores through canonical URL params", () => {
  const restored = feedbackIssueListFilterParamsFromPreferenceRecord({
    values: {
      impact: "Broken",
      project: "project-client",
      sort: "created-desc",
      state: "closed",
      unknown: "ignored",
    },
    version: 1,
  });

  assert.equal(restored?.toString(), "project=project-client&state=closed&sort=created-desc");
});

function filters(input: Partial<FeedbackIssueListFilters>): FeedbackIssueListFilters {
  return {
    assigneeUserId: "All",
    authorUserId: "All",
    cause: "All",
    impact: "All",
    listState: "all",
    projectId: "All",
    query: "",
    sort: "updated-desc",
    ...input,
  };
}

function feedback(input: Partial<Feedback> & Pick<Feedback, "id" | "title">): Feedback {
  return {
    activity: [],
    causeCategories: ["技术问题"],
    createdAt: "2026-07-07",
    createdBy: "user-creator",
    id: input.id,
    impact: "high",
    priority: null,
    reportAttachments: [],
    relations: [],
    assigneeUserId: "user-owner",
    title: input.title,
    description: "正文",
    projectId: input.projectId ?? null,
    stage: "open",
    resolution: null,
    updatedAt: "2026-07-07",
    updatedBy: "user-creator",
    version: 0,
    closedAt: null,
    closedByUserId: null,
    ...input,
  };
}
