import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { FeedbackImpact, FeedbackIssueReadModelData, FeedbackPriority } from "../contracts";
import {
  feedback,
  feedbackImportBatches,
  feedbackImportOrigins,
} from "../infrastructure/database/schema";
import {
  createFeedbackDraft,
  createFeedbackIssue,
  type FeedbackWriteActor,
  type FeedbackWriteDatabase,
} from "./writeModel";
import { feedbackNowIso } from "./ids";

type FeedbackTransferDatabase = NodePgDatabase<any> & FeedbackWriteDatabase;

export type FeedbackImportMessage = {
  field?: string;
  message: string;
  row?: number;
};

export type FeedbackImportPreflight = {
  batchId: string;
  errors: FeedbackImportMessage[];
  fileName: string;
  sourceKind: "csv";
  summary: FeedbackImportSummary;
  warnings: FeedbackImportMessage[];
};

export type FeedbackImportSummary = {
  attachmentBytes: number;
  errors: number;
  newRecords: number;
  skippedRecords: number;
  totalRecords: number;
  updateRecords: number;
};

export type FeedbackImportCommitResult =
  | { status: "ok"; batchId: string; createdFeedbackIds: string[]; skippedRecords: number }
  | { status: "notFound" }
  | { status: "invalid" };

type FeedbackImportRecord = {
  assigneeUserId: string | null;
  causeCategories: string[];
  description: string;
  externalId: string;
  impact: FeedbackImpact;
  priority: FeedbackPriority | null;
  projectId: string | null;
  sourceSystem: string;
  title: string;
};

type StoredFeedbackImportSummary = FeedbackImportSummary & {
  records: FeedbackImportRecord[];
};

const feedbackCurrentViewCsvVersion = "orf.feedback.current_view.v1";
const impactValues = new Set<FeedbackImpact>(["low", "medium", "high", "critical"]);
const priorityValues = new Set<FeedbackPriority>(["p0", "p1", "p2", "p3"]);

export function feedbackBackupZipFileName(exportedAt: string) {
  const stamp = exportedAt
    .replace(/\.\d{3}Z$/, "Z")
    .replace(/[-:]/g, "")
    .replace("T", "-")
    .replace("Z", "");
  return `orf-feedback-backup-${stamp}.zip`;
}

export function buildFeedbackBackupZip(data: FeedbackIssueReadModelData, exportedAt: string) {
  const manifest = {
    counts: {
      comments: data.comments.length,
      feedback: data.feedback.length,
      projects: data.projects.length,
      users: data.users.length,
    },
    exportedAt,
    version: "orf.feedback.backup.v1",
  };

  return buildStoredZip([
    { path: "manifest.json", content: `${JSON.stringify(manifest, null, 2)}\n` },
    { path: "feedback.jsonl", content: jsonLines(data.feedback) },
    { path: "comments.jsonl", content: jsonLines(data.comments) },
    { path: "projects.jsonl", content: jsonLines(data.projects) },
    { path: "users.jsonl", content: jsonLines(data.users) },
  ]);
}

