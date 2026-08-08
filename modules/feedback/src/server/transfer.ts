import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { FeedbackImpact, FeedbackImportActor, FeedbackPriority } from "../contracts";
import {
  feedback,
  feedbackActivityEvents,
  feedbackCauseCategories,
  feedbackImportBatches,
  feedbackImportOrigins,
} from "../infrastructure/database/schema";
import {
  type FeedbackWriteDatabase,
} from "./writeModel";
import type { FeedbackWriteClient } from "./commandPorts";
import { feedbackNowIso, makeFeedbackActivityId, makeFeedbackId } from "./ids";

type FeedbackTransferDatabase = NodePgDatabase<any> & FeedbackWriteDatabase;

export type FeedbackImportMessage = {
  field?: string;
  message: string;
  row?: number;
};

export type FeedbackImportPreflight = {
  batchId: string;
  commitAvailable: boolean;
  commitBlockedReason?: string;
  errors: FeedbackImportMessage[];
  fieldMappings?: FeedbackImportFieldMapping[];
  fileName: string;
  referenceIssues?: FeedbackImportReferenceIssue[];
  sourceKind: FeedbackImportSourceKind;
  summary: FeedbackImportSummary;
  updateDiffs?: FeedbackImportUpdateDiff[];
  warnings: FeedbackImportMessage[];
};

export type FeedbackImportSourceKind = "csv";

export type FeedbackImportFieldMapping = {
  field: string;
  label: string;
  required: boolean;
  sourceColumn: string | null;
};

export type FeedbackImportFieldDiff = {
  currentValue: string;
  field: string;
  incomingValue: string;
  label: string;
};

export type FeedbackImportReferenceKind = "assignee" | "project";

export type FeedbackImportReferenceIssue = {
  canClear: boolean;
  field: "assignee_user_id" | "project_id";
  kind: FeedbackImportReferenceKind;
  rows: number[];
  sourceValue: string;
};

export type FeedbackImportReferenceMappings = {
  assigneeUserIds?: Record<string, string | null>;
  projectIds?: Record<string, string | null>;
};

export type FeedbackImportUpdateDiff = {
  externalId: string;
  feedbackId: string;
  fields: FeedbackImportFieldDiff[];
  row?: number;
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
  | { status: "ok"; batchId: string; createdFeedbackIds: string[]; report: FeedbackImportResultReport; skippedRecords: number }
  | { status: "notFound" }
  | { status: "invalid" };

export type FeedbackImportResultReport = {
  content: string;
  fileName: string;
  mimeType: "text/plain;charset=utf-8";
};

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
  updateDiffs?: FeedbackImportUpdateDiff[];
};

const feedbackCurrentViewCsvVersion = "orf.feedback.current_view.v1";
const impactValues = new Set<FeedbackImpact>(["low", "medium", "high", "critical"]);
const priorityValues = new Set<FeedbackPriority>(["p0", "p1", "p2", "p3"]);

const feedbackCsvImportFields = [
  { key: "export_version", label: "导出版本", required: true, aliases: ["export_version", "导出版本", "版本"] },
  { key: "feedback_id", label: "反馈 ID", required: true, aliases: ["feedback_id", "反馈ID", "反馈 ID", "id", "issue_id"] },
  { key: "title", label: "标题", required: true, aliases: ["title", "标题", "问题标题"] },
  { key: "description", label: "正文", required: true, aliases: ["description", "正文", "描述", "内容"] },
  { key: "impact", label: "影响", required: true, aliases: ["impact", "影响", "影响等级"] },
  { key: "cause_categories", label: "分类", required: true, aliases: ["cause_categories", "分类", "原因分类", "标签"] },
  { key: "priority", label: "优先级", required: false, aliases: ["priority", "优先级"] },
  { key: "assignee_user_id", label: "处理人", required: false, aliases: ["assignee_user_id", "处理人ID", "处理人 ID"] },
  { key: "project_id", label: "项目", required: false, aliases: ["project_id", "项目ID", "项目 ID"] },
] as const satisfies readonly CsvImportFieldSpec[];

