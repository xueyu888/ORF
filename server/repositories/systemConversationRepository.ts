import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type {
  AppNotification,
  CommentTargetType,
  SystemConversationId,
  SystemConversationMessage,
  SystemConversationSummary,
} from "../../src/types/orf";
import { SYSTEM_CONVERSATION_DEFINITIONS, SYSTEM_CONVERSATION_IDS } from "../../src/types/orf";
import { db } from "../db/client";
import { notificationEvents, notificationReceipts } from "../db/schema";
import { publishRealtimeReadModelInvalidation } from "../realtime/realtimeEventBus";
import { createComment } from "./orfRepository";
import { markNotificationRead, markNotificationUnread } from "./notificationRepository";
import type { RuntimeScope } from "./runtimeScope";
import { runtimeScopeStorageId } from "./runtimeScope";

export const systemConversationConfigs = SYSTEM_CONVERSATION_DEFINITIONS;

type NotificationEventRow = typeof notificationEvents.$inferSelect & {
  readAt?: string | null;
  recipientUserId: string;
};

type SystemConversationReplyActor = Parameters<typeof createComment>[1];
type SystemConversationReplyOutcome = Awaited<ReturnType<typeof createComment>> | { status: "notReplyable" };

function toSystemConversationMessage(row: NotificationEventRow): SystemConversationMessage {
  const notification: AppNotification = {
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
  return {
    ...notification,
    canReply: Boolean(notification.replyTargetType && notification.replyTargetId),
  };
}

async function unreadCountForConversation(conversationId: SystemConversationId, userId: string, scope: RuntimeScope) {
  const config = systemConversationConfigs[conversationId];
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notificationReceipts)
    .innerJoin(notificationEvents, eq(notificationReceipts.eventId, notificationEvents.id))
    .where(and(
      eq(notificationEvents.teamId, runtimeScopeStorageId(scope)),
      eq(notificationEvents.stream, config.stream),
      eq(notificationReceipts.recipientUserId, userId),
      isNull(notificationReceipts.readAt),
    ))
    .limit(1);
  return Number(row?.count ?? 0);
}

async function latestEventForConversation(conversationId: SystemConversationId, userId: string, scope: RuntimeScope) {
  const config = systemConversationConfigs[conversationId];
  if (config.stream === "personalNotification") {
    const [row] = await db
      .select({ body: notificationEvents.body, createdAt: notificationEvents.createdAt, title: notificationEvents.title })
      .from(notificationReceipts)
      .innerJoin(notificationEvents, eq(notificationReceipts.eventId, notificationEvents.id))
      .where(and(
        eq(notificationEvents.teamId, runtimeScopeStorageId(scope)),
        eq(notificationEvents.stream, config.stream),
        eq(notificationReceipts.recipientUserId, userId),
      ))
      .orderBy(desc(notificationEvents.createdAt))
      .limit(1);
    return row ?? null;
  }

  const [row] = await db
    .select({ body: notificationEvents.body, createdAt: notificationEvents.createdAt, title: notificationEvents.title })
    .from(notificationEvents)
    .where(and(
      eq(notificationEvents.teamId, runtimeScopeStorageId(scope)),
      eq(notificationEvents.stream, config.stream),
    ))
    .orderBy(desc(notificationEvents.createdAt))
    .limit(1);
  return row ?? null;
}

export async function listSystemConversationSummaries(userId: string, scope: RuntimeScope): Promise<SystemConversationSummary[]> {
  return Promise.all(SYSTEM_CONVERSATION_IDS.map(async (conversationId) => {
    const config = systemConversationConfigs[conversationId];
    const [unreadCount, latest] = await Promise.all([
      unreadCountForConversation(conversationId, userId, scope),
      latestEventForConversation(conversationId, userId, scope),
    ]);
    return {
      ...config,
      latestMessageAt: latest?.createdAt ?? null,
      latestMessagePreview: latest ? `${latest.title}：${latest.body}` : null,
      unreadCount,
    };
  }));
}

