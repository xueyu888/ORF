import { and, asc, desc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { WorkLogActivityItem, WorkLogEntry, WorkLogObjectiveOption } from "../../src/types/orf";
import { avatarUrlForUser } from "../users/avatar/avatarRepository";
import { db } from "../db/client";
import { notifications, objectives, teamMembers, users, workLogEntries } from "../db/schema";
import { publishRealtimeReadModelInvalidation } from "../realtime/realtimeEventBus";
import type { AuthenticatedOrfUser } from "../auth/accessPolicy";
import type { RuntimeScope } from "./runtimeScope";
import { runtimeScopeStorageId } from "./runtimeScope";

export type WorkLogDayEntryInput = {
  bodyMarkdown: string;
  objectiveId?: string | null;
};

export type WorkLogDaySaveOutcome =
  | { status: "ok"; entries: WorkLogEntry[] }
  | { status: "forbidden" }
  | { status: "notFound" }
  | { status: "invalid"; reason: "emptyBody" | "invalidObjective" | "objectiveRequired" };

export type WorkLogActivityQuery = {
  from?: string;
  limit?: number;
  objectiveId?: string;
  to?: string;
  userId?: string;
};

export type WorkLogReminderRecipient = {
  id: string;
  name: string;
};

const nowIso = () => new Date().toISOString();
const makeWorkLogId = () => `worklog-${Date.now()}-${Math.random().toString(16).slice(2)}-${randomUUID()}`;

export function workLogReminderTargetId(workDate: string) {
  return `work-log-reminder-${workDate}`;
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
    bodyMarkdown: row.bodyMarkdown,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function normalizeWorkLogEntryInput(user: AuthenticatedOrfUser, input: WorkLogDayEntryInput) {
  const objectiveId = input.objectiveId?.trim() || null;
  const bodyMarkdown = input.bodyMarkdown.trim();
  if (!bodyMarkdown) {
    return { status: "invalid" as const, reason: "emptyBody" as const };
  }
  if (!objectiveId && user.role !== "admin") {
    return { status: "invalid" as const, reason: "objectiveRequired" as const };
  }

  return { status: "ok" as const, entry: { objectiveId, bodyMarkdown } };
}

async function listAuthorWorkLogObjectiveRows(input: { scope: RuntimeScope; user: AuthenticatedOrfUser; objectiveIds?: string[] }) {
  const storageScopeId = runtimeScopeStorageId(input.scope);
  const filters = [eq(objectives.teamId, storageScopeId)];
  if (input.user.role !== "admin") {
    filters.push(sql`${objectives.challengerUserIds} ? ${input.user.id}`);
  }
  if (input.objectiveIds) {
    filters.push(inArray(objectives.id, input.objectiveIds));
  }

  return db
    .select({
      finalDueAt: objectives.finalDueAt,
      flowStatus: objectives.flowStatus,
      id: objectives.id,
      title: objectives.title,
    })
    .from(objectives)
    .where(and(...filters))
    .orderBy(asc(objectives.finalDueAt), asc(objectives.title), asc(objectives.id));
}

export async function listWorkLogObjectiveOptions(user: AuthenticatedOrfUser, scope: RuntimeScope): Promise<WorkLogObjectiveOption[]> {
  const rows = await listAuthorWorkLogObjectiveRows({ scope, user });
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    flowStatus: row.flowStatus,
    finalDueAt: row.finalDueAt,
  }));
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

  const [objective] = await listAuthorWorkLogObjectiveRows({ objectiveIds: [input.objectiveId], scope: input.scope, user: input.user });
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

  const storageScopeId = runtimeScopeStorageId(scope);
  const updatedAt = nowIso();
  const objective = objectiveResult.objective;
  await db.insert(workLogEntries).values({
    id: makeWorkLogId(),
    teamId: storageScopeId,
    authorUserId: user.id,
    authorNameSnapshot: user.name,
    workDate,
    objectiveId: objective?.id ?? null,
    objectiveIdSnapshot: objective?.id ?? null,
    objectiveTitleSnapshot: objective?.title ?? null,
    bodyMarkdown: normalized.entry.bodyMarkdown,
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

  const updatedAt = nowIso();
  const targetPatch = objectiveResult.preserveExistingSnapshot
    ? {}
    : {
        objectiveId: objectiveResult.objective?.id ?? null,
        objectiveIdSnapshot: objectiveResult.objective?.id ?? null,
        objectiveTitleSnapshot: objectiveResult.objective?.title ?? null,
      };
  await db
    .update(workLogEntries)
    .set({
      ...targetPatch,
      bodyMarkdown: normalized.entry.bodyMarkdown,
      updatedAt,
    })
    .where(eq(workLogEntries.id, existing.id));

  publishRealtimeReadModelInvalidation(storageScopeId, {
    actorUserId: user.id,
    models: ["workLogs"],
    reason: "workLog.changed",
    target: { id: `${user.id}:${existing.workDate}`, type: "workLog" },
  });

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

export async function listWorkLogReminderRecipients(teamId: string, workDate: string): Promise<WorkLogReminderRecipient[]> {
  const targetId = workLogReminderTargetId(workDate);
  const rows = await db
    .select({ id: users.id, name: users.name })
    .from(teamMembers)
    .innerJoin(users, eq(teamMembers.userId, users.id))
    .where(and(
      eq(teamMembers.teamId, teamId),
      eq(users.status, "active"),
      or(
        eq(teamMembers.role, "admin"),
        and(
          eq(teamMembers.role, "member"),
          sql`exists (
            select 1
            from ${objectives}
            where ${objectives.teamId} = ${teamMembers.teamId}
              and ${objectives.challengerUserIds} ? (${users.id})::text
          )`,
        ),
      ),
      sql`not exists (
        select 1
        from ${workLogEntries}
        where ${workLogEntries.teamId} = ${teamMembers.teamId}
          and ${workLogEntries.authorUserId} = ${users.id}
          and ${workLogEntries.workDate} = ${workDate}
      )`,
      sql`not exists (
        select 1
        from ${notifications}
        where ${notifications.teamId} = ${teamMembers.teamId}
          and ${notifications.recipientUserId} = ${users.id}
          and ${notifications.kind} = 'worklog.reminder'
          and ${notifications.targetId} = ${targetId}
      )`,
    ))
    .orderBy(asc(users.name), asc(users.id));

  return rows;
}
