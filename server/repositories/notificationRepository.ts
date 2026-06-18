import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type {
  AppNotification,
  CommentTargetType,
  NotificationKind,
  NotificationStream,
  NotificationTargetType,
} from "../../src/types/orf";
import { db } from "../db/client";
import { notificationEvents, notificationReceipts, teamMembers, users } from "../db/schema";
import { publishRealtimeNotification, publishRealtimeReadModelInvalidation } from "../realtime/realtimeEventBus";
import type { RuntimeScope } from "./runtimeScope";
import { runtimeScopeStorageId } from "./runtimeScope";

export type NotificationEventInput = {
  actorName: string;
  actorUserId?: string | null;
  body: string;
  kind: NotificationKind;
  metadata?: Record<string, string>;
  recipientUserIds: string[];
  replyTargetId?: string | null;
  replyTargetType?: CommentTargetType | null;
  stream: NotificationStream;
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

type NotificationProjectionRow = typeof notificationEvents.$inferSelect & {
  deliveredAt?: string | null;
  readAt?: string | null;
  recipientUserId: string;
};

function toNotification(row: NotificationProjectionRow): AppNotification {
  return {
    id: row.id,
    kind: row.kind,
    recipientUserId: row.recipientUserId,
    actorUserId: row.actorUserId,
    actorName: row.actorName,
    title: row.title,
    body: row.body,
    stream: row.stream,
    targetType: row.targetType,
    targetId: row.targetId,
    targetHref: row.targetHref,
    replyTargetType: row.replyTargetType,
    replyTargetId: row.replyTargetId,
    readAt: row.readAt ?? null,
    createdAt: row.createdAt,
    metadata: row.metadata ?? {},
  };
}

function notificationScope(userId: string, scope: RuntimeScope) {
  return and(
    eq(notificationEvents.teamId, runtimeScopeStorageId(scope)),
    eq(notificationReceipts.recipientUserId, userId),
  );
}

async function getScopedNotificationEvent(notificationId: string, scope: RuntimeScope) {
  const [event] = await db
    .select()
    .from(notificationEvents)
    .where(and(eq(notificationEvents.id, notificationId), eq(notificationEvents.teamId, runtimeScopeStorageId(scope))))
    .limit(1);
  return event ?? null;
}

async function upsertTeamAnnouncementReceipt(input: { notificationId: string; userId: string; deliveredAt: string; readAt: string | null }) {
  const [receipt] = await db
    .insert(notificationReceipts)
    .values({
      eventId: input.notificationId,
      recipientUserId: input.userId,
      deliveredAt: input.deliveredAt,
      readAt: input.readAt,
    })
    .onConflictDoUpdate({
      target: [notificationReceipts.eventId, notificationReceipts.recipientUserId],
      set: { readAt: input.readAt },
    })
    .returning();
  return receipt ?? null;
}

export async function createNotificationEvent(input: NotificationEventInput): Promise<AppNotification[]> {
  const createdAt = nowIso();
  const eventId = makeId("notification-event");
  const recipientUserIds = uniqueRecipients(input.recipientUserIds, input.actorUserId);
  if (input.stream === "personalNotification" && recipientUserIds.length === 0) {
    return [];
  }

  const [event] = await db.insert(notificationEvents).values({
    id: eventId,
    teamId: input.teamId,
    stream: input.stream,
    actorUserId: input.actorUserId?.trim() || null,
    actorName: input.actorName.trim(),
    kind: input.kind,
    title: input.title.trim(),
    body: input.body.trim(),
    targetType: input.targetType,
    targetId: input.targetId,
    targetHref: input.targetHref,
    replyTargetType: input.replyTargetType ?? null,
    replyTargetId: input.replyTargetId ?? null,
    createdAt,
    metadata: input.metadata ?? {},
  }).returning();

  if (recipientUserIds.length === 0) {
    publishRealtimeReadModelInvalidation(input.teamId, {
      actorUserId: input.actorUserId,
      models: ["notifications"],
      reason: "notification.changed",
      target: { id: eventId, type: "notification" },
    });
    return [];
  }

  const receipts = await db.insert(notificationReceipts).values(
    recipientUserIds.map((recipientUserId) => ({
      eventId,
      recipientUserId,
      readAt: null,
      deliveredAt: createdAt,
    })),
  ).returning();

  const created = receipts.map((receipt) => toNotification({
    ...event,
    deliveredAt: receipt.deliveredAt,
    readAt: receipt.readAt,
    recipientUserId: receipt.recipientUserId,
  }));
  for (const notification of created) {
    publishRealtimeNotification(input.teamId, notification);
  }
  publishRealtimeReadModelInvalidation(input.teamId, {
    actorUserId: input.actorUserId,
    models: ["notifications"],
    reason: "notification.changed",
    target: { id: eventId, type: "notification" },
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
    .select({
      actorName: notificationEvents.actorName,
      actorUserId: notificationEvents.actorUserId,
      body: notificationEvents.body,
      createdAt: notificationEvents.createdAt,
      deliveredAt: notificationReceipts.deliveredAt,
      id: notificationEvents.id,
      kind: notificationEvents.kind,
      metadata: notificationEvents.metadata,
      readAt: notificationReceipts.readAt,
      recipientUserId: notificationReceipts.recipientUserId,
      replyTargetId: notificationEvents.replyTargetId,
      replyTargetType: notificationEvents.replyTargetType,
      stream: notificationEvents.stream,
      targetHref: notificationEvents.targetHref,
      targetId: notificationEvents.targetId,
      targetType: notificationEvents.targetType,
      teamId: notificationEvents.teamId,
      title: notificationEvents.title,
    })
    .from(notificationReceipts)
    .innerJoin(notificationEvents, eq(notificationReceipts.eventId, notificationEvents.id))
    .where(notificationScope(userId, scope))
    .orderBy(desc(notificationEvents.createdAt))
    .limit(Math.max(1, Math.min(100, limit)));
  return rows.map(toNotification);
}

export async function getUnreadNotificationCount(userId: string, scope: RuntimeScope): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notificationReceipts)
    .innerJoin(notificationEvents, eq(notificationReceipts.eventId, notificationEvents.id))
    .where(and(notificationScope(userId, scope), isNull(notificationReceipts.readAt)))
    .limit(1);
  return Number(row?.count ?? 0);
}

export async function markNotificationRead(notificationId: string, userId: string, scope: RuntimeScope): Promise<AppNotification | null> {
  const event = await getScopedNotificationEvent(notificationId, scope);
  if (!event) {
    return null;
  }
  const readAt = nowIso();
  const [updatedReceipt] = event.stream === "teamAnnouncement"
    ? [await upsertTeamAnnouncementReceipt({ deliveredAt: event.createdAt, notificationId, readAt, userId })]
    : await db
      .update(notificationReceipts)
      .set({ readAt })
      .where(and(eq(notificationReceipts.eventId, notificationId), eq(notificationReceipts.recipientUserId, userId)))
      .returning();
  if (!updatedReceipt) {
    return null;
  }
  publishRealtimeReadModelInvalidation(runtimeScopeStorageId(scope), {
    actorUserId: userId,
    models: ["notifications"],
    reason: "notification.changed",
    target: { id: notificationId, type: "notification" },
  });
  return toNotification({
    ...event,
    deliveredAt: updatedReceipt.deliveredAt,
    readAt: updatedReceipt.readAt,
    recipientUserId: updatedReceipt.recipientUserId,
  });
}

export async function markNotificationUnread(notificationId: string, userId: string, scope: RuntimeScope): Promise<AppNotification | null> {
  const event = await getScopedNotificationEvent(notificationId, scope);
  if (!event) {
    return null;
  }
  const [updatedReceipt] = event.stream === "teamAnnouncement"
    ? [await upsertTeamAnnouncementReceipt({ deliveredAt: event.createdAt, notificationId, readAt: null, userId })]
    : await db
      .update(notificationReceipts)
      .set({ readAt: null })
      .where(and(eq(notificationReceipts.eventId, notificationId), eq(notificationReceipts.recipientUserId, userId)))
      .returning();
  if (!updatedReceipt) {
    return null;
  }
  publishRealtimeReadModelInvalidation(runtimeScopeStorageId(scope), {
    actorUserId: userId,
    models: ["notifications"],
    reason: "notification.changed",
    target: { id: notificationId, type: "notification" },
  });
  return toNotification({
    ...event,
    deliveredAt: updatedReceipt.deliveredAt,
    readAt: updatedReceipt.readAt,
    recipientUserId: updatedReceipt.recipientUserId,
  });
}

export async function markAllNotificationsRead(userId: string, scope: RuntimeScope): Promise<number> {
  const eventRows = await db
    .select({ id: notificationEvents.id })
    .from(notificationReceipts)
    .innerJoin(notificationEvents, eq(notificationReceipts.eventId, notificationEvents.id))
    .where(and(notificationScope(userId, scope), isNull(notificationReceipts.readAt)));
  if (eventRows.length === 0) {
    return 0;
  }

  const rows = await db
    .update(notificationReceipts)
    .set({ readAt: nowIso() })
    .where(and(eq(notificationReceipts.recipientUserId, userId), inArray(notificationReceipts.eventId, eventRows.map((row) => row.id))))
    .returning({ eventId: notificationReceipts.eventId });
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