export async function listSystemConversationMessages(
  conversationId: SystemConversationId,
  userId: string,
  scope: RuntimeScope,
  limit = 100,
): Promise<SystemConversationMessage[]> {
  const config = systemConversationConfigs[conversationId];
  const safeLimit = Math.max(1, Math.min(200, limit));
  if (config.stream === "personalNotification") {
    const rows = await db
      .select({
        actorName: notificationEvents.actorName,
        actorUserId: notificationEvents.actorUserId,
        body: notificationEvents.body,
        createdAt: notificationEvents.createdAt,
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
      .where(and(
        eq(notificationEvents.teamId, runtimeScopeStorageId(scope)),
        eq(notificationEvents.stream, config.stream),
        eq(notificationReceipts.recipientUserId, userId),
      ))
      .orderBy(desc(notificationEvents.createdAt))
      .limit(safeLimit);
    return rows.map(toSystemConversationMessage).reverse();
  }

  const rows = await db
    .select({
      actorName: notificationEvents.actorName,
      actorUserId: notificationEvents.actorUserId,
      body: notificationEvents.body,
      createdAt: notificationEvents.createdAt,
      id: notificationEvents.id,
      kind: notificationEvents.kind,
      metadata: notificationEvents.metadata,
      readAt: notificationReceipts.readAt,
      receiptRecipientUserId: notificationReceipts.recipientUserId,
      replyTargetId: notificationEvents.replyTargetId,
      replyTargetType: notificationEvents.replyTargetType,
      stream: notificationEvents.stream,
      targetHref: notificationEvents.targetHref,
      targetId: notificationEvents.targetId,
      targetType: notificationEvents.targetType,
      teamId: notificationEvents.teamId,
      title: notificationEvents.title,
    })
    .from(notificationEvents)
    .leftJoin(
      notificationReceipts,
      and(eq(notificationReceipts.eventId, notificationEvents.id), eq(notificationReceipts.recipientUserId, userId)),
    )
    .where(and(
      eq(notificationEvents.teamId, runtimeScopeStorageId(scope)),
      eq(notificationEvents.stream, config.stream),
    ))
    .orderBy(desc(notificationEvents.createdAt))
    .limit(safeLimit);
  return rows.map((row) => toSystemConversationMessage({
    ...row,
    readAt: row.receiptRecipientUserId ? row.readAt : row.createdAt,
    recipientUserId: userId,
  })).reverse();
}

export async function getSystemConversationMessage(
  conversationId: SystemConversationId,
  notificationId: string,
  userId: string,
  scope: RuntimeScope,
): Promise<SystemConversationMessage | null> {
  const config = systemConversationConfigs[conversationId];
  if (config.stream === "personalNotification") {
    const [row] = await db
      .select({
        actorName: notificationEvents.actorName,
        actorUserId: notificationEvents.actorUserId,
        body: notificationEvents.body,
        createdAt: notificationEvents.createdAt,
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
      .where(and(
        eq(notificationEvents.id, notificationId),
        eq(notificationEvents.teamId, runtimeScopeStorageId(scope)),
        eq(notificationEvents.stream, config.stream),
        eq(notificationReceipts.recipientUserId, userId),
      ))
      .limit(1);
    return row ? toSystemConversationMessage(row) : null;
  }

  const [row] = await db
    .select({
      actorName: notificationEvents.actorName,
      actorUserId: notificationEvents.actorUserId,
      body: notificationEvents.body,
      createdAt: notificationEvents.createdAt,
      id: notificationEvents.id,
      kind: notificationEvents.kind,
      metadata: notificationEvents.metadata,
      readAt: notificationReceipts.readAt,
      receiptRecipientUserId: notificationReceipts.recipientUserId,
      replyTargetId: notificationEvents.replyTargetId,
      replyTargetType: notificationEvents.replyTargetType,
      stream: notificationEvents.stream,
      targetHref: notificationEvents.targetHref,
      targetId: notificationEvents.targetId,
      targetType: notificationEvents.targetType,
      teamId: notificationEvents.teamId,
      title: notificationEvents.title,
    })
    .from(notificationEvents)
    .leftJoin(
      notificationReceipts,
      and(eq(notificationReceipts.eventId, notificationEvents.id), eq(notificationReceipts.recipientUserId, userId)),
    )
    .where(and(
      eq(notificationEvents.id, notificationId),
      eq(notificationEvents.teamId, runtimeScopeStorageId(scope)),
      eq(notificationEvents.stream, config.stream),
    ))
    .limit(1);
  return row
    ? toSystemConversationMessage({
      ...row,
      readAt: row.receiptRecipientUserId ? row.readAt : row.createdAt,
      recipientUserId: userId,
    })
    : null;
}

export async function markSystemConversationMessageRead(
  conversationId: SystemConversationId,
  notificationId: string,
  userId: string,
  scope: RuntimeScope,
) {
  const message = await getSystemConversationMessage(conversationId, notificationId, userId, scope);
  if (!message) {
    return null;
  }
  return markNotificationRead(notificationId, userId, scope);
}

export async function markSystemConversationMessageUnread(
  conversationId: SystemConversationId,
  notificationId: string,
  userId: string,
  scope: RuntimeScope,
) {
  const message = await getSystemConversationMessage(conversationId, notificationId, userId, scope);
  if (!message) {
    return null;
  }
  return markNotificationUnread(notificationId, userId, scope);
}

export async function markSystemConversationRead(conversationId: SystemConversationId, userId: string, scope: RuntimeScope) {
  const config = systemConversationConfigs[conversationId];
  const rows = await db
    .select({ eventId: notificationReceipts.eventId })
    .from(notificationReceipts)
    .innerJoin(notificationEvents, eq(notificationReceipts.eventId, notificationEvents.id))
    .where(and(
      eq(notificationEvents.teamId, runtimeScopeStorageId(scope)),
      eq(notificationEvents.stream, config.stream),
      eq(notificationReceipts.recipientUserId, userId),
      isNull(notificationReceipts.readAt),
    ));
  if (rows.length === 0) {
    return 0;
  }

  const now = new Date().toISOString();
  const eventIds = rows.map((row) => row.eventId);
  const updated = await db
    .update(notificationReceipts)
    .set({ readAt: now })
    .where(and(eq(notificationReceipts.recipientUserId, userId), inArray(notificationReceipts.eventId, eventIds)))
    .returning({ eventId: notificationReceipts.eventId });
  if (updated.length > 0) {
    publishRealtimeReadModelInvalidation(runtimeScopeStorageId(scope), {
      actorUserId: userId,
      models: ["notifications"],
      reason: "notification.changed",
      target: { id: conversationId, type: "notification" },
    });
  }
  return updated.length;
}

function replyParentMessageIdForNotification(message: SystemConversationMessage) {
  const metadataMessageId = message.metadata.commentMessageId?.trim();
  if (metadataMessageId) {
    return metadataMessageId;
  }
  const targetId = message.targetId.trim();
  // Legacy comment notifications may store a message id as targetId; thread ids are not valid reply parents.
  return message.targetType === "comment" && targetId.startsWith("cmsg-") ? targetId : null;
}

export async function replyToSystemConversationMessage(input: {
  actor: SystemConversationReplyActor;
  body: string;
  conversationId: SystemConversationId;
  notificationId: string;
}): Promise<SystemConversationReplyOutcome> {
  if (!input.actor.scope) {
    return { status: "notFound" };
  }
  const message = await getSystemConversationMessage(
    input.conversationId,
    input.notificationId,
    input.actor.id,
    input.actor.scope,
  );
  if (!message) {
    return { status: "notFound" };
  }

  const replyTargetType = message.replyTargetType as CommentTargetType | null | undefined;
  const replyTargetId = message.replyTargetId?.trim();
  if (!replyTargetType || !replyTargetId) {
    return { status: "notReplyable" };
  }

  const parentMessageId = replyParentMessageIdForNotification(message);
  const outcome = await createComment({
    body: input.body,
    parentMessageId: parentMessageId ?? undefined,
    replyToMessageId: parentMessageId ?? undefined,
    targetId: replyTargetId,
    targetTitle: message.metadata.targetTitle || message.title,
    targetType: replyTargetType,
  }, input.actor);
  if (outcome.status === "ok") {
    await markNotificationRead(input.notificationId, input.actor.id, input.actor.scope);
  }
  return outcome;
}
