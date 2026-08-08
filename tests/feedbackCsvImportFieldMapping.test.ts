import assert from "node:assert/strict";
import test from "node:test";

import { preflightFeedbackImport } from "@orf/feedback-module/server";

test("feedback CSV import preflight maps Chinese field headers", async () => {
  const { database, inserted } = fakeImportDatabase();
  const csv = [
    "导出版本,反馈 ID,标题,正文,影响,分类,优先级,处理人 ID,项目 ID",
    "orf.feedback.current_view.v1,legacy-1,标题一,正文一,high,技术问题 | 体验问题,p1,user-1,project-1",
  ].join("\n");

  const preflight = await preflightFeedbackImport(database, {
    actor: importActor(),
    body: Buffer.from(csv, "utf8"),
    fileName: "feedback.csv",
    knownAssigneeUserIds: new Set(["user-1"]),
    knownProjectIds: new Set(["project-1"]),
    mimeType: "text/csv",
  });

  assert.equal(preflight.sourceKind, "csv");
  assert.equal(preflight.commitAvailable, true);
  assert.equal(preflight.summary.newRecords, 1);
  assert.equal(preflight.fieldMappings?.find((item) => item.field === "feedback_id")?.sourceColumn, "反馈 ID");
  assert.equal(preflight.fieldMappings?.find((item) => item.field === "cause_categories")?.sourceColumn, "分类");
  assert.equal(inserted[0]?.status, "validated");
  assert.deepEqual((inserted[0]?.summary as { records: Array<{ causeCategories: string[] }> }).records[0]?.causeCategories, ["技术问题", "体验问题"]);
});

test("feedback CSV import preflight reports missing required mapped fields", async () => {
  const { database, inserted } = fakeImportDatabase();
  const preflight = await preflightFeedbackImport(database, {
    actor: importActor(),
    body: Buffer.from("标题,正文\n缺字段,正文", "utf8"),
    fileName: "feedback.csv",
    knownAssigneeUserIds: new Set(),
    knownProjectIds: new Set(),
    mimeType: "text/csv",
  });

  assert.equal(preflight.sourceKind, "csv");
  assert.equal(preflight.commitAvailable, false);
  assert.ok(preflight.errors.some((item) => item.field === "feedback_id"));
  assert.ok(preflight.fieldMappings?.some((item) => item.required && !item.sourceColumn));
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
      select: () => ({
        from: () => ({
          where: async () => [],
        }),
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
