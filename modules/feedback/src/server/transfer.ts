import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { FeedbackImpact, FeedbackImportActor, FeedbackIssueReadModelData, FeedbackPriority } from "../contracts";
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
import type {
  FeedbackBackupAttachmentFile,
} from "./transferProtocol";

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

export type FeedbackImportSourceKind = "csv" | "zip";

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
  backup?: FeedbackBackupImportSummary;
  records: FeedbackImportRecord[];
  updateDiffs?: FeedbackImportUpdateDiff[];
};

type FeedbackBackupImportSummary = {
  attachmentFiles: number;
  commentAttachments: number;
  manifestFiles: number;
  projects: number;
  reportAttachments: number;
  users: number;
  version: string;
};

type FeedbackBackupAttachmentManifestEntry = ReturnType<typeof feedbackBackupAttachmentManifestEntry>;

export type FeedbackBackupZipInput = {
  readonly attachmentFiles: readonly FeedbackBackupAttachmentFile[];
  readonly data: FeedbackIssueReadModelData;
  readonly exportedAt: string;
};

type StoredZipFile = {
  readonly content: Buffer | string;
  readonly path: string;
};

const feedbackCurrentViewCsvVersion = "orf.feedback.current_view.v1";
const feedbackBackupZipVersion = "orf.feedback.backup.v1";
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

export function feedbackBackupZipFileName(exportedAt: string) {
  const stamp = exportedAt
    .replace(/\.\d{3}Z$/, "Z")
    .replace(/[-:]/g, "")
    .replace("T", "-")
    .replace("Z", "");
  return `orf-feedback-backup-${stamp}.zip`;
}

export function buildFeedbackBackupZip(input: FeedbackBackupZipInput) {
  const activity = input.data.feedback.flatMap((item) =>
    item.activity.map((entry) => ({ ...entry, feedbackId: item.id })),
  );
  const relations = input.data.feedback.flatMap((item) =>
    item.relations.map((relation) => ({ ...relation, feedbackId: item.id })),
  );
  const attachmentEntries = input.attachmentFiles.map(feedbackBackupAttachmentManifestEntry);
  const jsonFiles: StoredZipFile[] = [
    { path: "feedback.jsonl", content: jsonLines(input.data.feedback) },
    { path: "comments.jsonl", content: jsonLines(input.data.comments) },
    { path: "activity.jsonl", content: jsonLines(activity) },
    { path: "relations.jsonl", content: jsonLines(relations) },
    { path: "attachments.jsonl", content: jsonLines(attachmentEntries) },
    { path: "projects.jsonl", content: jsonLines(input.data.projects) },
    { path: "users.jsonl", content: jsonLines(input.data.users) },
    { path: "reference-mappings/projects.jsonl", content: jsonLines(input.data.projects.map(projectReferenceMapping)) },
    { path: "reference-mappings/users.jsonl", content: jsonLines(input.data.users.map(userReferenceMapping)) },
  ];
  const attachmentFiles: StoredZipFile[] = input.attachmentFiles.map((file) => ({
    path: feedbackBackupAttachmentPath(file),
    content: file.content,
  }));
  const contentFiles = [...jsonFiles, ...attachmentFiles];
  const manifest = buildFeedbackBackupManifest({
    attachmentEntries,
    contentFiles,
    data: input.data,
    exportedAt: input.exportedAt,
  });
  const manifestFile = { path: "manifest.json", content: `${JSON.stringify(manifest, null, 2)}\n` };
  return buildStoredZip([manifestFile, ...contentFiles]);
}

