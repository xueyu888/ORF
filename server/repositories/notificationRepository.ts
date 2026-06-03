import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { AppNotification, NotificationKind, NotificationTargetType } from "../../src/types/orf";
import { db } from "../db/client";
import { notifications, teamMembers, users } from "../db/schema";
import { publishRealtimeNotification, publishRealtimeReadModelInvalidation } from "../realtime/realtimeEventBus";
import type { RuntimeScope } from "./runtimeScope";
import { runtimeScopeStorageId } from "./runtimeScope";

type NotificationInput = {
  actorName: string;
  actorUserId?: string | null;
  body: string;
  kind: NotificationKind;
  metadata?: Record<string, string>;
  recipientUserIds: string[];
  targetHref: string;
  targetId: string;
  targetType: NotificationTargetType;
  teamId: string;
  title: string;
};

const nowIso = () => new Date().toISOString();
const makeId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}-${randomUUID()}`;

function uniqueRecipients(recipientUserIds: string[], actorUserId?: string | null) {
  const actor = actorUserId?.trim();
  return Array.from(new Set(recipientUserIds.map((id) => id.trim()).filter(Boolean))).filter((id) => id !== actor);
}

function toNotification(row: typeof notifications.$inferSelect): AppNotification {
  return {
    id: row.id,
    kind: row.kind,
    recipientUserId: row.recipientUserId,
    actorUserId: row.actorUserId,
    actorName: row.actorName,
    title: row.title,
    body: row.body,
    targetType: row.targetType,
    targetId: row.targetId,
    targetHref: row.targetHref,
    readAt: row.readAt,
    createdAt: row.createdAt,
    metadata: row.metadata ?? {},
  };
}

export async function createNotifications(input: NotificationInput): Promise<AppNotification[]> {
  const recipientUserIds = uniqueRecipients(input.recipientUserIds, input.actorUserId);
  if (recipientUserIds.length === 0) {
    return [];
  }

  const createdAt = nowIso();
  const rows = recipientUserIds.map((recipientUserId) => ({
    id: makeId("notification"),
    teamId: input.teamId,
    recipientUserId,
    actorUserId: input.actorUserId?.trim() || null,
    actorName: input.actorName.trim(),
    kind: input.kind,
    title: input.title.trim(),
    body: input.body.trim(),
    targetType: input.targetType,
    targetId: input.targetId,
    targetHref: input.targetHref,
    readAt: null,
    createdAt,
    metadata: input.metadata ?? {},
  }));

  const inserted = await db.insert(notifications).values(rows).returning();
  const created = inserted.map(toNotification);
  for (const notification of created) {
    publishRealtimeNotification(input.teamId, notification);
  }
  publishRealtimeReadModelInvalidation(input.teamId, {
    actorUserId: input.actorUserId,
    models: ["notifications"],
    reason: "notification.changed",
    target: { id: created[0]?.id ?? "batch", type: "notification" },
  });
  return created;
}

export async function getActiveAdminNotificationRecipients(teamId: string): Promise<string[]> {
  const rows = await db
    .select({ id: users.id })
    .from(teamMembers)
    .innerJoin(users, eq(teamMembers.userId, users.id))
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.role, "admin"), eq(users.status, "active")));
  return rows.map((row) => row.id);
}

export async function getActiveTeamNotificationRecipients(teamId: string): Promise<string[]> {
  const rows = await db
    .select({ id: users.id })
    .from(teamMembers)
    .innerJoin(users, eq(teamMembers.userId, users.id))
    .where(and(eq(teamMembers.teamId, teamId), eq(users.status, "active")));
  return rows.map((row) => row.id);
}

export async function getActiveMemberNotificationRecipientsByNames(teamId: string, memberNames: string[]): Promise<string[]> {
  const names = Array.from(new Set(memberNames.map((name) => name.trim()).filter(Boolean)));
  if (names.length === 0) {
    return [];
  }

  const rows = await db
    .select({ id: users.id })
    .from(teamMembers)
    .innerJoin(users, eq(teamMembers.userId, users.id))
    .where(and(eq(teamMembers.teamId, teamId), eq(users.status, "active"), inArray(users.name, names)));
  return rows.map((row) => row.id);
}

export async function getActiveMemberNotificationRecipientsByIds(teamId: string, userIds: string[]): Promise<string[]> {
  const ids = Array.from(new Set(userIds.map((id) => id.trim()).filter(Boolean)));
  if (ids.length === 0) {
    return [];
  }

  const rows = await db
    .select({ id: users.id })
    .from(teamMembers)
    .innerJoin(users, eq(teamMembers.userId, users.id))
    .where(and(eq(teamMembers.teamId, teamId), eq(users.status, "active"), inArray(users.id, ids)));
  return rows.map((row) => row.id);
}

export async function getUserNameById(userId: string | null | undefined): Promise<string> {
  const id = userId?.trim();
  if (!id) {
    return "";
  }

  const [row] = await db.select({ name: users.name }).from(users).where(eq(users.id, id)).limit(1);
  return row?.name ?? "";
}

export async function listNotificationsForUser(userId: string, scope: RuntimeScope, limit = 50): Promise<AppNotification[]> {
  const rows = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.teamId, runtimeScopeStorageId(scope)), eq(notifications.recipientUserId, userId)))
    .orderBy(desc(notifications.createdAt))
    .limit(Math.max(1, Math.min(100, limit)));
  return rows.map(toNotification);
}

export async function getUnreadNotificationCount(userId: string, scope: RuntimeScope): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.teamId, runtimeScopeStorageId(scope)), eq(notifications.recipientUserId, userId), isNull(notifications.readAt)))
    .limit(1);
  return Number(row?.count ?? 0);
}

export async function markNotificationRead(notificationId: string, userId: string, scope: RuntimeScope): Promise<AppNotification | null> {
  const [row] = await db
    .update(notifications)
    .set({ readAt: nowIso() })
    .where(and(eq(notifications.id, notificationId), eq(notifications.teamId, runtimeScopeStorageId(scope)), eq(notifications.recipientUserId, userId)))
    .returning();
  if (!row) {
    return null;
  }
  publishRealtimeReadModelInvalidation(runtimeScopeStorageId(scope), {
    actorUserId: userId,
    models: ["notifications"],
    reason: "notification.changed",
    target: { id: notificationId, type: "notification" },
  });
  return toNotification(row);
}

export async function markAllNotificationsRead(userId: string, scope: RuntimeScope): Promise<number> {
  const rows = await db
    .update(notifications)
    .set({ readAt: nowIso() })
    .where(and(eq(notifications.teamId, runtimeScopeStorageId(scope)), eq(notifications.recipientUserId, userId), isNull(notifications.readAt)))
    .returning({ id: notifications.id });
  if (rows.length > 0) {
    publishRealtimeReadModelInvalidation(runtimeScopeStorageId(scope), {
      actorUserId: userId,
      models: ["notifications"],
      reason: "notification.changed",
      target: { id: "all", type: "notification" },
    });
  }
  return rows.length;
}

export async function deleteNotificationsForUser(notificationIds: string[], userId: string, scope: RuntimeScope): Promise<number> {
  const ids = Array.from(new Set(notificationIds.map((id) => id.trim()).filter(Boolean)));
  if (ids.length === 0) {
    return 0;
  }

  const rows = await db
    .delete(notifications)
    .where(and(eq(notifications.teamId, runtimeScopeStorageId(scope)), eq(notifications.recipientUserId, userId), inArray(notifications.id, ids)))
    .returning({ id: notifications.id });
  if (rows.length > 0) {
    publishRealtimeReadModelInvalidation(runtimeScopeStorageId(scope), {
      actorUserId: userId,
      models: ["notifications"],
      reason: "notification.changed",
      target: { id: "bulk-delete", type: "notification" },
    });
  }
  return rows.length;
}

export async function clearNotificationsForUser(userId: string, scope: RuntimeScope): Promise<number> {
  const rows = await db
    .delete(notifications)
    .where(and(eq(notifications.teamId, runtimeScopeStorageId(scope)), eq(notifications.recipientUserId, userId)))
    .returning({ id: notifications.id });
  if (rows.length > 0) {
    publishRealtimeReadModelInvalidation(runtimeScopeStorageId(scope), {
      actorUserId: userId,
      models: ["notifications"],
      reason: "notification.changed",
      target: { id: "all", type: "notification" },
    });
  }
  return rows.length;
}