type CsvImportFieldKey = (
  | "assignee_user_id"
  | "cause_categories"
  | "description"
  | "export_version"
  | "feedback_id"
  | "impact"
  | "priority"
  | "project_id"
  | "title"
);

type CsvImportFieldSpec = {
  aliases: readonly string[];
  key: CsvImportFieldKey;
  label: string;
  required: boolean;
};

type CsvImportFieldMap = Record<CsvImportFieldKey, string | null>;

export async function preflightFeedbackImport(
  database: FeedbackTransferDatabase,
  input: {
    actor: FeedbackImportActor;
    body: Buffer;
    fileName: string;
    knownAssigneeUserIds: ReadonlySet<string>;
    knownProjectIds: ReadonlySet<string>;
    mimeType?: string;
    referenceMappings?: FeedbackImportReferenceMappings;
  },
): Promise<FeedbackImportPreflight> {
  return preflightFeedbackImportCsv(database, {
    actor: input.actor,
    fileName: input.fileName,
    knownAssigneeUserIds: input.knownAssigneeUserIds,
    knownProjectIds: input.knownProjectIds,
    referenceMappings: input.referenceMappings,
    text: input.body.toString("utf8"),
  });
}

export async function preflightFeedbackImportCsv(
  database: FeedbackTransferDatabase,
  input: {
    actor: FeedbackImportActor;
    fileName: string;
    knownAssigneeUserIds: ReadonlySet<string>;
    knownProjectIds: ReadonlySet<string>;
    referenceMappings?: FeedbackImportReferenceMappings;
    text: string;
  },
): Promise<FeedbackImportPreflight> {
  const batchId = makeFeedbackImportBatchId();
  const createdAt = feedbackNowIso();
  const parsed = parseCsv(input.text);
  const errors: FeedbackImportMessage[] = [];
  const warnings: FeedbackImportMessage[] = [];
  const referenceIssues = new Map<string, FeedbackImportReferenceIssue>();
  const records: FeedbackImportRecord[] = [];
  const fieldMapping = resolveCsvImportFieldMapping(parsed.headers);
  errors.push(...fieldMapping.errors);
  warnings.push(...fieldMapping.warnings);

  if (parsed.rows.length === 0) {
    errors.push({ message: "CSV 没有数据行" });
  }

  const sourceExternalIds: string[] = [];
  const sourceExternalIdRows = new Map<string, number>();
  if (errors.length === 0) {
    for (const row of parsed.rows) {
      const imported = importRecordFromCsvRow(row, fieldMapping.fieldMap);
      const record = resolveImportRecordReferences(imported, row.index, input, referenceIssues);
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

  const unresolvedReferenceIssues = [...referenceIssues.values()];
  const canEvaluateRecords = errors.length === 0 && unresolvedReferenceIssues.length === 0;
  const [existingOrigins, existingFeedbackById] = canEvaluateRecords
    ? await Promise.all([
        existingImportOrigins(database, input.actor.teamId, sourceExternalIds),
        existingFeedbackRecords(database, input.actor.teamId, sourceExternalIds),
      ])
    : [new Map<string, string>(), new Map<string, ExistingFeedbackImportRecord>()];
  const originFeedbackIds = [...new Set([...existingOrigins.values()].filter((feedbackId) => !existingFeedbackById.has(feedbackId)))];
  const originFeedbackById = canEvaluateRecords
    ? await existingFeedbackRecords(database, input.actor.teamId, originFeedbackIds)
    : new Map<string, ExistingFeedbackImportRecord>();

  const newRecords: FeedbackImportRecord[] = [];
  const updateDiffs: FeedbackImportUpdateDiff[] = [];
  let skippedRecords = 0;
  if (canEvaluateRecords) {
    for (const record of records) {
      const existingFeedbackId = existingOrigins.get(record.externalId) ?? (existingFeedbackById.has(record.externalId) ? record.externalId : null);
      if (existingFeedbackId) {
        skippedRecords += 1;
        const row = rowIndexForRecord(parsed.rows, fieldMapping.fieldMap, record.externalId);
        const existing = existingFeedbackById.get(existingFeedbackId) ?? originFeedbackById.get(existingFeedbackId);
        const fields = existing ? feedbackImportUpdateFields(record, existing) : [];
        if (fields.length > 0) {
          updateDiffs.push({ externalId: record.externalId, feedbackId: existingFeedbackId, fields, row });
        }
        continue;
      }
      newRecords.push(record);
    }
  }

  const summary: StoredFeedbackImportSummary = {
    attachmentBytes: 0,
    errors: errors.length,
    newRecords: newRecords.length,
    records: newRecords,
    skippedRecords,
    totalRecords: parsed.rows.length,
    updateDiffs,
    updateRecords: updateDiffs.length,
  };

  await database.insert(feedbackImportBatches).values({
    id: batchId,
    teamId: input.actor.teamId,
    createdBy: input.actor.id,
    status: errors.length > 0 ? "failed" : unresolvedReferenceIssues.length > 0 ? "uploaded" : "validated",
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
    commitAvailable: errors.length === 0 && unresolvedReferenceIssues.length === 0 && newRecords.length > 0,
    commitBlockedReason: feedbackCsvImportCommitBlockedReason(errors, newRecords.length, updateDiffs.length, unresolvedReferenceIssues.length),
    errors,
    fieldMappings: fieldMapping.publicMappings,
    fileName: input.fileName,
    referenceIssues: unresolvedReferenceIssues,
    sourceKind: "csv",
    summary: publicImportSummary(summary),
    updateDiffs,
    warnings,
  };
}

export async function commitFeedbackImportBatch(
  database: FeedbackTransferDatabase,
  input: {
    actor: FeedbackImportActor;
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
  if (batch.sourceKind !== "csv") return { status: "invalid" };

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

      const [existingFeedbackId] = await tx
        .select({ id: feedback.id })
        .from(feedback)
        .where(and(eq(feedback.teamId, input.actor.teamId), eq(feedback.id, record.externalId)))
        .limit(1);
      if (existingFeedbackId) {
        skippedRecords += 1;
        continue;
      }

      const feedbackId = await createImportedFeedbackIssue(tx, {
        actor: input.actor,
        batchId: input.batchId,
        createdAt: now,
        record,
      });
      await tx.insert(feedbackImportOrigins).values({
        teamId: input.actor.teamId,
        sourceSystem: record.sourceSystem,
        externalId: record.externalId,
        feedbackId,
        importBatchId: input.batchId,
        createdAt: now,
      });
      createdFeedbackIds.push(feedbackId);
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
    report: buildFeedbackImportResultReport({
      batchId: input.batchId,
      createdFeedbackIds,
      fileName: batch.fileName ?? null,
      skippedRecords: summary.skippedRecords + skippedRecords,
      totalRecords: summary.totalRecords,
    }),
    skippedRecords: summary.skippedRecords + skippedRecords,
  };
}

async function createImportedFeedbackIssue(
  database: Pick<FeedbackWriteClient, "insert">,
  input: {
    actor: FeedbackImportActor;
    batchId: string;
    createdAt: string;
    record: FeedbackImportRecord;
  },
) {
  const feedbackId = makeFeedbackId();
  const assigneeUserId = input.record.assigneeUserId?.trim() || null;
  const projectId = input.record.projectId?.trim() || null;
  await database.insert(feedback).values({
    id: feedbackId,
    teamId: input.actor.teamId,
    projectId,
    title: input.record.title,
    description: input.record.description,
    stage: "open",
    resolution: null,
    impact: input.record.impact,
    priority: input.record.priority ?? null,
    assigneeUserId,
    createdBy: input.actor.id,
    updatedBy: input.actor.id,
    version: 0,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    closedAt: null,
    closedByUserId: null,
  });

  await database.insert(feedbackCauseCategories).values(
    input.record.causeCategories.map((category, index) => ({
      teamId: input.actor.teamId,
      feedbackId,
      category,
      sortOrder: index,
    })),
  );

  await database.insert(feedbackActivityEvents).values({
    id: makeFeedbackActivityId(),
    teamId: input.actor.teamId,
    feedbackId,
    actorUserId: input.actor.id,
    activityType: "feedback.created",
    payload: {
      assigneeUserId,
      externalId: input.record.externalId,
      importBatchId: input.batchId,
      imported: true,
      priority: input.record.priority ?? null,
      projectId,
      sourceSystem: input.record.sourceSystem,
      title: input.record.title,
    },
    createdAt: input.createdAt,
  });

  return feedbackId;
}

type ExistingFeedbackImportRecord = {
  assigneeUserId: string | null;
  causeCategories: string[];
  description: string;
  id: string;
  impact: FeedbackImpact;
  priority: FeedbackPriority | null;
  projectId: string | null;
  title: string;
};

function feedbackCsvImportCommitBlockedReason(
  errors: readonly FeedbackImportMessage[],
  newRecords: number,
  updateRecords: number,
  unresolvedReferences: number,
) {
  if (errors.length > 0) return "CSV 预检存在错误";
  if (unresolvedReferences > 0) return "需要先完成用户和项目映射并重新预检";
  if (newRecords === 0 && updateRecords > 0) return "存在可更新记录，默认不会覆盖；需要确认更新差异后才可提交覆盖";
  if (newRecords === 0) return "没有可新增的反馈";
  return undefined;
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

function importRecordFromCsvRow(row: ParsedCsvRow, fieldMap: CsvImportFieldMap): FeedbackImportRecord {
  return {
    assigneeUserId: mappedCell(row, fieldMap, "assignee_user_id") || null,
    causeCategories: mappedCell(row, fieldMap, "cause_categories").split("|").map((value) => value.trim()).filter(Boolean),
    description: mappedCell(row, fieldMap, "description"),
    externalId: mappedCell(row, fieldMap, "feedback_id"),
    impact: mappedCell(row, fieldMap, "impact") as FeedbackImpact,
    priority: (mappedCell(row, fieldMap, "priority") || null) as FeedbackPriority | null,
    projectId: mappedCell(row, fieldMap, "project_id") || null,
    sourceSystem: mappedCell(row, fieldMap, "export_version"),
    title: mappedCell(row, fieldMap, "title"),
  };
}

function resolveImportRecordReferences(
  record: FeedbackImportRecord,
  row: number,
  input: {
    knownAssigneeUserIds: ReadonlySet<string>;
    knownProjectIds: ReadonlySet<string>;
    referenceMappings?: FeedbackImportReferenceMappings;
  },
  issues: Map<string, FeedbackImportReferenceIssue>,
): FeedbackImportRecord {
  return {
    ...record,
    assigneeUserId: resolveOptionalImportReference({
      field: "assignee_user_id",
      kind: "assignee",
      knownIds: input.knownAssigneeUserIds,
      mappings: input.referenceMappings?.assigneeUserIds,
      row,
      sourceValue: record.assigneeUserId,
      issues,
    }),
    projectId: resolveOptionalImportReference({
      field: "project_id",
      kind: "project",
      knownIds: input.knownProjectIds,
      mappings: input.referenceMappings?.projectIds,
      row,
      sourceValue: record.projectId,
      issues,
    }),
  };
}

function resolveOptionalImportReference(input: {
  field: FeedbackImportReferenceIssue["field"];
  issues: Map<string, FeedbackImportReferenceIssue>;
  kind: FeedbackImportReferenceKind;
  knownIds: ReadonlySet<string>;
  mappings?: Record<string, string | null>;
  row: number;
  sourceValue: string | null;
}) {
  if (!input.sourceValue || input.knownIds.has(input.sourceValue)) {
    return input.sourceValue;
  }

  if (input.mappings && Object.prototype.hasOwnProperty.call(input.mappings, input.sourceValue)) {
    return input.mappings[input.sourceValue] || null;
  }

  const key = `${input.kind}:${input.sourceValue}`;
  const existing = input.issues.get(key);
  if (existing) {
    if (!existing.rows.includes(input.row)) existing.rows.push(input.row);
  } else {
    input.issues.set(key, {
      canClear: true,
      field: input.field,
      kind: input.kind,
      rows: [input.row],
      sourceValue: input.sourceValue,
    });
  }
  return null;
}

async function existingImportOrigins(database: FeedbackTransferDatabase, teamId: string, externalIds: readonly string[]) {
  if (externalIds.length === 0) return new Map<string, string>();
  const rows = await database
    .select({ externalId: feedbackImportOrigins.externalId, feedbackId: feedbackImportOrigins.feedbackId })
    .from(feedbackImportOrigins)
    .where(and(
      eq(feedbackImportOrigins.teamId, teamId),
      eq(feedbackImportOrigins.sourceSystem, feedbackCurrentViewCsvVersion),
      inArray(feedbackImportOrigins.externalId, [...new Set(externalIds)]),
    ));
  return new Map(rows.map((row) => [row.externalId, row.feedbackId]));
}

async function existingFeedbackRecords(database: FeedbackTransferDatabase, teamId: string, feedbackIds: readonly string[]) {
  if (feedbackIds.length === 0) return new Map<string, ExistingFeedbackImportRecord>();
  const ids = [...new Set(feedbackIds)];
  const [feedbackRows, categoryRows] = await Promise.all([
    database
      .select({
        assigneeUserId: feedback.assigneeUserId,
        description: feedback.description,
        id: feedback.id,
        impact: feedback.impact,
        priority: feedback.priority,
        projectId: feedback.projectId,
        title: feedback.title,
      })
      .from(feedback)
      .where(and(eq(feedback.teamId, teamId), inArray(feedback.id, ids))),
    database
      .select({
        category: feedbackCauseCategories.category,
        feedbackId: feedbackCauseCategories.feedbackId,
        sortOrder: feedbackCauseCategories.sortOrder,
      })
      .from(feedbackCauseCategories)
      .where(and(eq(feedbackCauseCategories.teamId, teamId), inArray(feedbackCauseCategories.feedbackId, ids))),
  ]);
  const categoriesByFeedbackId = new Map<string, string[]>();
  for (const row of categoryRows.sort((left, right) => left.sortOrder - right.sortOrder)) {
    const list = categoriesByFeedbackId.get(row.feedbackId) ?? [];
    list.push(row.category);
    categoriesByFeedbackId.set(row.feedbackId, list);
  }
  return new Map(feedbackRows.map((row) => [row.id, {
    ...row,
    causeCategories: categoriesByFeedbackId.get(row.id) ?? [],
  }]));
}

function feedbackImportUpdateFields(record: FeedbackImportRecord, existing: ExistingFeedbackImportRecord) {
  const fields: FeedbackImportFieldDiff[] = [];
  pushImportFieldDiff(fields, "title", "标题", existing.title, record.title);
  pushImportFieldDiff(fields, "description", "正文", existing.description, record.description);
  pushImportFieldDiff(fields, "impact", "影响", existing.impact, record.impact);
  pushImportFieldDiff(fields, "priority", "优先级", existing.priority, record.priority);
  pushImportFieldDiff(fields, "assignee_user_id", "处理人", existing.assigneeUserId, record.assigneeUserId);
  pushImportFieldDiff(fields, "project_id", "项目", existing.projectId, record.projectId);
  pushImportFieldDiff(fields, "cause_categories", "分类", existing.causeCategories, record.causeCategories);
  return fields;
}

function pushImportFieldDiff(
  fields: FeedbackImportFieldDiff[],
  field: string,
  label: string,
  currentValue: string | string[] | null,
  incomingValue: string | string[] | null,
) {
  const current = importDiffValue(currentValue);
  const incoming = importDiffValue(incomingValue);
  if (current === incoming) return;
  fields.push({ currentValue: current, field, incomingValue: incoming, label });
}

function importDiffValue(value: string | string[] | null) {
  if (Array.isArray(value)) return value.join(" | ");
  return value ?? "";
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

function buildFeedbackImportResultReport(input: {
  batchId: string;
  createdFeedbackIds: readonly string[];
  fileName: string | null;
  skippedRecords: number;
  totalRecords: number;
}): FeedbackImportResultReport {
  return {
    content: [
      "反馈导入结果报告",
      `批次: ${input.batchId}`,
      `文件: ${input.fileName ?? "未命名文件"}`,
      "",
      "摘要",
      `总记录: ${input.totalRecords}`,
      `新增反馈: ${input.createdFeedbackIds.length}`,
      `跳过记录: ${input.skippedRecords}`,
      "",
      "新增反馈 ID",
      ...input.createdFeedbackIds,
      ...(input.createdFeedbackIds.length === 0 ? ["无"] : []),
      "",
    ].join("\n"),
    fileName: `orf-feedback-import-result-${input.batchId}.txt`,
    mimeType: "text/plain;charset=utf-8",
  };
}

function makeFeedbackImportBatchId() {
  return `fimp-${Date.now()}-${randomUUID()}`;
}

type ParsedCsvRow = {
  index: number;
  values: Map<string, string>;
};

function resolveCsvImportFieldMapping(headers: readonly string[]) {
  const errors: FeedbackImportMessage[] = [];
  const warnings: FeedbackImportMessage[] = [];
  const headerByKey = new Map<string, string>();
  for (const header of headers) {
    const normalized = normalizeCsvImportHeader(header);
    if (!normalized) continue;
    if (headerByKey.has(normalized)) {
      warnings.push({ field: header, message: "CSV 存在重复含义的列名，预检只使用第一列" });
      continue;
    }
    headerByKey.set(normalized, header);
  }

  const fieldMap = Object.fromEntries(
    feedbackCsvImportFields.map((field) => [field.key, null]),
  ) as CsvImportFieldMap;
  const publicMappings: FeedbackImportFieldMapping[] = [];

  for (const field of feedbackCsvImportFields) {
    const sourceColumn = field.aliases.map(normalizeCsvImportHeader).map((alias) => headerByKey.get(alias)).find(Boolean) ?? null;
    fieldMap[field.key] = sourceColumn;
    publicMappings.push({
      field: field.key,
      label: field.label,
      required: field.required,
      sourceColumn,
    });
    if (field.required && !sourceColumn) {
      errors.push({ field: field.key, message: `CSV 缺少必需字段：${field.label}` });
    }
  }

  return { errors, fieldMap, publicMappings, warnings };
}

function normalizeCsvImportHeader(value: string) {
  return value.trim().toLowerCase().replace(/[\s_\-]+/g, "");
}

function mappedCell(row: ParsedCsvRow, fieldMap: CsvImportFieldMap, key: CsvImportFieldKey) {
  const column = fieldMap[key];
  return column ? row.values.get(column)?.trim() ?? "" : "";
}

function rowIndexForRecord(rows: readonly ParsedCsvRow[], fieldMap: CsvImportFieldMap, externalId: string) {
  return rows.find((row) => mappedCell(row, fieldMap, "feedback_id") === externalId)?.index;
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
