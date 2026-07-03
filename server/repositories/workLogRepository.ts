import { and, asc, desc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type {
  WorkLogActivityItem,
  WorkLogCategoryOption,
  WorkLogClassificationKind,
  WorkLogEntry,
  WorkLogObjectiveOption,
  WorkLogReport,
  WorkLogReportScope,
} from "../../src/types/orf";
import {
  canAttachObjectiveToWorkLog,
  canShowObjectiveInDefaultWorkLogList,
  canSaveUnscopedWorkLog,
  canUseAllWorkLogObjectiveOptions,
  canUseWorkLogCategoryInput,
  canUseWorkLogCategories,
  findBuiltInWorkLogCategoryForInput,
  listBuiltInWorkLogCategoryOptions,
  requiresObjectiveProgressEstimate,
  unscopedWorkLogMemberNameList,
  workLogObjectiveSelectionCandidateFlowStatuses,
  workLogObjectiveDefaultFlowStatuses,
} from "../../src/domain/orfWorkLogs";
import { avatarUrlForUser } from "../users/avatar/avatarRepository";
import { db } from "../db/client";
import { objectives, teamMembers, users, workLogCategories, workLogEntries } from "../db/schema";
import { publishRealtimeReadModelInvalidation } from "../realtime/realtimeEventBus";
import type { AuthenticatedOrfUser } from "../auth/accessPolicy";
import type { RuntimeScope } from "./runtimeScope";
import { runtimeScopeStorageId } from "./runtimeScope";
import { reconcileWorkLogReminderState } from "../workLogs/workLogReminderState";

export type WorkLogDayEntryInput = {
  bodyMarkdown: string;
  categoryId?: string | null;
  categoryName?: string | null;
  durationMinutes?: number | null;
  objectiveId?: string | null;
  remainingEstimatePercent?: number | null;
};

export type WorkLogDaySaveOutcome =
  | { status: "ok"; entries: WorkLogEntry[] }
  | { status: "forbidden" }
  | { status: "notFound" }
  | {
      status: "invalid";
      reason:
        | "categoryForbidden"
        | "classificationConflict"
        | "emptyBody"
        | "estimateRequired"
        | "invalidCategory"
        | "invalidDuration"
        | "invalidEstimate"
        | "invalidObjective"
        | "objectiveRequired";
    };

export type WorkLogActivityQuery = {
  from?: string;
  limit?: number;
  objectiveId?: string;
  to?: string;
  userId?: string;
};

export type WorkLogReportQuery = {
  from: string;
  scope: WorkLogReportScope;
  to: string;
};

type WorkLogObjectiveListScope = "attachment" | "default" | "search";

const nowIso = () => new Date().toISOString();
const makeWorkLogId = () => `worklog-${Date.now()}-${Math.random().toString(16).slice(2)}-${randomUUID()}`;
const makeWorkLogCategoryId = () => `worklog-category-${Date.now()}-${Math.random().toString(16).slice(2)}-${randomUUID()}`;

function normalizeWorkLogCategoryDisplayName(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 48);
}

function normalizeWorkLogCategoryNameKey(value: string) {
  return normalizeWorkLogCategoryDisplayName(value).toLocaleLowerCase();
}

function normalizeWorkLogObjectiveSearchQuery(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim().slice(0, 80) ?? "";
}

function escapedWorkLogObjectiveSearchPattern(value: string) {
  return `%${value.replace(/[\\%_]/g, "\\$&")}%`;
}

function isWorkLogObjectiveChallenger(row: { challengerUserIds: string[] }, userId: string) {
  return row.challengerUserIds.includes(userId);
}

