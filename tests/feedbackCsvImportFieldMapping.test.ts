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

test("feedback CSV import preflight previews update diffs without enabling overwrite", async () => {
  const { database } = fakeImportDatabase({
    categoryRows: [{ category: "旧分类", feedbackId: "fb-existing", sortOrder: 0 }],
    feedbackRows: [
      {
        assigneeUserId: null,
        description: "旧正文",
        id: "fb-existing",
        impact: "medium",
        priority: null,
        projectId: null,
        title: "旧标题",
      },
    ],
  });
  const csv = [
    "export_version,feedback_id,title,description,impact,cause_categories",
    "orf.feedback.current_view.v1,fb-existing,新标题,旧正文,medium,旧分类 | 新分类",
  ].join("\n");

  const preflight = await preflightFeedbackImport(database, {
    actor: importActor(),
    body: Buffer.from(csv, "utf8"),
    fileName: "feedback.csv",
    knownAssigneeUserIds: new Set(),
    knownProjectIds: new Set(),
    mimeType: "text/csv",
  });

  assert.equal(preflight.commitAvailable, false);
  assert.equal(preflight.summary.newRecords, 0);
  assert.equal(preflight.summary.skippedRecords, 1);
  assert.equal(preflight.summary.updateRecords, 1);
  assert.match(preflight.commitBlockedReason ?? "", /默认不会覆盖/);
  assert.deepEqual(preflight.updateDiffs?.[0]?.fields.map((item) => item.field), ["title", "cause_categories"]);
});

test("feedback CSV import preflight requires explicit project mapping before commit", async () => {
  const first = fakeImportDatabase();
  const csv = [
    "export_version,feedback_id,title,description,impact,cause_categories,project_id",
    "orf.feedback.current_view.v1,legacy-project-1,标题一,正文一,high,技术问题,legacy-project",
  ].join("\n");

  const unresolved = await preflightFeedbackImport(first.database, {
    actor: importActor(),
    body: Buffer.from(csv, "utf8"),
    fileName: "feedback.csv",
    knownAssigneeUserIds: new Set(),
    knownProjectIds: new Set(["project-1"]),
    mimeType: "text/csv",
  });

  assert.equal(unresolved.commitAvailable, false);
  assert.equal(unresolved.errors.length, 0);
  assert.equal(unresolved.referenceIssues?.[0]?.kind, "project");
  assert.equal(unresolved.referenceIssues?.[0]?.sourceValue, "legacy-project");
  assert.equal(first.inserted[0]?.status, "uploaded");

  const second = fakeImportDatabase();
  const mapped = await preflightFeedbackImport(second.database, {
    actor: importActor(),
    body: Buffer.from(csv, "utf8"),
    fileName: "feedback.csv",
    knownAssigneeUserIds: new Set(),
    knownProjectIds: new Set(["project-1"]),
    mimeType: "text/csv",
    referenceMappings: { projectIds: { "legacy-project": null } },
  });

  assert.equal(mapped.commitAvailable, true);
  assert.equal(mapped.referenceIssues?.length ?? 0, 0);
  assert.equal(second.inserted[0]?.status, "validated");
  assert.equal((second.inserted[0]?.summary as { records: Array<{ projectId: string | null }> }).records[0]?.projectId, null);
});

function fakeImportDatabase(input: {
  categoryRows?: Array<{ category: string; feedbackId: string; sortOrder: number }>;
  feedbackRows?: Array<Record<string, unknown>>;
  originRows?: Array<{ externalId: string; feedbackId: string }>;
} = {}) {
  const inserted: Array<Record<string, unknown>> = [];
  return {
    database: {
      insert: () => ({
        values: async (value: Record<string, unknown>) => {
          inserted.push(value);
        },
      }),
      select: (selection: Record<string, unknown>) => ({
        from: () => ({
          where: async () => {
            const keys = Object.keys(selection);
            if (keys.includes("externalId") && keys.includes("feedbackId")) return input.originRows ?? [];
            if (keys.includes("category")) return input.categoryRows ?? [];
            if (keys.includes("title")) return input.feedbackRows ?? [];
            return [];
          },
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
