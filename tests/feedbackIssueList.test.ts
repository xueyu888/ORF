import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFeedbackIssueListItems,
  filterFeedbackIssueListItems,
  type FeedbackIssueListFilters,
} from "../src/features/feedback/model/feedbackIssueList";
import {
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
      feedback({ id: "fb-client", projectId: "project-client", phenomenon: "客户端崩溃" }),
      feedback({ id: "fb-unassigned", projectId: null, phenomenon: "无项目反馈" }),
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
      feedback({ id: "fb-client", projectId: "project-client", phenomenon: "客户端崩溃" }),
      feedback({ id: "fb-backend", projectId: "project-backend", phenomenon: "接口超时" }),
      feedback({ id: "fb-unassigned", projectId: null, phenomenon: "无项目反馈" }),
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

test("feedback list filter preference stores project first and skips default filters", () => {
  const query = feedbackIssueListFilterQueryFromSearchParams(
    new URLSearchParams({
      impact: "High",
      project: "project-client",
      q: "  crash  ",
      sort: "updated-desc",
      state: "open",
    }),
  );

  assert.equal(query, "project=project-client&q=crash&impact=High");
});

test("feedback list filter preference restores sanitized query params", () => {
  const restored = parseStoredFeedbackIssueListFilterParams(JSON.stringify({
    query: "project=project-client&state=closed&impact=Broken&sort=created-desc&unknown=1",
    version: 1,
  }));

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

function feedback(input: Partial<Feedback> & Pick<Feedback, "id" | "phenomenon">): Feedback {
  return {
    activity: [],
    causeCategories: ["技术问题"],
    createdAt: "2026-07-07",
    createdBy: "user-creator",
    id: input.id,
    impact: "High",
    owner: "处理人",
    ownerUserId: "user-owner",
    phenomenon: input.phenomenon,
    projectId: input.projectId ?? null,
    status: "Open",
    suggestedAdjustment: "正文",
    updatedAt: "2026-07-07",
    ...input,
  };
}