function buildFeedbackBackupManifest(input: {
  attachmentEntries: readonly FeedbackBackupAttachmentManifestEntry[];
  contentFiles: readonly StoredZipFile[];
  data: FeedbackIssueReadModelData;
  exportedAt: string;
}) {
  const reportAttachmentCount = input.attachmentEntries.filter((item) => item.kind === "report").length;
  const commentAttachmentCount = input.attachmentEntries.filter((item) => item.kind === "comment").length;
  const manifest = {
    counts: {
      activity: input.data.feedback.reduce((sum, item) => sum + item.activity.length, 0),
      attachmentFiles: input.attachmentEntries.length,
      commentAttachments: commentAttachmentCount,
      comments: input.data.comments.length,
      feedback: input.data.feedback.length,
      projects: input.data.projects.length,
      relations: input.data.feedback.reduce((sum, item) => sum + item.relations.length, 0),
      reportAttachments: reportAttachmentCount,
      users: input.data.users.length,
    },
    exportedAt: input.exportedAt,
    files: input.contentFiles.map((file) => {
      const content = zipFileContent(file.content);
      return {
        bytes: content.length,
        path: file.path,
        sha256: sha256(content),
      };
    }),
    version: feedbackBackupZipVersion,
  };

  return manifest;
}

function feedbackBackupAttachmentManifestEntry(file: FeedbackBackupAttachmentFile) {
  const path = feedbackBackupAttachmentPath(file);
  return {
    attachmentId: file.attachmentId,
    bytes: file.content.length,
    declaredFileSize: file.fileSize,
    feedbackId: file.feedbackId,
    fileName: file.fileName,
    kind: file.kind,
    messageId: file.messageId ?? null,
    mimeType: file.mimeType,
    path,
    sha256: sha256(file.content),
    threadId: file.threadId ?? null,
  };
}

function feedbackBackupAttachmentPath(file: FeedbackBackupAttachmentFile) {
  const owner = file.kind === "report"
    ? `${safeZipSegment(file.feedbackId)}/${safeZipSegment(file.attachmentId)}`
    : `${safeZipSegment(file.feedbackId)}/${safeZipSegment(file.threadId ?? "thread")}/${safeZipSegment(file.messageId ?? "message")}/${safeZipSegment(file.attachmentId)}`;
  return `attachments/${file.kind}/${owner}/${safeZipSegment(file.fileName)}`;
}

function safeZipSegment(value: string) {
  const normalized = value.trim().replace(/[\\/]+/g, "_").replace(/[\u0000-\u001f\u007f]+/g, "_");
  return normalized && normalized !== "." && normalized !== ".." ? normalized : "unnamed";
}

function sha256(content: Buffer) {
  return createHash("sha256").update(content).digest("hex");
}

function projectReferenceMapping(project: FeedbackIssueReadModelData["projects"][number]) {
  return { externalId: project.id, name: project.name };
}

function userReferenceMapping(user: FeedbackIssueReadModelData["users"][number]) {
  return {
    displayName: user.name,
    email: user.email ?? null,
    externalId: user.id,
    role: user.role,
    status: user.status,
  };
}

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
  if (detectFeedbackImportSource(input) === "zip") {
    return preflightFeedbackImportZip(database, {
      actor: input.actor,
      body: input.body,
      fileName: input.fileName,
      knownAssigneeUserIds: input.knownAssigneeUserIds,
      knownProjectIds: input.knownProjectIds,
      referenceMappings: input.referenceMappings,
    });
  }

  return preflightFeedbackImportCsv(database, {
    actor: input.actor,
    fileName: input.fileName,
    knownAssigneeUserIds: input.knownAssigneeUserIds,
    knownProjectIds: input.knownProjectIds,
    referenceMappings: input.referenceMappings,
    text: input.body.toString("utf8"),
  });
}

