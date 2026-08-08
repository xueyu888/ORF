import assert from "node:assert/strict";
import test from "node:test";

import type { FeedbackIssueReadModelData } from "@orf/feedback-module/contracts";
import {
  buildFeedbackBackupZip,
  preflightFeedbackImport,
} from "@orf/feedback-module/testing";

test("feedback ZIP import preflight validates manifest files and keeps commit closed", async () => {
  const { database, inserted } = fakeImportDatabase();
  const content = Buffer.from("report attachment", "utf8");
  const preflight = await preflightFeedbackImport(database, {
    actor: importActor(),
    body: buildFeedbackBackupZip({
      attachmentFiles: [
        {
          attachmentId: "ratt-1",
          content,
          feedbackId: "fb-1",
          fileName: "report.txt",
          fileSize: content.length,
          kind: "report",
          mimeType: "text/plain",
        },
      ],
      data: backupData(),
      exportedAt: "2026-08-08T10:11:12.000Z",
    }),
    fileName: "orf-feedback-backup.zip",
    knownAssigneeUserIds: new Set(["user-1"]),
    knownProjectIds: new Set(["project-1"]),
    mimeType: "application/zip",
  });

  assert.equal(preflight.sourceKind, "zip");
  assert.equal(preflight.errors.length, 0);
  assert.equal(preflight.summary.totalRecords, 1);
  assert.equal(preflight.summary.attachmentBytes, content.length);
  assert.equal(preflight.referenceIssues?.length ?? 0, 0);
  assert.equal(preflight.commitAvailable, false);
  assert.match(preflight.commitBlockedReason ?? "", /恢复提交/);
  assert.equal(inserted[0]?.sourceKind, "zip");
  assert.equal(inserted[0]?.status, "uploaded");
});

test("feedback ZIP import preflight requires explicit backup reference mapping", async () => {
  const unresolved = fakeImportDatabase();
  const zip = buildFeedbackBackupZip({
    attachmentFiles: [],
    data: backupData(),
    exportedAt: "2026-08-08T10:11:12.000Z",
  });

  const preflight = await preflightFeedbackImport(unresolved.database, {
    actor: importActor(),
    body: zip,
    fileName: "orf-feedback-backup.zip",
    knownAssigneeUserIds: new Set(["target-user"]),
    knownProjectIds: new Set(["target-project"]),
    mimeType: "application/zip",
  });

  assert.equal(preflight.errors.length, 0);
  assert.equal(preflight.commitAvailable, false);
  assert.match(preflight.commitBlockedReason ?? "", /用户和项目映射/);
  assert.deepEqual(preflight.referenceIssues?.map((item) => ({
    canClear: item.canClear,
    kind: item.kind,
    rows: item.rows,
    sourceValue: item.sourceValue,
  })), [
    { canClear: false, kind: "assignee", rows: [], sourceValue: "user-1" },
    { canClear: true, kind: "project", rows: [], sourceValue: "project-1" },
  ]);
  assert.equal(unresolved.inserted[0]?.status, "uploaded");

  const mapped = fakeImportDatabase();
  const mappedPreflight = await preflightFeedbackImport(mapped.database, {
    actor: importActor(),
    body: zip,
    fileName: "orf-feedback-backup.zip",
    knownAssigneeUserIds: new Set(["target-user"]),
    knownProjectIds: new Set(["target-project"]),
    mimeType: "application/zip",
    referenceMappings: {
      assigneeUserIds: { "user-1": "target-user" },
      projectIds: { "project-1": null },
    },
  });

  assert.equal(mappedPreflight.errors.length, 0);
  assert.equal(mappedPreflight.referenceIssues?.length ?? 0, 0);
  assert.equal(mappedPreflight.commitAvailable, false);
  assert.match(mappedPreflight.commitBlockedReason ?? "", /恢复提交/);
});

test("feedback ZIP import preflight rejects tampered content by SHA-256", async () => {
  const { database, inserted } = fakeImportDatabase();
  const zip = buildFeedbackBackupZip({
    attachmentFiles: [],
    data: backupData(),
    exportedAt: "2026-08-08T10:11:12.000Z",
  });
  const tampered = Buffer.from(zip);
  const marker = Buffer.from("反馈标题", "utf8");
  const offset = tampered.indexOf(marker);
  assert.notEqual(offset, -1);
  tampered[offset] = "X".charCodeAt(0);

  const preflight = await preflightFeedbackImport(database, {
    actor: importActor(),
    body: tampered,
    fileName: "orf-feedback-backup.zip",
    knownAssigneeUserIds: new Set(),
    knownProjectIds: new Set(),
    mimeType: "application/zip",
  });

  assert.equal(preflight.sourceKind, "zip");
  assert.equal(preflight.commitAvailable, false);
  assert.ok(preflight.errors.some((item) => item.message.includes("SHA-256")));
  assert.equal(inserted[0]?.status, "failed");
});

function fakeImportDatabase() {
  const inserted: Array<Record<string, unknown>> = [];
  return {
    database: {
      insert: () => ({
        values: async (value: Record<string, unknown>) => {
          inserted.push(value);
        },
      }),
    } as never,
    inserted,
  };
}

function importActor() {
  return {
    id: "user-1",
    role: "admin",
    status: "active",
    teamId: "team-1",
  } as const;
}

function backupData(): FeedbackIssueReadModelData {
  return {
    comments: [],
    feedback: [
      {
        activity: [],
        assigneeUserId: "user-1",
        capabilities: {
          canAcceptVerification: true,
          canChangeAssignee: true,
          canEditReport: true,
          canImportExport: true,
          canRejectVerification: true,
          canReopen: true,
          canSetPriority: true,
          canStart: true,
          canSubmitVerification: true,
          canView: true,
          canWithdraw: true,
        },
        causeCategories: ["技术问题"],
        createdAt: "2026-08-08T09:00:00.000Z",
        createdBy: "user-1",
        description: "原始报告",
        id: "fb-1",
        impact: "high",
        lastActivitySequence: 1,
        lastSeenSequence: 0,
        priority: "p1",
        projectId: "project-1",
        relations: [],
        reportAttachments: [
          {
            contentUrl: "/api/feedback/report-attachments/ratt-1/content",
            downloadUrl: "/api/feedback/report-attachments/ratt-1/content?disposition=attachment",
            fileName: "report.txt",
            fileSize: 17,
            id: "ratt-1",
            mimeType: "text/plain",
            previewKind: "text",
          },
        ],
        requiresAction: false,
        resolution: null,
        stage: "open",
        title: "反馈标题",
        unread: false,
        updatedAt: "2026-08-08T09:00:00.000Z",
        version: 0,
      },
    ],
    projects: [{ createdAt: "2026-08-08T08:00:00.000Z", id: "project-1", name: "项目一", updatedAt: "2026-08-08T08:00:00.000Z" }],
    users: [{ id: "user-1", name: "薛雨", role: "admin", status: "active" }],
  };
}