function toWorkLogEntry(row: typeof workLogEntries.$inferSelect): WorkLogEntry {
  return {
    id: row.id,
    authorUserId: row.authorUserId,
    authorNameSnapshot: row.authorNameSnapshot,
    workDate: row.workDate,
    objectiveId: row.objectiveId,
    objectiveIdSnapshot: row.objectiveIdSnapshot,
    objectiveTitleSnapshot: row.objectiveTitleSnapshot,
    categoryId: row.categoryId,
    categoryIdSnapshot: row.categoryIdSnapshot,
    categoryNameSnapshot: row.categoryNameSnapshot,
    bodyMarkdown: row.bodyMarkdown,
    remainingEstimatePercent: row.remainingEstimatePercent,
    durationMinutes: row.durationMinutes,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function reconcileReminderAfterWorkLogChange(teamId: string, userId: string) {
  void reconcileWorkLogReminderState({
    publishRealtime: true,
    teamId,
    userId,
  }).catch((error) => {
    console.warn("[work-log] reminder state reconciliation failed", { teamId, userId }, error);
  });
}

function normalizeWorkLogEntryInput(user: AuthenticatedOrfUser, input: WorkLogDayEntryInput) {
  const objectiveId = input.objectiveId?.trim() || null;
  const categoryId = input.categoryId?.trim() || null;
  const categoryName = normalizeWorkLogCategoryDisplayName(input.categoryName ?? "");
  const bodyMarkdown = input.bodyMarkdown.trim();
  const remainingEstimatePercent = input.remainingEstimatePercent ?? null;
  const durationMinutes = input.durationMinutes ?? null;
  if (!bodyMarkdown) {
    return { status: "invalid" as const, reason: "emptyBody" as const };
  }
  if ((objectiveId && (categoryId || categoryName)) || (categoryId && categoryName)) {
    return { status: "invalid" as const, reason: "classificationConflict" as const };
  }
  if (!objectiveId && !categoryId && !categoryName && !canSaveUnscopedWorkLog(user)) {
    return { status: "invalid" as const, reason: "objectiveRequired" as const };
  }
  if ((categoryId || categoryName) && !canUseWorkLogCategoryInput(user, { categoryId, categoryName })) {
    return { status: "invalid" as const, reason: "categoryForbidden" as const };
  }
  if (
    remainingEstimatePercent !== null &&
    (!Number.isInteger(remainingEstimatePercent) || remainingEstimatePercent < 0 || remainingEstimatePercent > 100)
  ) {
    return { status: "invalid" as const, reason: "invalidEstimate" as const };
  }
  if (objectiveId && requiresObjectiveProgressEstimate(user) && remainingEstimatePercent === null) {
    return { status: "invalid" as const, reason: "estimateRequired" as const };
  }
  if (
    durationMinutes !== null &&
    (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440)
  ) {
    return { status: "invalid" as const, reason: "invalidDuration" as const };
  }

  return {
    status: "ok" as const,
    entry: {
      categoryId,
      categoryName,
      objectiveId,
      bodyMarkdown,
      remainingEstimatePercent: objectiveId ? remainingEstimatePercent : null,
      durationMinutes,
    },
  };
}

async function listAuthorWorkLogObjectiveRows(input: {
  listScope: WorkLogObjectiveListScope;
  objectiveIds?: string[];
  searchQuery?: string | null;
  scope: RuntimeScope;
  user: AuthenticatedOrfUser;
}) {
  const storageScopeId = runtimeScopeStorageId(input.scope);
  const searchQuery = normalizeWorkLogObjectiveSearchQuery(input.searchQuery);
  const usesAllObjectiveOptions =
    input.listScope === "default" && canUseAllWorkLogObjectiveOptions(input.user);
  const flowStatuses =
    input.listScope === "default" && !usesAllObjectiveOptions
      ? workLogObjectiveDefaultFlowStatuses
      : workLogObjectiveSelectionCandidateFlowStatuses;
  const filters = [eq(objectives.teamId, storageScopeId)];
  filters.push(inArray(objectives.flowStatus, [...flowStatuses]));
  if (input.listScope === "default" && !usesAllObjectiveOptions) {
    filters.push(sql`${objectives.challengerUserIds} ? ${input.user.id}`);
  }
  if (input.objectiveIds) {
    filters.push(inArray(objectives.id, input.objectiveIds));
  }
  if (input.listScope === "search" && searchQuery) {
    const pattern = escapedWorkLogObjectiveSearchPattern(searchQuery);
    filters.push(or(
      sql`${objectives.title} ILIKE ${pattern} ESCAPE '\\'`,
      sql`${objectives.id} ILIKE ${pattern} ESCAPE '\\'`,
    )!);
  }

  const rows = await db
    .select({
      finalDueAt: objectives.finalDueAt,
      flowStatus: objectives.flowStatus,
      id: objectives.id,
      challengerUserIds: objectives.challengerUserIds,
      title: objectives.title,
    })
    .from(objectives)
    .where(and(...filters))
    .orderBy(asc(objectives.finalDueAt), asc(objectives.title), asc(objectives.id));
  if (input.listScope === "default") {
    return rows.filter(
      usesAllObjectiveOptions ? canAttachObjectiveToWorkLog : canShowObjectiveInDefaultWorkLogList,
    );
  }
  if (input.listScope === "search" && !searchQuery) return rows.filter(canShowObjectiveInDefaultWorkLogList);
  return rows.filter(canAttachObjectiveToWorkLog);
}

async function listLatestWorkLogObjectiveEstimateByObjectiveId(input: {
  objectiveIds: string[];
  scope: RuntimeScope;
  user: AuthenticatedOrfUser;
}) {
  const latestEstimateByObjectiveId = new Map<string, number>();
  if (input.objectiveIds.length === 0) return latestEstimateByObjectiveId;

  const rows = await db
    .select({
      objectiveId: workLogEntries.objectiveIdSnapshot,
      remainingEstimatePercent: workLogEntries.remainingEstimatePercent,
    })
    .from(workLogEntries)
    .where(and(
      eq(workLogEntries.teamId, runtimeScopeStorageId(input.scope)),
      eq(workLogEntries.authorUserId, input.user.id),
      inArray(workLogEntries.objectiveIdSnapshot, input.objectiveIds),
      sql`${workLogEntries.remainingEstimatePercent} IS NOT NULL`,
    ))
    .orderBy(desc(workLogEntries.updatedAt), desc(workLogEntries.createdAt), desc(workLogEntries.id));

  for (const row of rows) {
    if (!row.objectiveId || row.remainingEstimatePercent === null) continue;
    if (!latestEstimateByObjectiveId.has(row.objectiveId)) {
      latestEstimateByObjectiveId.set(row.objectiveId, row.remainingEstimatePercent);
    }
  }
  return latestEstimateByObjectiveId;
}

export async function listWorkLogObjectiveOptions(
  user: AuthenticatedOrfUser,
  scope: RuntimeScope,
  options: { mode?: "default" | "search"; searchQuery?: string | null } = {},
): Promise<WorkLogObjectiveOption[]> {
  const rows = await listAuthorWorkLogObjectiveRows({
    listScope: options.mode === "search" ? "search" : "default",
    scope,
    searchQuery: options.searchQuery,
    user,
  });
  const latestEstimateByObjectiveId = await listLatestWorkLogObjectiveEstimateByObjectiveId({
    objectiveIds: rows.map((row) => row.id),
    scope,
    user,
  });
  return rows.map((row) => {
    return {
      id: row.id,
      title: row.title,
      flowStatus: row.flowStatus,
      finalDueAt: row.finalDueAt,
      isUserChallenger: isWorkLogObjectiveChallenger(row, user.id),
      latestRemainingEstimatePercent: latestEstimateByObjectiveId.get(row.id) ?? null,
    };
  });
}

export async function listWorkLogCategoryOptions(
  scope: RuntimeScope,
  user: AuthenticatedOrfUser,
): Promise<WorkLogCategoryOption[]> {
  const builtInCategories = listBuiltInWorkLogCategoryOptions(user);
  if (!canUseWorkLogCategories(user)) return builtInCategories;

  const builtInNames = new Set(builtInCategories.map((category) => normalizeWorkLogCategoryNameKey(category.name)));
  const rows = await db
    .select({
      id: workLogCategories.id,
      name: workLogCategories.name,
      createdAt: workLogCategories.createdAt,
      updatedAt: workLogCategories.updatedAt,
    })
    .from(workLogCategories)
    .where(eq(workLogCategories.teamId, runtimeScopeStorageId(scope)))
    .orderBy(asc(workLogCategories.name), asc(workLogCategories.id));
  return [
    ...builtInCategories,
    ...rows
      .filter((row) => !builtInNames.has(normalizeWorkLogCategoryNameKey(row.name)))
      .map((row) => ({
        ...row,
        source: "managed" as const,
      })),
  ];
}

export async function listMyWorkLogDay(userId: string, scope: RuntimeScope, workDate: string): Promise<WorkLogEntry[]> {
  const rows = await db
    .select()
    .from(workLogEntries)
    .where(and(
      eq(workLogEntries.teamId, runtimeScopeStorageId(scope)),
      eq(workLogEntries.authorUserId, userId),
      eq(workLogEntries.workDate, workDate),
    ))
    .orderBy(asc(workLogEntries.sortOrder), asc(workLogEntries.createdAt), asc(workLogEntries.id));
  return rows.map(toWorkLogEntry);
}

async function getNextWorkLogSortOrder(scope: RuntimeScope, userId: string, workDate: string) {
  const rows = await db
    .select({ sortOrder: workLogEntries.sortOrder })
    .from(workLogEntries)
    .where(and(
      eq(workLogEntries.teamId, runtimeScopeStorageId(scope)),
      eq(workLogEntries.authorUserId, userId),
      eq(workLogEntries.workDate, workDate),
    ));
  return Math.max(-1, ...rows.map((row) => row.sortOrder)) + 1;
}

type ResolvedWorkLogCategory = {
  name: string;
  snapshotCategoryId: string | null;
  storageCategoryId: string | null;
};

async function findWorkLogCategoryById(scope: RuntimeScope, categoryId: string) {
  const [category] = await db
    .select({
      id: workLogCategories.id,
      name: workLogCategories.name,
    })
    .from(workLogCategories)
    .where(and(eq(workLogCategories.teamId, runtimeScopeStorageId(scope)), eq(workLogCategories.id, categoryId)))
    .limit(1);
  return category ?? null;
}

async function findWorkLogCategoryByName(scope: RuntimeScope, name: string) {
  const [category] = await db
    .select({
      id: workLogCategories.id,
      name: workLogCategories.name,
    })
    .from(workLogCategories)
    .where(and(eq(workLogCategories.teamId, runtimeScopeStorageId(scope)), eq(workLogCategories.normalizedName, normalizeWorkLogCategoryNameKey(name))))
    .limit(1);
  return category ?? null;
}

async function resolveOrCreateWorkLogCategoryForInput(input: {
  categoryId: string | null;
  categoryName: string;
  scope: RuntimeScope;
  user: AuthenticatedOrfUser;
}): Promise<{ status: "ok"; category: ResolvedWorkLogCategory | null } | { status: "invalid"; reason: "invalidCategory" }> {
  const builtInCategory = findBuiltInWorkLogCategoryForInput(input.user, {
    categoryId: input.categoryId,
    categoryName: input.categoryName,
  });
  if (builtInCategory) {
    return {
      status: "ok",
      category: {
        name: builtInCategory.name,
        snapshotCategoryId: builtInCategory.id,
        storageCategoryId: null,
      },
    };
  }

  if (input.categoryId) {
    const category = await findWorkLogCategoryById(input.scope, input.categoryId);
    return category
      ? {
          status: "ok",
          category: {
            name: category.name,
            snapshotCategoryId: category.id,
            storageCategoryId: category.id,
          },
        }
      : { status: "invalid", reason: "invalidCategory" };
  }
  if (!input.categoryName) {
    return { status: "ok", category: null };
  }

  const existing = await findWorkLogCategoryByName(input.scope, input.categoryName);
  if (existing) {
    return {
      status: "ok",
      category: {
        name: existing.name,
        snapshotCategoryId: existing.id,
        storageCategoryId: existing.id,
      },
    };
  }

  const now = nowIso();
  const [created] = await db
    .insert(workLogCategories)
    .values({
      id: makeWorkLogCategoryId(),
      teamId: runtimeScopeStorageId(input.scope),
      name: input.categoryName,
      normalizedName: normalizeWorkLogCategoryNameKey(input.categoryName),
      createdByUserId: input.user.id,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: [workLogCategories.teamId, workLogCategories.normalizedName] })
    .returning({
      id: workLogCategories.id,
      name: workLogCategories.name,
    });
  if (created) {
    return {
      status: "ok",
      category: {
        name: created.name,
        snapshotCategoryId: created.id,
        storageCategoryId: created.id,
      },
    };
  }

  const raced = await findWorkLogCategoryByName(input.scope, input.categoryName);
  return raced
    ? {
        status: "ok",
        category: {
          name: raced.name,
          snapshotCategoryId: raced.id,
          storageCategoryId: raced.id,
        },
      }
    : { status: "invalid", reason: "invalidCategory" };
}

async function resolveWorkLogCategoryForInput(input: {
  categoryId: string | null;
  categoryName: string;
  existingCategoryIdSnapshot?: string | null;
  scope: RuntimeScope;
  user: AuthenticatedOrfUser;
}): Promise<
  | { status: "ok"; category: ResolvedWorkLogCategory | null; preserveExistingSnapshot: boolean }
  | { status: "invalid"; reason: "invalidCategory" }
> {
  if (!input.categoryId && !input.categoryName) {
    return { status: "ok", category: null, preserveExistingSnapshot: false };
  }
  if (input.categoryId && input.existingCategoryIdSnapshot === input.categoryId) {
    return { status: "ok", category: null, preserveExistingSnapshot: true };
  }

  const result = await resolveOrCreateWorkLogCategoryForInput({
    categoryId: input.categoryId,
    categoryName: input.categoryName,
    scope: input.scope,
    user: input.user,
  });
  return result.status === "ok"
    ? { status: "ok", category: result.category, preserveExistingSnapshot: false }
    : result;
}

async function resolveWorkLogObjectiveForInput(input: {
  existingObjectiveIdSnapshot?: string | null;
  objectiveId: string | null;
  scope: RuntimeScope;
  user: AuthenticatedOrfUser;
}) {
  if (!input.objectiveId) {
    return { status: "ok" as const, objective: null, preserveExistingSnapshot: false };
  }
  if (input.existingObjectiveIdSnapshot === input.objectiveId) {
    return { status: "ok" as const, objective: null, preserveExistingSnapshot: true };
  }

  const [objective] = await listAuthorWorkLogObjectiveRows({
    listScope: "attachment",
    objectiveIds: [input.objectiveId],
    scope: input.scope,
    user: input.user,
  });
  if (!objective) {
    return { status: "invalid" as const, reason: "invalidObjective" as const };
  }

  return { status: "ok" as const, objective, preserveExistingSnapshot: false };
}

export async function createMyWorkLogEntry(
  user: AuthenticatedOrfUser,
  scope: RuntimeScope,
  workDate: string,
  input: WorkLogDayEntryInput,
): Promise<WorkLogDaySaveOutcome> {
  if (user.role !== "admin" && user.role !== "member") {
    return { status: "forbidden" };
  }

  const normalized = normalizeWorkLogEntryInput(user, input);
  if (normalized.status !== "ok") {
    return normalized;
  }

  const objectiveResult = await resolveWorkLogObjectiveForInput({
    objectiveId: normalized.entry.objectiveId ?? null,
    scope,
    user,
  });
  if (objectiveResult.status !== "ok") {
    return objectiveResult;
  }
  const categoryResult = await resolveWorkLogCategoryForInput({
    categoryId: normalized.entry.categoryId,
    categoryName: normalized.entry.categoryName,
    scope,
    user,
  });
  if (categoryResult.status !== "ok") {
    return categoryResult;
  }

  const storageScopeId = runtimeScopeStorageId(scope);
  const updatedAt = nowIso();
  const objective = objectiveResult.objective;
  const category = categoryResult.category;
  await db.insert(workLogEntries).values({
    id: makeWorkLogId(),
    teamId: storageScopeId,
    authorUserId: user.id,
    authorNameSnapshot: user.name,
    workDate,
    objectiveId: objective?.id ?? null,
    objectiveIdSnapshot: objective?.id ?? null,
    objectiveTitleSnapshot: objective?.title ?? null,
    categoryId: category?.storageCategoryId ?? null,
    categoryIdSnapshot: category?.snapshotCategoryId ?? null,
    categoryNameSnapshot: category?.name ?? null,
    bodyMarkdown: normalized.entry.bodyMarkdown,
    remainingEstimatePercent: normalized.entry.remainingEstimatePercent,
    durationMinutes: normalized.entry.durationMinutes,
    sortOrder: await getNextWorkLogSortOrder(scope, user.id, workDate),
    createdAt: updatedAt,
    updatedAt,
  });

  publishRealtimeReadModelInvalidation(storageScopeId, {
    actorUserId: user.id,
    models: ["workLogs"],
    reason: "workLog.changed",
    target: { id: `${user.id}:${workDate}`, type: "workLog" },
  });
  reconcileReminderAfterWorkLogChange(storageScopeId, user.id);

  return { status: "ok", entries: await listMyWorkLogDay(user.id, scope, workDate) };
}

export async function updateMyWorkLogEntry(
  user: AuthenticatedOrfUser,
  scope: RuntimeScope,
  entryId: string,
  input: WorkLogDayEntryInput,
): Promise<WorkLogDaySaveOutcome> {
  if (user.role !== "admin" && user.role !== "member") {
    return { status: "forbidden" };
  }

  const storageScopeId = runtimeScopeStorageId(scope);
  const [existing] = await db
    .select()
    .from(workLogEntries)
    .where(and(eq(workLogEntries.teamId, storageScopeId), eq(workLogEntries.authorUserId, user.id), eq(workLogEntries.id, entryId)))
    .limit(1);
  if (!existing) {
    return { status: "notFound" };
  }

  const normalized = normalizeWorkLogEntryInput(user, input);
  if (normalized.status !== "ok") {
    return normalized;
  }

  const objectiveResult = await resolveWorkLogObjectiveForInput({
    existingObjectiveIdSnapshot: existing.objectiveIdSnapshot ?? null,
    objectiveId: normalized.entry.objectiveId ?? null,
    scope,
    user,
  });
  if (objectiveResult.status !== "ok") {
    return objectiveResult;
  }
  const categoryResult = await resolveWorkLogCategoryForInput({
    existingCategoryIdSnapshot: existing.categoryIdSnapshot ?? null,
    categoryId: normalized.entry.categoryId,
    categoryName: normalized.entry.categoryName,
    scope,
    user,
  });
  if (categoryResult.status !== "ok") {
    return categoryResult;
  }

  const updatedAt = nowIso();
  const targetPatch = objectiveResult.preserveExistingSnapshot
    ? {}
    : {
        objectiveId: objectiveResult.objective?.id ?? null,
        objectiveIdSnapshot: objectiveResult.objective?.id ?? null,
        objectiveTitleSnapshot: objectiveResult.objective?.title ?? null,
      };
  const categoryPatch = categoryResult.preserveExistingSnapshot
    ? {}
    : {
        categoryId: categoryResult.category?.storageCategoryId ?? null,
        categoryIdSnapshot: categoryResult.category?.snapshotCategoryId ?? null,
        categoryNameSnapshot: categoryResult.category?.name ?? null,
      };
  await db
    .update(workLogEntries)
    .set({
      ...targetPatch,
      ...categoryPatch,
      bodyMarkdown: normalized.entry.bodyMarkdown,
      remainingEstimatePercent: normalized.entry.remainingEstimatePercent,
      durationMinutes: normalized.entry.durationMinutes,
      updatedAt,
    })
    .where(eq(workLogEntries.id, existing.id));

  publishRealtimeReadModelInvalidation(storageScopeId, {
    actorUserId: user.id,
    models: ["workLogs"],
    reason: "workLog.changed",
    target: { id: `${user.id}:${existing.workDate}`, type: "workLog" },
  });
  reconcileReminderAfterWorkLogChange(storageScopeId, user.id);

  return { status: "ok", entries: await listMyWorkLogDay(user.id, scope, existing.workDate) };
}

export async function deleteMyWorkLogEntry(
  user: AuthenticatedOrfUser,
  scope: RuntimeScope,
  entryId: string,
): Promise<WorkLogDaySaveOutcome> {
  if (user.role !== "admin" && user.role !== "member") {
    return { status: "forbidden" };
  }

  const storageScopeId = runtimeScopeStorageId(scope);
  const [existing] = await db
    .select()
    .from(workLogEntries)
    .where(and(eq(workLogEntries.teamId, storageScopeId), eq(workLogEntries.authorUserId, user.id), eq(workLogEntries.id, entryId)))
    .limit(1);
  if (!existing) {
    return { status: "notFound" };
  }

  await db.delete(workLogEntries).where(eq(workLogEntries.id, existing.id));

  publishRealtimeReadModelInvalidation(storageScopeId, {
    actorUserId: user.id,
    models: ["workLogs"],
    reason: "workLog.changed",
    target: { id: `${user.id}:${existing.workDate}`, type: "workLog" },
  });
  reconcileReminderAfterWorkLogChange(storageScopeId, user.id);

  return { status: "ok", entries: await listMyWorkLogDay(user.id, scope, existing.workDate) };
}

export async function listWorkLogActivity(scope: RuntimeScope, query: WorkLogActivityQuery = {}): Promise<WorkLogActivityItem[]> {
  const storageScopeId = runtimeScopeStorageId(scope);
  const filters = [eq(workLogEntries.teamId, storageScopeId)];
  if (query.from) {
    filters.push(gte(workLogEntries.workDate, query.from));
  }
  if (query.to) {
    filters.push(lte(workLogEntries.workDate, query.to));
  }
  if (query.userId) {
    filters.push(eq(workLogEntries.authorUserId, query.userId));
  }
  if (query.objectiveId) {
    filters.push(eq(workLogEntries.objectiveIdSnapshot, query.objectiveId));
  }

  const rows = await db
    .select({
      entry: workLogEntries,
      authorAvatarObjectKey: users.avatarObjectKey,
      authorAvatarUpdatedAt: users.avatarUpdatedAt,
      authorCurrentName: users.name,
    })
    .from(workLogEntries)
    .leftJoin(users, eq(workLogEntries.authorUserId, users.id))
    .where(and(...filters))
    .orderBy(desc(workLogEntries.workDate), desc(workLogEntries.updatedAt), desc(workLogEntries.createdAt), asc(workLogEntries.sortOrder))
    .limit(Math.max(1, Math.min(query.limit ?? 80, 160)));

  return rows.map((row) => ({
    ...toWorkLogEntry(row.entry),
    authorAvatarUrl: row.authorCurrentName
      ? avatarUrlForUser({
          id: row.entry.authorUserId,
          avatarObjectKey: row.authorAvatarObjectKey,
          avatarUpdatedAt: row.authorAvatarUpdatedAt,
        })
      : null,
    authorCurrentName: row.authorCurrentName,
  }));
}

type WorkLogClassificationSnapshot = {
  categoryId: string | null;
  kind: WorkLogClassificationKind;
  objectiveId: string | null;
  title: string;
};

type ReportClassificationAccumulator = WorkLogClassificationSnapshot & {
  entryCount: number;
  latestEntryAt: string | null;
  latestRemainingEstimatePercent: number | null;
  totalDurationMinutes: number;
};

type ReportCellAccumulator = {
  userId: string;
  date: string;
  entryCount: number;
  entries: Array<{
    id: string;
    categoryId: string | null;
    classificationKind: WorkLogClassificationKind;
    classificationTitle: string;
    objectiveId: string | null;
    bodyMarkdown: string;
    durationMinutes: number | null;
    remainingEstimatePercent: number | null;
    createdAt: string;
    updatedAt: string;
  }>;
  latestEntryAt: string | null;
  latestRemainingEstimatePercent: number | null;
  classificationIds: Set<string>;
  classifications: Map<string, ReportClassificationAccumulator>;
  remainingValues: number[];
  totalDurationMinutes: number;
};

function dateRangeDays(from: string, to: string) {
  const days: string[] = [];
  const cursor = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  while (!Number.isNaN(cursor.getTime()) && !Number.isNaN(end.getTime()) && cursor.getTime() <= end.getTime() && days.length <= 120) {
    days.push(dateOnlyString(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function dateOnlyString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function averagePercent(values: number[]) {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function isLaterTimestamp(left: string | null, right: string) {
  return !left || new Date(right).getTime() >= new Date(left).getTime();
}

function workLogClassificationSnapshot(entry: typeof workLogEntries.$inferSelect): WorkLogClassificationSnapshot {
  if (entry.objectiveIdSnapshot || entry.objectiveTitleSnapshot) {
    return {
      categoryId: null,
      kind: "objective",
      objectiveId: entry.objectiveIdSnapshot,
      title: entry.objectiveTitleSnapshot ?? entry.objectiveIdSnapshot ?? "历史目标",
    };
  }
  if (entry.categoryIdSnapshot || entry.categoryNameSnapshot) {
    return {
      categoryId: entry.categoryIdSnapshot,
      kind: "category",
      objectiveId: null,
      title: entry.categoryNameSnapshot ?? entry.categoryIdSnapshot ?? "历史分类",
    };
  }
  return {
    categoryId: null,
    kind: "uncategorized",
    objectiveId: null,
    title: "未归类",
  };
}

function workLogClassificationKey(classification: WorkLogClassificationSnapshot) {
  if (classification.kind === "objective") {
    return `objective:${classification.objectiveId ?? classification.title}`;
  }
  if (classification.kind === "category") {
    return `category:${classification.categoryId ?? classification.title}`;
  }
  return "uncategorized";
}

export async function getWorkLogReport(
  user: AuthenticatedOrfUser,
  scope: RuntimeScope,
  query: WorkLogReportQuery,
): Promise<WorkLogReport> {
  const storageScopeId = runtimeScopeStorageId(scope);
  const userFilters = [
    eq(teamMembers.teamId, storageScopeId),
    eq(users.status, "active"),
    or(eq(teamMembers.role, "admin"), eq(teamMembers.role, "member")),
  ];
  if (query.scope === "mine") {
    userFilters.push(eq(users.id, user.id));
  }

  const userRows = await db
    .select({
      avatarObjectKey: users.avatarObjectKey,
      avatarUpdatedAt: users.avatarUpdatedAt,
      id: users.id,
      name: users.name,
      role: teamMembers.role,
    })
    .from(teamMembers)
    .innerJoin(users, eq(teamMembers.userId, users.id))
    .where(and(...userFilters))
    .orderBy(asc(users.name), asc(users.id));
  const userIds = userRows.map((row) => row.id);
  const days = dateRangeDays(query.from, query.to);
  const cellMap = new Map<string, ReportCellAccumulator>();
  const userRemainingValues = new Map<string, number[]>();
  const userDurationMinutes = new Map<string, number>();
  const totalRemainingValues: number[] = [];
  let totalDurationMinutes = 0;

  for (const row of userRows) {
    userRemainingValues.set(row.id, []);
    userDurationMinutes.set(row.id, 0);
    for (const date of days) {
      cellMap.set(`${row.id}:${date}`, {
        userId: row.id,
        date,
        entryCount: 0,
        entries: [],
        latestEntryAt: null,
        latestRemainingEstimatePercent: null,
        classificationIds: new Set(),
        classifications: new Map(),
        remainingValues: [],
        totalDurationMinutes: 0,
      });
    }
  }

  if (userIds.length > 0 && days.length > 0) {
    const entryFilters = [
      eq(workLogEntries.teamId, storageScopeId),
      gte(workLogEntries.workDate, query.from),
      lte(workLogEntries.workDate, query.to),
      inArray(workLogEntries.authorUserId, userIds),
    ];
    const entryRows = await db
      .select()
      .from(workLogEntries)
      .where(and(...entryFilters))
      .orderBy(asc(workLogEntries.workDate), asc(workLogEntries.sortOrder), asc(workLogEntries.createdAt), asc(workLogEntries.id));

    for (const entry of entryRows) {
      const key = `${entry.authorUserId}:${entry.workDate}`;
      const cell = cellMap.get(key);
      if (!cell) continue;

      const classification = workLogClassificationSnapshot(entry);
      cell.entryCount += 1;
      cell.entries.push({
        id: entry.id,
        categoryId: classification.categoryId,
        classificationKind: classification.kind,
        classificationTitle: classification.title,
        objectiveId: classification.objectiveId,
        bodyMarkdown: entry.bodyMarkdown,
        durationMinutes: entry.durationMinutes,
        remainingEstimatePercent: entry.remainingEstimatePercent,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
      });
      cell.classificationIds.add(workLogClassificationKey(classification));
      if (isLaterTimestamp(cell.latestEntryAt, entry.updatedAt)) {
        cell.latestEntryAt = entry.updatedAt;
        cell.latestRemainingEstimatePercent = entry.remainingEstimatePercent;
      }
      if (entry.remainingEstimatePercent !== null) {
        cell.remainingValues.push(entry.remainingEstimatePercent);
        userRemainingValues.get(entry.authorUserId)?.push(entry.remainingEstimatePercent);
        totalRemainingValues.push(entry.remainingEstimatePercent);
      }
      if (entry.durationMinutes !== null) {
        cell.totalDurationMinutes += entry.durationMinutes;
        userDurationMinutes.set(entry.authorUserId, (userDurationMinutes.get(entry.authorUserId) ?? 0) + entry.durationMinutes);
        totalDurationMinutes += entry.durationMinutes;
      }

      const classificationKey = workLogClassificationKey(classification);
      const classificationItem = cell.classifications.get(classificationKey) ?? {
        ...classification,
        entryCount: 0,
        latestEntryAt: null,
        latestRemainingEstimatePercent: null,
        totalDurationMinutes: 0,
      };
      classificationItem.entryCount += 1;
      if (entry.durationMinutes !== null) {
        classificationItem.totalDurationMinutes += entry.durationMinutes;
      }
      if (isLaterTimestamp(classificationItem.latestEntryAt, entry.updatedAt)) {
        classificationItem.latestEntryAt = entry.updatedAt;
        classificationItem.latestRemainingEstimatePercent = entry.remainingEstimatePercent;
      }
      cell.classifications.set(classificationKey, classificationItem);
    }
  }

  const cells = Array.from(cellMap.values()).map((cell) => ({
    userId: cell.userId,
    date: cell.date,
    entryCount: cell.entryCount,
    classificationCount: cell.classificationIds.size,
    latestEntryAt: cell.latestEntryAt,
    latestRemainingEstimatePercent: cell.latestRemainingEstimatePercent,
    totalDurationMinutes: cell.totalDurationMinutes,
    entries: cell.entries,
    classifications: Array.from(cell.classifications.values())
      .sort((left, right) => right.entryCount - left.entryCount || left.title.localeCompare(right.title))
      .map((classification) => ({
        kind: classification.kind,
        objectiveId: classification.objectiveId,
        categoryId: classification.categoryId,
        title: classification.title,
        entryCount: classification.entryCount,
        latestRemainingEstimatePercent: classification.latestRemainingEstimatePercent,
        totalDurationMinutes: classification.totalDurationMinutes,
      })),
  }));
  const cellsByUser = new Map<string, typeof cells>();
  for (const cell of cells) {
    const items = cellsByUser.get(cell.userId) ?? [];
    items.push(cell);
    cellsByUser.set(cell.userId, items);
  }

  const usersWithEntries = new Set<string>();
  const activeDates = new Set<string>();
  const totalClassificationIds = new Set<string>();
  const usersReport = userRows.map((row) => {
    const role = row.role === "admin" ? "admin" as const : "member" as const;
    const userCells = cellsByUser.get(row.id) ?? [];
    const coveredClassificationIds = new Set<string>();
    let totalEntries = 0;
    let activeDays = 0;
    for (const cell of userCells) {
      totalEntries += cell.entryCount;
      if (cell.entryCount > 0) {
        activeDays += 1;
        usersWithEntries.add(row.id);
        activeDates.add(cell.date);
      }
      for (const classification of cell.classifications) {
        const key = `${classification.kind}:${classification.objectiveId ?? classification.categoryId ?? classification.title}`;
        coveredClassificationIds.add(key);
        totalClassificationIds.add(key);
      }
    }

    return {
      id: row.id,
      name: row.name,
      avatarUrl: avatarUrlForUser({
        id: row.id,
        avatarObjectKey: row.avatarObjectKey,
        avatarUpdatedAt: row.avatarUpdatedAt,
      }),
      role,
      totalEntries,
      activeDays,
      coveredClassificationCount: coveredClassificationIds.size,
      averageRemainingEstimatePercent: averagePercent(userRemainingValues.get(row.id) ?? []),
      totalDurationMinutes: userDurationMinutes.get(row.id) ?? 0,
    };
  });

  return {
    scope: query.scope,
    from: query.from,
    to: query.to,
    users: usersReport,
    cells,
    totals: {
      totalEntries: cells.reduce((sum, cell) => sum + cell.entryCount, 0),
      activeDays: activeDates.size,
      usersWithEntries: usersWithEntries.size,
      coveredClassificationCount: totalClassificationIds.size,
      averageRemainingEstimatePercent: averagePercent(totalRemainingValues),
      totalDurationMinutes,
    },
  };
}