export async function preflightFeedbackImportCsv(
  database: FeedbackTransferDatabase,
  input: {
    actor: FeedbackWriteActor;
    fileName: string;
    knownAssigneeUserIds: ReadonlySet<string>;
    knownProjectIds: ReadonlySet<string>;
    text: string;
  },
): Promise<FeedbackImportPreflight> {
  const batchId = makeFeedbackImportBatchId();
  const createdAt = feedbackNowIso();
  const parsed = parseCsv(input.text);
  const errors: FeedbackImportMessage[] = [];
  const warnings: FeedbackImportMessage[] = [];
  const records: FeedbackImportRecord[] = [];

  if (parsed.rows.length === 0) {
    errors.push({ message: "CSV 没有数据行" });
  }

  const requiredColumns = ["export_version", "feedback_id", "title", "description", "impact", "cause_categories"];
  for (const column of requiredColumns) {
    if (!parsed.headers.includes(column)) {
      errors.push({ field: column, message: "CSV 缺少必需列" });
    }
  }

  const sourceExternalIds: string[] = [];
  const sourceExternalIdRows = new Map<string, number>();
  if (errors.length === 0) {
    for (const row of parsed.rows) {
      const record = importRecordFromCsvRow(row);
      const rowErrors = validateImportRecord(record, row.index, input);
      const previousRow = record.externalId ? sourceExternalIdRows.get(record.externalId) : undefined;
      if (previousRow !== undefined) {
        rowErrors.push({ field: "feedback_id", message: `反馈来源 ID 与第 ${previousRow} 行重复`, row: row.index });
      } else if (record.externalId) {
        sourceExternalIdRows.set(record.externalId, row.index);
      }
      errors.push(...rowErrors);
      if (rowErrors.length > 0) continue;
      records.push(record);
      sourceExternalIds.push(record.externalId);
    }
  }

  const [existingOrigins, existingFeedbackIds] = errors.length === 0
    ? await Promise.all([
        existingImportExternalIds(database, input.actor.teamId, sourceExternalIds),
        existingFeedbackExternalIds(database, input.actor.teamId, sourceExternalIds),
      ])
    : [new Set<string>(), new Set<string>()];

  const newRecords: FeedbackImportRecord[] = [];
  let skippedRecords = 0;
  for (const record of records) {
    if (existingOrigins.has(record.externalId) || existingFeedbackIds.has(record.externalId)) {
      skippedRecords += 1;
      warnings.push({ field: "feedback_id", message: "来源反馈已存在，提交时会跳过", row: rowIndexForRecord(parsed.rows, record.externalId) });
      continue;
    }
    newRecords.push(record);
  }

  const summary: StoredFeedbackImportSummary = {
    attachmentBytes: 0,
    errors: errors.length,
    newRecords: newRecords.length,
    records: newRecords,
    skippedRecords,
    totalRecords: parsed.rows.length,
    updateRecords: 0,
  };

  await database.insert(feedbackImportBatches).values({
    id: batchId,
    teamId: input.actor.teamId,
    createdBy: input.actor.id,
    status: errors.length > 0 ? "failed" : "validated",
    sourceKind: "csv",
    fileName: input.fileName,
    summary,
    error: errors.length > 0 ? "preflight_failed" : null,
    createdAt,
    updatedAt: createdAt,
    committedAt: null,
  });

  return {
    batchId,
    errors,
    fileName: input.fileName,
    sourceKind: "csv",
    summary: publicImportSummary(summary),
    warnings,
  };
}