export async function preflightFeedbackImportZip(
  database: FeedbackTransferDatabase,
  input: {
    actor: FeedbackImportActor;
    body: Buffer;
    fileName: string;
    knownAssigneeUserIds: ReadonlySet<string>;
    knownProjectIds: ReadonlySet<string>;
    referenceMappings?: FeedbackImportReferenceMappings;
  },
): Promise<FeedbackImportPreflight> {
  const batchId = makeFeedbackImportBatchId();
  const createdAt = feedbackNowIso();
  const inspected = inspectFeedbackBackupZip(input.body, input);
  const summary: StoredFeedbackImportSummary = {
    attachmentBytes: inspected.attachmentBytes,
    backup: inspected.backup,
    errors: inspected.errors.length,
    newRecords: 0,
    records: [],
    skippedRecords: 0,
    totalRecords: inspected.feedbackRecords,
    updateRecords: 0,
  };

  await database.insert(feedbackImportBatches).values({
    id: batchId,
    teamId: input.actor.teamId,
    createdBy: input.actor.id,
    status: inspected.errors.length > 0 ? "failed" : "uploaded",
    sourceKind: "zip",
    fileName: input.fileName,
    summary,
    error: inspected.errors.length > 0 ? "preflight_failed" : null,
    createdAt,
    updatedAt: createdAt,
    committedAt: null,
  });

  return {
    batchId,
    commitAvailable: false,
    commitBlockedReason: feedbackZipImportCommitBlockedReason(inspected.errors, inspected.referenceIssues),
    errors: inspected.errors,
    fileName: input.fileName,
    referenceIssues: inspected.referenceIssues,
    sourceKind: "zip",
    summary: publicImportSummary(summary),
    warnings: inspected.warnings,
  };
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

type FeedbackBackupZipInspection = {
  attachmentBytes: number;
  backup: FeedbackBackupImportSummary;
  errors: FeedbackImportMessage[];
  feedbackRecords: number;
  referenceIssues: FeedbackImportReferenceIssue[];
  warnings: FeedbackImportMessage[];
};

type FeedbackBackupReferenceContext = {
  knownAssigneeUserIds: ReadonlySet<string>;
  knownProjectIds: ReadonlySet<string>;
  referenceMappings?: FeedbackImportReferenceMappings;
};

type FeedbackBackupManifestFile = {
  bytes: number;
  path: string;
  sha256: string;
};

type StoredZipEntry = {
  content: Buffer;
  path: string;
};

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

const feedbackBackupJsonlCountFiles = [
  ["feedback", "feedback.jsonl"],
  ["comments", "comments.jsonl"],
  ["activity", "activity.jsonl"],
  ["relations", "relations.jsonl"],
  ["projects", "projects.jsonl"],
  ["users", "users.jsonl"],
] as const;

function detectFeedbackImportSource(input: { body: Buffer; fileName: string; mimeType?: string }): FeedbackImportSourceKind {
  const fileName = input.fileName.toLowerCase();
  const mimeType = input.mimeType?.toLowerCase() ?? "";
  if (input.body.length >= 4 && input.body.readUInt32LE(0) === 0x04034b50) return "zip";
  if (fileName.endsWith(".zip")) return "zip";
  if (mimeType.includes("zip")) return "zip";
  return "csv";
}

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

function feedbackZipImportCommitBlockedReason(
  errors: readonly FeedbackImportMessage[],
  referenceIssues: readonly FeedbackImportReferenceIssue[],
) {
  if (errors.length > 0) return "完整备份 ZIP 预检存在错误";
  if (referenceIssues.length > 0) return "需要先完成用户和项目映射并重新预检";
  return "完整备份 ZIP 已完成预检；恢复提交仍需启用附件暂存和批量恢复";
}

function inspectFeedbackBackupZip(body: Buffer, references: FeedbackBackupReferenceContext): FeedbackBackupZipInspection {
  const errors: FeedbackImportMessage[] = [];
  const warnings: FeedbackImportMessage[] = [];
  const entries = readStoredZipEntries(body, errors);
  const emptyBackup: FeedbackBackupImportSummary = {
    attachmentFiles: 0,
    commentAttachments: 0,
    manifestFiles: 0,
    projects: 0,
    reportAttachments: 0,
    users: 0,
    version: "",
  };
  const manifestContent = entries.get("manifest.json");
  if (!manifestContent) {
    errors.push({ field: "manifest.json", message: "完整备份 ZIP 缺少 manifest.json" });
    return { attachmentBytes: 0, backup: emptyBackup, errors, feedbackRecords: 0, referenceIssues: [], warnings };
  }

  const manifest = readBackupManifest(manifestContent, errors);
  if (!manifest) {
    return { attachmentBytes: 0, backup: emptyBackup, errors, feedbackRecords: 0, referenceIssues: [], warnings };
  }
  if (manifest.version !== feedbackBackupZipVersion) {
    errors.push({ field: "manifest.version", message: `不支持的完整备份版本 ${manifest.version || "(空)"}` });
  }

  const manifestFiles = readBackupManifestFiles(manifest.files, errors);
  const manifestPathSet = new Set(manifestFiles.map((file) => file.path));
  validateBackupManifestFiles(entries, manifestFiles, errors);
  validateBackupManifestCompleteness(entries, manifestPathSet, errors);

  const counts = readBackupManifestCounts(manifest.counts, errors);
  const jsonlCounts = countBackupJsonlEntries(entries, errors);
  for (const [countKey] of feedbackBackupJsonlCountFiles) {
    if (counts[countKey] !== undefined && counts[countKey] !== jsonlCounts[countKey]) {
      errors.push({ field: `manifest.counts.${countKey}`, message: `manifest 数量 ${counts[countKey]} 与 ${countKey}.jsonl 行数 ${jsonlCounts[countKey]} 不一致` });
    }
  }

  const attachmentRows = countJsonlEntries(entries, "attachments.jsonl", errors);
  const attachmentFiles = manifestFiles.filter((file) => file.path.startsWith("attachments/"));
  const attachmentBytes = attachmentFiles.reduce((sum, file) => sum + file.bytes, 0);
  if (counts.attachmentFiles !== undefined && counts.attachmentFiles !== attachmentFiles.length) {
    errors.push({ field: "manifest.counts.attachmentFiles", message: `附件文件数量 ${counts.attachmentFiles} 与 manifest 文件清单 ${attachmentFiles.length} 不一致` });
  }
  if (counts.attachmentFiles !== undefined && counts.attachmentFiles !== attachmentRows) {
    errors.push({ field: "attachments.jsonl", message: `附件清单 ${attachmentRows} 行与 manifest 附件数量 ${counts.attachmentFiles} 不一致` });
  }

  const backup: FeedbackBackupImportSummary = {
    attachmentFiles: counts.attachmentFiles ?? attachmentFiles.length,
    commentAttachments: counts.commentAttachments ?? 0,
    manifestFiles: manifestFiles.length,
    projects: counts.projects ?? jsonlCounts.projects,
    reportAttachments: counts.reportAttachments ?? 0,
    users: counts.users ?? jsonlCounts.users,
    version: manifest.version,
  };
  const referenceIssues = inspectBackupReferenceIssues(entries, references, errors);
  return {
    attachmentBytes,
    backup,
    errors,
    feedbackRecords: counts.feedback ?? jsonlCounts.feedback,
    referenceIssues,
    warnings,
  };
}

function inspectBackupReferenceIssues(
  entries: ReadonlyMap<string, Buffer>,
  references: FeedbackBackupReferenceContext,
  errors: FeedbackImportMessage[],
) {
  const issues = new Map<string, FeedbackImportReferenceIssue>();
  addBackupReferenceIssues({
    canClear: false,
    entries,
    errors,
    field: "assignee_user_id",
    issues,
    kind: "assignee",
    knownIds: references.knownAssigneeUserIds,
    mappings: references.referenceMappings?.assigneeUserIds,
    path: "reference-mappings/users.jsonl",
  });
  addBackupReferenceIssues({
    canClear: true,
    entries,
    errors,
    field: "project_id",
    issues,
    kind: "project",
    knownIds: references.knownProjectIds,
    mappings: references.referenceMappings?.projectIds,
    path: "reference-mappings/projects.jsonl",
  });
  return [...issues.values()];
}

function addBackupReferenceIssues(input: {
  canClear: boolean;
  entries: ReadonlyMap<string, Buffer>;
  errors: FeedbackImportMessage[];
  field: FeedbackImportReferenceIssue["field"];
  issues: Map<string, FeedbackImportReferenceIssue>;
  kind: FeedbackImportReferenceKind;
  knownIds: ReadonlySet<string>;
  mappings?: Record<string, string | null>;
  path: string;
}) {
  for (const sourceValue of readBackupReferenceExternalIds(input.entries, input.path, input.errors)) {
    if (input.knownIds.has(sourceValue)) continue;
    if (input.mappings && Object.prototype.hasOwnProperty.call(input.mappings, sourceValue)) {
      const targetValue = input.mappings[sourceValue];
      if (targetValue === null) {
        if (input.canClear) continue;
        input.errors.push({ field: input.field, message: `处理人引用 ${sourceValue} 必须映射到当前 active 成员，不能置空` });
        continue;
      }
      if (targetValue && input.knownIds.has(targetValue)) continue;
      input.errors.push({ field: input.field, message: `${input.kind === "assignee" ? "处理人" : "项目"}引用 ${sourceValue} 的映射目标不存在或不可用` });
      continue;
    }
    input.issues.set(`${input.kind}:${sourceValue}`, {
      canClear: input.canClear,
      field: input.field,
      kind: input.kind,
      rows: [],
      sourceValue,
    });
  }
}

function readBackupReferenceExternalIds(
  entries: ReadonlyMap<string, Buffer>,
  path: string,
  errors: FeedbackImportMessage[],
) {
  const content = entries.get(path);
  if (!content) {
    errors.push({ field: path, message: "完整备份缺少引用映射文件" });
    return [];
  }
  const text = content.toString("utf8").trim();
  if (!text) return [];
  const ids = new Set<string>();
  for (const [index, line] of text.split("\n").entries()) {
    try {
      const value = JSON.parse(line) as { externalId?: unknown };
      if (typeof value.externalId !== "string" || value.externalId.trim() === "") {
        errors.push({ field: `${path}[${index + 1}]`, message: "引用映射缺少 externalId" });
        continue;
      }
      ids.add(value.externalId);
    } catch {
      errors.push({ field: path, message: `第 ${index + 1} 行不是合法 JSON` });
      break;
    }
  }
  return [...ids];
}

function readStoredZipEntries(body: Buffer, errors: FeedbackImportMessage[]) {
  const entries = new Map<string, Buffer>();
  let offset = 0;
  while (offset + 4 <= body.length && body.readUInt32LE(offset) === 0x04034b50) {
    const flags = body.readUInt16LE(offset + 6);
    const method = body.readUInt16LE(offset + 8);
    const compressedSize = body.readUInt32LE(offset + 18);
    const fileNameLength = body.readUInt16LE(offset + 26);
    const extraLength = body.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const contentStart = nameStart + fileNameLength + extraLength;
    const contentEnd = contentStart + compressedSize;
    if (method !== 0 || (flags & 0x08) !== 0) {
      errors.push({ message: "完整备份 ZIP 必须使用 ORF 原生未压缩格式" });
      break;
    }
    if (contentEnd > body.length) {
      errors.push({ message: "ZIP 文件结构不完整" });
      break;
    }
    const path = body.subarray(nameStart, nameStart + fileNameLength).toString("utf8");
    if (entries.has(path)) {
      errors.push({ field: path, message: "ZIP 内存在重复路径" });
    }
    entries.set(path, body.subarray(contentStart, contentEnd));
    offset = contentEnd;
  }
  if (entries.size === 0) {
    errors.push({ message: "无法读取 ORF 完整备份 ZIP 内容" });
  }
  return entries;
}

function readBackupManifest(content: Buffer, errors: FeedbackImportMessage[]) {
  try {
    const value = JSON.parse(content.toString("utf8")) as {
      counts?: unknown;
      files?: unknown;
      version?: unknown;
    };
    return {
      counts: value.counts,
      files: value.files,
      version: typeof value.version === "string" ? value.version : "",
    };
  } catch {
    errors.push({ field: "manifest.json", message: "manifest.json 不是合法 JSON" });
    return null;
  }
}

function readBackupManifestFiles(value: unknown, errors: FeedbackImportMessage[]) {
  if (!Array.isArray(value)) {
    errors.push({ field: "manifest.files", message: "manifest.files 必须是数组" });
    return [];
  }
  const files: FeedbackBackupManifestFile[] = [];
  value.forEach((item, index) => {
    const file = item as Partial<FeedbackBackupManifestFile>;
    if (
      !file ||
      typeof file.path !== "string" ||
      typeof file.bytes !== "number" ||
      !Number.isInteger(file.bytes) ||
      file.bytes < 0 ||
      typeof file.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/i.test(file.sha256)
    ) {
      errors.push({ field: `manifest.files[${index}]`, message: "文件清单项必须包含 path、非负整数字节数和 SHA-256" });
      return;
    }
    files.push({ bytes: file.bytes, path: file.path, sha256: file.sha256.toLowerCase() });
  });
  return files;
}

function readBackupManifestCounts(value: unknown, errors: FeedbackImportMessage[]) {
  const counts: Record<string, number | undefined> = {};
  if (!value || typeof value !== "object") {
    errors.push({ field: "manifest.counts", message: "manifest.counts 必须是对象" });
    return counts;
  }
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0) {
      errors.push({ field: `manifest.counts.${key}`, message: "manifest 数量必须是非负整数" });
      continue;
    }
    counts[key] = raw;
  }
  return counts;
}

