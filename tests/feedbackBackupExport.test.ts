import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";

import type { FeedbackIssueReadModelData } from "@orf/feedback-module/contracts";
import { buildFeedbackBackupZip } from "@orf/feedback-module/server";

test("feedback backup ZIP includes explicit facts, attachment binaries and SHA-256 manifests", () => {
  const reportContent = Buffer.from("report attachment", "utf8");
  const commentContent = Buffer.from("comment attachment", "utf8");
  const zip = buildFeedbackBackupZip({
    attachmentFiles: [
      {
        attachmentId: "ratt-1",
        content: reportContent,
        feedbackId: "fb-1",
        fileName: "report.txt",
        fileSize: reportContent.length,
        kind: "report",
        mimeType: "text/plain",
      },
      {
        attachmentId: "catt-1",
        content: commentContent,
        feedbackId: "fb-1",
        fileName: "comment.txt",
        fileSize: commentContent.length,
        kind: "comment",
        messageId: "msg-1",
        mimeType: "text/plain",
        threadId: "thread-1",
      },
    ],
    data: backupData(),
    exportedAt: "2026-08-08T10:11:12.000Z",
  });

  const entries = readStoredZip(zip);
  const manifest = JSON.parse(requiredEntry(entries, "manifest.json").toString("utf8")) as {
    counts: Record<string, number>;
    files: Array<{ bytes: number; path: string; sha256: string }>;
    version: string;
  };
  assert.equal(manifest.version, "orf.feedback.backup.v1");
  assert.equal(manifest.counts.feedback, 1);
  assert.equal(manifest.counts.comments, 1);
  assert.equal(manifest.counts.activity, 1);
  assert.equal(manifest.counts.relations, 1);
  assert.equal(manifest.counts.reportAttachments, 1);
  assert.equal(manifest.counts.commentAttachments, 1);
  assert.equal(requiredEntry(entries, "attachments/report/fb-1/ratt-1/report.txt").toString("utf8"), "report attachment");
  assert.equal(requiredEntry(entries, "attachments/comment/fb-1/thread-1/msg-1/catt-1/comment.txt").toString("utf8"), "comment attachment");

  const attachmentRows = jsonLines(requiredEntry(entries, "attachments.jsonl"));
  assert.deepEqual(attachmentRows.map((item) => item.path), [
    "attachments/report/fb-1/ratt-1/report.txt",
    "attachments/comment/fb-1/thread-1/msg-1/catt-1/comment.txt",
  ]);
  assert.equal(attachmentRows[0]?.sha256, sha256(reportContent));
  assert.equal(attachmentRows[1]?.sha256, sha256(commentContent));
  assert.ok(manifest.files.some((item) => item.path === "activity.jsonl"));
  assert.ok(manifest.files.some((item) => item.path === "relations.jsonl"));
  assert.ok(manifest.files.some((item) => item.path === "reference-mappings/users.jsonl"));
  assert.ok(manifest.files.some((item) => item.path === "attachments/report/fb-1/ratt-1/report.txt" && item.sha256 === sha256(reportContent)));
});

function backupData(): FeedbackIssueReadModelData {
  return {
    comments: [
      {
        createdAt: "2026-08-08T09:00:00.000Z",
        createdBy: "user-1",
        id: "thread-1",
        messages: [
          {
            attachments: [
              {
                contentUrl: "/api/comments/attachments/catt-1/content",
                downloadUrl: "/api/comments/attachments/catt-1/content?disposition=attachment",
                fileName: "comment.txt",
                fileSize: 18,
                id: "catt-1",
                mimeType: "text/plain",
                previewKind: "text",
              },
            ],
            author: "薛雨",
            authorUserId: "user-1",
            body: "评论正文",
            createdAt: "2026-08-08T09:01:00.000Z",
            id: "msg-1",
          },
        ],
        status: "open",
        targetId: "fb-1",
        targetTitle: "反馈标题",
        targetType: "feedback",
        updatedAt: "2026-08-08T09:01:00.000Z",
      },
    ],
    feedback: [
      {
        activity: [
          {
            actorUserId: "user-1",
            activityType: "feedback.created",
            at: "2026-08-08T09:00:00.000Z",
            id: "act-1",
            payload: { title: "反馈标题" },
            sequence: 1,
          },
        ],
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
        relations: [
          {
            createdAt: "2026-08-08T09:02:00.000Z",
            id: "rel-1",
            sourceFeedbackId: "fb-1",
            targetFeedbackId: "fb-2",
            type: "related",
          },
        ],
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

function readStoredZip(zip: Buffer) {
  const entries = new Map<string, Buffer>();
  let offset = 0;
  while (offset + 4 <= zip.length && zip.readUInt32LE(offset) === 0x04034b50) {
    const compressedSize = zip.readUInt32LE(offset + 18);
    const fileNameLength = zip.readUInt16LE(offset + 26);
    const extraLength = zip.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const contentStart = nameStart + fileNameLength + extraLength;
    const contentEnd = contentStart + compressedSize;
    entries.set(zip.subarray(nameStart, nameStart + fileNameLength).toString("utf8"), zip.subarray(contentStart, contentEnd));
    offset = contentEnd;
  }
  return entries;
}

function requiredEntry(entries: Map<string, Buffer>, path: string) {
  const entry = entries.get(path);
  assert.ok(entry, `missing ZIP entry ${path}`);
  return entry;
}

function jsonLines(content: Buffer) {
  return content.toString("utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>);
}

function sha256(content: Buffer) {
  return createHash("sha256").update(content).digest("hex");
}