export async function commitFeedbackImportBatch(
  database: FeedbackTransferDatabase,
  input: {
    actor: FeedbackWriteActor;
    batchId: string;
  },
): Promise<FeedbackImportCommitResult> {
  const [batch] = await database
    .select()
    .from(feedbackImportBatches)
    .where(and(eq(feedbackImportBatches.id, input.batchId), eq(feedbackImportBatches.teamId, input.actor.teamId)))
    .limit(1);
  if (!batch) return { status: "notFound" };
  if (batch.status !== "validated") return { status: "invalid" };

  const summary = readStoredImportSummary(batch.summary);
  if (!summary || summary.errors > 0) return { status: "invalid" };

  const now = feedbackNowIso();
  const createdFeedbackIds: string[] = [];
  let skippedRecords = 0;

  await database.transaction(async (tx) => {
    for (const record of summary.records) {
      const [existingOrigin] = await tx
        .select({ feedbackId: feedbackImportOrigins.feedbackId })
        .from(feedbackImportOrigins)
        .where(and(
          eq(feedbackImportOrigins.teamId, input.actor.teamId),
          eq(feedbackImportOrigins.sourceSystem, record.sourceSystem),
          eq(feedbackImportOrigins.externalId, record.externalId),
        ))
        .limit(1);
      if (existingOrigin) {
        skippedRecords += 1;
        continue;
      }

      const draft = createFeedbackDraft();
      const created = await createFeedbackIssue(tx, {
        assigneeUserId: record.assigneeUserId,
        causeCategories: record.causeCategories,
        description: record.description,
        draft,
        impact: record.impact,
        priority: record.priority,
        projectId: record.projectId,
        reportAttachments: [],
        title: record.title,
      }, input.actor);
      if (created.status !== "ok") {
        throw new Error(`Feedback import failed for ${record.externalId}: ${created.status}`);
      }

      await tx.insert(feedbackImportOrigins).values({
        teamId: input.actor.teamId,
        sourceSystem: record.sourceSystem,
        externalId: record.externalId,
        feedbackId: created.feedbackId,
        importBatchId: input.batchId,
        createdAt: now,
      });
      createdFeedbackIds.push(created.feedbackId);
    }

    await tx
      .update(feedbackImportBatches)
      .set({
        status: "committed",
        updatedAt: now,
        committedAt: now,
        summary: {
          ...summary,
          skippedRecords: summary.skippedRecords + skippedRecords,
        },
      })
      .where(eq(feedbackImportBatches.id, input.batchId));
  });

  return {
    status: "ok",
    batchId: input.batchId,
    createdFeedbackIds,
    skippedRecords: summary.skippedRecords + skippedRecords,
  };
}

function validateImportRecord(
  record: FeedbackImportRecord,
  row: number,
  input: {
    knownAssigneeUserIds: ReadonlySet<string>;
    knownProjectIds: ReadonlySet<string>;
  },
) {
  const errors: FeedbackImportMessage[] = [];
  if (!record.externalId) errors.push({ field: "feedback_id", message: "反馈来源 ID 不能为空", row });
  if (record.sourceSystem !== feedbackCurrentViewCsvVersion) {
    errors.push({ field: "export_version", message: "CSV 导出版本不受支持", row });
  }
  if (!record.title) errors.push({ field: "title", message: "标题不能为空", row });
  if (!record.description) errors.push({ field: "description", message: "正文不能为空", row });
  if (record.causeCategories.length === 0) errors.push({ field: "cause_categories", message: "分类不能为空", row });
  if (!impactValues.has(record.impact)) errors.push({ field: "impact", message: "影响等级不合法", row });
  if (record.priority && !priorityValues.has(record.priority)) errors.push({ field: "priority", message: "优先级不合法", row });
  if (record.assigneeUserId && !input.knownAssigneeUserIds.has(record.assigneeUserId)) {
    errors.push({ field: "assignee_user_id", message: "处理人不存在或不是 active 成员", row });
  }
  if (record.projectId && !input.knownProjectIds.has(record.projectId)) {
    errors.push({ field: "project_id", message: "项目不存在", row });
  }
  return errors;
}

function importRecordFromCsvRow(row: ParsedCsvRow): FeedbackImportRecord {
  return {
    assigneeUserId: cell(row, "assignee_user_id") || null,
    causeCategories: cell(row, "cause_categories").split("|").map((value) => value.trim()).filter(Boolean),
    description: cell(row, "description"),
    externalId: cell(row, "feedback_id"),
    impact: cell(row, "impact") as FeedbackImpact,
    priority: (cell(row, "priority") || null) as FeedbackPriority | null,
    projectId: cell(row, "project_id") || null,
    sourceSystem: cell(row, "export_version"),
    title: cell(row, "title"),
  };
}

async function existingImportExternalIds(database: FeedbackTransferDatabase, teamId: string, externalIds: readonly string[]) {
  if (externalIds.length === 0) return new Set<string>();
  const rows = await database
    .select({ externalId: feedbackImportOrigins.externalId })
    .from(feedbackImportOrigins)
    .where(and(
      eq(feedbackImportOrigins.teamId, teamId),
      eq(feedbackImportOrigins.sourceSystem, feedbackCurrentViewCsvVersion),
      inArray(feedbackImportOrigins.externalId, [...new Set(externalIds)]),
    ));
  return new Set(rows.map((row) => row.externalId));
}