function validateBackupManifestFiles(
  entries: ReadonlyMap<string, Buffer>,
  files: readonly FeedbackBackupManifestFile[],
  errors: FeedbackImportMessage[],
) {
  for (const file of files) {
    const content = entries.get(file.path);
    if (!content) {
      errors.push({ field: file.path, message: "manifest 文件清单指向的 ZIP 条目不存在" });
      continue;
    }
    if (content.length !== file.bytes) {
      errors.push({ field: file.path, message: `文件字节数 ${content.length} 与 manifest ${file.bytes} 不一致` });
    }
    const digest = sha256(content);
    if (digest !== file.sha256) {
      errors.push({ field: file.path, message: "文件 SHA-256 与 manifest 不一致" });
    }
  }
}

function validateBackupManifestCompleteness(
  entries: ReadonlyMap<string, Buffer>,
  manifestPathSet: ReadonlySet<string>,
  errors: FeedbackImportMessage[],
) {
  const unexpected = [...entries.keys()].filter((path) => path !== "manifest.json" && !manifestPathSet.has(path));
  if (unexpected.length > 0) {
    errors.push({ field: "manifest.files", message: `ZIP 内有 ${unexpected.length} 个文件未列入 manifest` });
  }
}

function countBackupJsonlEntries(entries: ReadonlyMap<string, Buffer>, errors: FeedbackImportMessage[]) {
  const counts: Record<(typeof feedbackBackupJsonlCountFiles)[number][0], number> = {
    activity: 0,
    comments: 0,
    feedback: 0,
    projects: 0,
    relations: 0,
    users: 0,
  };
  for (const [key, path] of feedbackBackupJsonlCountFiles) {
    counts[key] = countJsonlEntries(entries, path, errors);
  }
  return counts;
}

function countJsonlEntries(entries: ReadonlyMap<string, Buffer>, path: string, errors: FeedbackImportMessage[]) {
  const content = entries.get(path);
  if (!content) {
    errors.push({ field: path, message: "完整备份缺少必需 JSONL 文件" });
    return 0;
  }
  const text = content.toString("utf8").trim();
  if (!text) return 0;
  const lines = text.split("\n");
  for (const [index, line] of lines.entries()) {
    try {
      JSON.parse(line);
    } catch {
      errors.push({ field: path, message: `第 ${index + 1} 行不是合法 JSON` });
      break;
    }
  }
  return lines.length;
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

function jsonLines(values: readonly unknown[]) {
  return values.map((value) => JSON.stringify(value)).join("\n") + (values.length > 0 ? "\n" : "");
}

function buildStoredZip(files: readonly StoredZipFile[]) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.path, "utf8");
    const content = zipFileContent(file.content);
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

function zipFileContent(content: Buffer | string) {
  return Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
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
