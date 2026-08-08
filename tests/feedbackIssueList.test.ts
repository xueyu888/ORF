import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFeedbackIssueCurrentViewCsv,
  feedbackIssueCsvExportFileName,
} from "@orf/feedback-module/web";
import {
  buildFeedbackIssueListItems,
  feedbackIssueListCountsForFilters,
  filterFeedbackIssueListItems,
  type FeedbackIssueListFilters,
} from "@orf/feedback-module/web";
import { feedbackIssueLinkedFeedback } from "@orf/feedback-module/web";
import {
  feedbackIssueListFilterParamsFromPreferenceRecord,
  feedbackIssueListFilterPreferenceRecordFromSearchParams,
  feedbackIssueListFilterQueryFromSearchParams,
  parseStoredFeedbackIssueListFilterParams,
} from "@orf/feedback-module/web";
import {
  buildFeedbackIssueListProjection,
  feedbackIssueListPaginationFromInput,
} from "@orf/feedback-module/contracts";
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
  assert.deepEqual(feedbackIssueListCountsForFilters(items, projectOpenFilters), {
    all: 2,
    assigned: 0,
    closed: 1,
    open: 1,
    triage: 1,
    unread: 0,
    verification: 0,
  });
  assert.deepEqual(feedbackIssueListCountsForFilters(items, { ...projectOpenFilters, query: "is:open" }), {
    all: 1,
    assigned: 0,
    closed: 0,
    open: 1,
    triage: 1,
    unread: 0,
    verification: 0,
  });
});

test("feedback list exposes user work queues from viewer projections", () => {
  const items = buildFeedbackIssueListItems({
    comments: [],
    feedback: [
      feedback({ id: "fb-assigned", title: "待我处理", requiresAction: true, stage: "in_progress" }),
      feedback({ id: "fb-verification", title: "待我验证", requiresAction: true, stage: "pending_verification" }),
      feedback({ id: "fb-unread", title: "有新动态", priority: "p1", unread: true }),
      feedback({ id: "fb-triage", title: "待分诊", priority: null }),
    ],
    projects,
    users,
  });

  assert.deepEqual(feedbackIssueListCountsForFilters(items, filters({ listState: "all" })), {
    all: 4,
    assigned: 1,
    closed: 0,
    open: 4,
    triage: 3,
    unread: 1,
    verification: 1,
  });
  assert.deepEqual(
    filterFeedbackIssueListItems(items, filters({ listState: "assigned" })).map((item) => item.feedback.id),
    ["fb-assigned"],
  );
  assert.deepEqual(
    filterFeedbackIssueListItems(items, filters({ listState: "verification" })).map((item) => item.feedback.id),
    ["fb-verification"],
  );
  assert.deepEqual(
    filterFeedbackIssueListItems(items, filters({ query: "is:unread" })).map((item) => item.feedback.id),
    ["fb-unread"],
  );
  assert.deepEqual(
    filterFeedbackIssueListItems(items, filters({ listState: "triage" })).map((item) => item.feedback.id).sort(),
    ["fb-assigned", "fb-triage", "fb-verification"],
  );
});

test("feedback list projection uses cursor pagination after filtering and sorting", () => {
  const feedbackItems = [
    feedback({ id: "fb-first", title: "第一条", updatedAt: "2026-07-09" }),
    feedback({ id: "fb-second", title: "第二条", updatedAt: "2026-07-08" }),
    feedback({ id: "fb-third", title: "第三条", updatedAt: "2026-07-07" }),
  ];

  const firstPage = buildFeedbackIssueListProjection({
    comments: [],
    feedback: feedbackItems,
    filters: filters({ listState: "all", sort: "updated-desc" }),
    pagination: feedbackIssueListPaginationFromInput({ limit: "2" }),
    projects,
    users,
  });

  assert.deepEqual(firstPage.items.map((item) => item.feedback.id), ["fb-first", "fb-second"]);
  assert.equal(firstPage.matchedCount, 3);
  assert.equal(firstPage.pageInfo.hasMore, true);
  assert.equal(firstPage.pageInfo.limit, 2);
  assert.ok(firstPage.pageInfo.nextCursor);

  const secondPage = buildFeedbackIssueListProjection({
    comments: [],
    feedback: feedbackItems,
    filters: filters({ listState: "all", sort: "updated-desc" }),
    pagination: feedbackIssueListPaginationFromInput({ cursor: firstPage.pageInfo.nextCursor, limit: "2" }),
    projects,
    users,
  });

  assert.deepEqual(secondPage.items.map((item) => item.feedback.id), ["fb-third"]);
  assert.equal(secondPage.pageInfo.hasMore, false);
  assert.equal(secondPage.pageInfo.nextCursor, null);
});

test("feedback list projection can use comment summaries without comment bodies", () => {
  const [item] = buildFeedbackIssueListProjection({
    commentSummaries: [
      {
        commentCount: 3,
        feedbackId: "fb-summary",
        updatedAt: "2026-07-10",
      },
    ],
    feedback: [
      feedback({ id: "fb-summary", title: "摘要反馈", updatedAt: "2026-07-07" }),
    ],
    filters: filters({ listState: "all" }),
    projects,
    users,
  }).items;

  assert.equal(item?.commentCount, 3);
  assert.equal(item?.lastActivityAt, "2026-07-10");
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

test("feedback current-view CSV export uses stable contract columns and escapes user text", () => {
  const [item] = buildFeedbackIssueListItems({
    comments: [],
    feedback: [
      feedback({
        id: "fb-export",
        title: '导出 "CSV"',
        description: "第一行\n第二行",
        priority: "p1",
        projectId: "project-client",
        relations: [
          {
            id: "rel-export",
            createdAt: "2026-07-07",
            sourceFeedbackId: "fb-export",
            targetFeedbackId: "fb-target",
            type: "related",
          },
        ],
      }),
    ],
    projects,
    users,
  });

  const csv = buildFeedbackIssueCurrentViewCsv({
    exportedAt: "2026-08-08T10:11:12.000Z",
    filters: filters({ listState: "open", projectId: "project-client", query: "CSV" }),
    items: item ? [item] : [],
  });

  assert.match(csv, /^\uFEFF"export_version","exported_at","feedback_id"/);
  assert.match(csv, /"orf\.feedback\.current_view\.v1","2026-08-08T10:11:12\.000Z","fb-export"/);
  assert.match(csv, /"导出 ""CSV"""/);
  assert.match(csv, /"第一行\n第二行"/);
  assert.match(csv, /"related:fb-export->fb-target"/);
  assert.match(csv, /"open","project-client","CSV"/);
  assert.equal(feedbackIssueCsvExportFileName("2026-08-08T10:11:12.000Z"), "orf-feedback-current-view-20260808-101112.csv");
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
    lastActivityByUserId: "user-creator",
    lastActivitySequence: 0,
    lastSeenSequence: 0,
    priority: null,
    reportAttachments: [],
    relations: [],
    requiresAction: false,
    assigneeUserId: "user-owner",
    title: input.title,
    description: "正文",
    projectId: input.projectId ?? null,
    stage: "open",
    resolution: null,
    updatedAt: "2026-07-07",
    updatedBy: "user-creator",
    unread: false,
    version: 0,
    closedAt: null,
    closedByUserId: null,
    ...input,
  };
}