async function existingFeedbackExternalIds(database: FeedbackTransferDatabase, teamId: string, externalIds: readonly string[]) {
  if (externalIds.length === 0) return new Set<string>();
  const rows = await database
    .select({ id: feedback.id })
    .from(feedback)
    .where(and(eq(feedback.teamId, teamId), inArray(feedback.id, [...new Set(externalIds)])));
  return new Set(rows.map((row) => row.id));
}

function readStoredImportSummary(value: unknown): StoredFeedbackImportSummary | null {
  if (!value || typeof value !== "object") return null;
  const summary = value as Partial<StoredFeedbackImportSummary>;
  if (!Array.isArray(summary.records)) return null;
  return {
    attachmentBytes: Number(summary.attachmentBytes ?? 0),
    errors: Number(summary.errors ?? 0),
    newRecords: Number(summary.newRecords ?? 0),
    records: summary.records,
    skippedRecords: Number(summary.skippedRecords ?? 0),
    totalRecords: Number(summary.totalRecords ?? 0),
    updateRecords: Number(summary.updateRecords ?? 0),
  };
}

function publicImportSummary(summary: StoredFeedbackImportSummary): FeedbackImportSummary {
  return {
    attachmentBytes: summary.attachmentBytes,
    errors: summary.errors,
    newRecords: summary.newRecords,
    skippedRecords: summary.skippedRecords,
    totalRecords: summary.totalRecords,
    updateRecords: summary.updateRecords,
  };
}

function makeFeedbackImportBatchId() {
  return `fimp-${Date.now()}-${randomUUID()}`;
}

function jsonLines(values: readonly unknown[]) {
  return values.map((value) => JSON.stringify(value)).join("\n") + (values.length > 0 ? "\n" : "");
}

function buildStoredZip(files: Array<{ content: string; path: string }>) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.path, "utf8");
    const content = Buffer.from(file.content, "utf8");
    const crc = crc32(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, content);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(content.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + content.length;
  }

  const centralSize = centralParts.reduce((sum, item) => sum + item.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, end]);
}

const crc32Table = new Uint32Array(256).map((_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  }
  return value >>> 0;
});

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crc32Table[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

type ParsedCsvRow = {
  index: number;
  values: Map<string, string>;
};

function cell(row: ParsedCsvRow, key: string) {
  return row.values.get(key)?.trim() ?? "";
}

function rowIndexForRecord(rows: readonly ParsedCsvRow[], externalId: string) {
  return rows.find((row) => cell(row, "feedback_id") === externalId)?.index;
}

function parseCsv(text: string) {
  const rows = parseCsvRows(text.replace(/^\uFEFF/, ""));
  const [headerCells = [], ...bodyRows] = rows;
  const headers = headerCells.map((cellValue) => cellValue.trim());
  return {
    headers,
    rows: bodyRows
      .filter((row) => row.some((value) => value.trim()))
      .map((row, index): ParsedCsvRow => ({
        index: index + 2,
        values: new Map(headers.map((header, cellIndex) => [header, row[cellIndex] ?? ""])),
      })),
  };
}

function parseCsvRows(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] ?? "";
    const next = text[index + 1] ?? "";
    if (quoted) {
      if (char === "\"" && next === "\"") {
        value += "\"";
        index += 1;
      } else if (char === "\"") {
        quoted = false;
      } else {
        value += char;
      }
      continue;
    }

    if (char === "\"") {
      quoted = true;
      continue;
    }
    if (char === ",") {
      row.push(value);
      value = "";
      continue;
    }
    if (char === "\n") {
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
      continue;
    }
    if (char === "\r") {
      continue;
    }
    value += char;
  }

  if (value || row.length > 0) {
    row.push(value);
    rows.push(row);
  }

  return rows;
}
