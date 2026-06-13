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
  | { status: "invalid"; reason: "duplicateGeneral" | "duplicateObjective" | "emptyBody" | "invalidObjective" | "objectiveRequired" };

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

function normalizeDayEntries(user: AuthenticatedOrfUser, entries: WorkLogDayEntryInput[]) {
  const seenObjectiveIds = new Set<string>();
  let hasGeneralEntry = false;
  const normalized: WorkLogDayEntryInput[] = [];

  for (const entry of entries) {
    const objectiveId = entry.objectiveId?.trim() || null;
    const bodyMarkdown = entry.bodyMarkdown.trim();
    if (!bodyMarkdown) {
      return { status: "invalid" as const, reason: "emptyBody" as const };
    }
    if (!objectiveId) {
      if (user.role !== "admin") {
        return { status: "invalid" as const, reason: "objectiveRequired" as const };
      }
      if (hasGeneralEntry) {
        return { status: "invalid" as const, reason: "duplicateGeneral" as const };
      }
      hasGeneralEntry = true;
      normalized.push({ objectiveId: null, bodyMarkdown });
      continue;
    }
    if (seenObjectiveIds.has(objectiveId)) {
      return { status: "invalid" as const, reason: "duplicateObjective" as const };
    }
    seenObjectiveIds.add(objectiveId);
    normalized.push({ objectiveId, bodyMarkdown });
  }

  return { status: "ok" as const, entries: normalized };
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

export async function saveMyWorkLogDay(
  user: AuthenticatedOrfUser,
  scope: RuntimeScope,
  workDate: string,
  entries: WorkLogDayEntryInput[],
): Promise<WorkLogDaySaveOutcome> {
  if (user.role !== "admin" && user.role !== "member") {
    return { status: "forbidden" };
  }

  const normalized = normalizeDayEntries(user, entries);
  if (normalized.status !== "ok") {
    return normalized;
  }

  const storageScopeId = runtimeScopeStorageId(scope);
  const existingRows = await db
    .select()
    .from(workLogEntries)
    .where(and(eq(workLogEntries.teamId, storageScopeId), eq(workLogEntries.authorUserId, user.id), eq(workLogEntries.workDate, workDate)));
  const existingByObjectiveId = new Map(existingRows.map((entry) => [entry.objectiveIdSnapshot ?? null, entry]));
  const newObjectiveIds = normalized.entries
    .map((entry) => entry.objectiveId ?? null)
    .filter((objectiveId): objectiveId is string => Boolean(objectiveId) && !existingByObjectiveId.has(objectiveId));
  const objectiveRows = newObjectiveIds.length > 0
    ? await listAuthorWorkLogObjectiveRows({ objectiveIds: newObjectiveIds, scope, user })
    : [];
  const objectiveById = new Map(objectiveRows.map((objective) => [objective.id, objective]));
  if (objectiveRows.length !== newObjectiveIds.length) {
    return { status: "invalid", reason: "invalidObjective" };
  }

  await db.transaction(async (tx) => {
    const retainedObjectiveIds = new Set(normalized.entries.map((entry) => entry.objectiveId ?? null));
    const staleIds = existingRows
      .filter((entry) => !retainedObjectiveIds.has(entry.objectiveIdSnapshot ?? null))
      .map((entry) => entry.id);
    if (staleIds.length > 0) {
      await tx.delete(workLogEntries).where(inArray(workLogEntries.id, staleIds));
    }

    const updatedAt = nowIso();
    for (const [index, entry] of normalized.entries.entries()) {
      const objectiveId = entry.objectiveId ?? null;
      const existing = existingByObjectiveId.get(objectiveId);
      if (existing) {
        await tx
          .update(workLogEntries)
          .set({
            bodyMarkdown: entry.bodyMarkdown,
            sortOrder: index,
            updatedAt,
          })
          .where(eq(workLogEntries.id, existing.id));
      } else if (!objectiveId) {
        await tx.insert(workLogEntries).values({
          id: makeWorkLogId(),
          teamId: storageScopeId,
          authorUserId: user.id,
          authorNameSnapshot: user.name,
          workDate,
          objectiveId: null,
          objectiveIdSnapshot: null,
          objectiveTitleSnapshot: null,
          bodyMarkdown: entry.bodyMarkdown,
          sortOrder: index,
          createdAt: updatedAt,
          updatedAt,
        });
      } else {
        const objective = objectiveById.get(objectiveId);
        if (!objective) continue;
        await tx.insert(workLogEntries).values({
          id: makeWorkLogId(),
          teamId: storageScopeId,
          authorUserId: user.id,
          authorNameSnapshot: user.name,
          workDate,
          objectiveId: objective.id,
          objectiveIdSnapshot: objective.id,
          objectiveTitleSnapshot: objective.title,
          bodyMarkdown: entry.bodyMarkdown,
          sortOrder: index,
          createdAt: updatedAt,
          updatedAt,
        });
      }
    }
  });

  publishRealtimeReadModelInvalidation(storageScopeId, {
    actorUserId: user.id,
    models: ["workLogs"],
    reason: "workLog.changed",
    target: { id: `${user.id}:${workDate}`, type: "workLog" },
  });

  return { status: "ok", entries: await listMyWorkLogDay(user.id, scope, workDate) };
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
