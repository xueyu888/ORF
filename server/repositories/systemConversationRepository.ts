import type {
  CommentTargetType,
  SystemConversationId,
  SystemConversationMessage,
  SystemConversationSummary,
} from "../../src/types/orf";
import { SYSTEM_CONVERSATION_DEFINITIONS, SYSTEM_CONVERSATION_IDS } from "../../src/types/orf";
import { createComment } from "./orfRepository";
import {
  getNotificationForUser,
  listNotificationsForUser,
  markAllNotificationsRead,
  markNotificationRead,
  markNotificationUnread,
} from "./notificationRepository";
import type { RuntimeScope } from "./runtimeScope";

export const systemConversationConfigs = SYSTEM_CONVERSATION_DEFINITIONS;

type SystemConversationReplyActor = Parameters<typeof createComment>[1];
type SystemConversationReplyOutcome = Awaited<ReturnType<typeof createComment>> | { status: "notReplyable" };

function toSystemConversationMessage(notification: Awaited<ReturnType<typeof getNotificationForUser>>): SystemConversationMessage | null {
  if (!notification) return null;
  return {
    ...notification,
    canReply: Boolean(notification.replyTargetType && notification.replyTargetId),
  };
}

export async function listSystemConversationSummaries(userId: string, scope: RuntimeScope): Promise<SystemConversationSummary[]> {
  const notifications = await listNotificationsForUser(userId, scope, 100);
  return SYSTEM_CONVERSATION_IDS.map((conversationId) => {
    const config = systemConversationConfigs[conversationId];
    const items = notifications.filter((notification) => notification.stream === config.stream);
    const latest = items[0] ?? null;
    return {
      ...config,
      latestMessageAt: latest?.createdAt ?? null,
      latestMessagePreview: latest ? `${latest.title}：${latest.body}` : null,
      unreadCount: items.filter((item) => !item.readAt).length,
    };
  });
}

export async function listSystemConversationMessages(
  conversationId: SystemConversationId,
  userId: string,
  scope: RuntimeScope,
  limit = 100,
): Promise<SystemConversationMessage[]> {
  const config = systemConversationConfigs[conversationId];
  const notifications = await listNotificationsForUser(userId, scope, Math.max(1, Math.min(200, limit)));
  return notifications
    .filter((notification) => notification.stream === config.stream)
    .map((notification) => ({
      ...notification,
      canReply: Boolean(notification.replyTargetType && notification.replyTargetId),
    }))
    .reverse();
}

export async function getSystemConversationMessage(
  conversationId: SystemConversationId,
  notificationId: string,
  userId: string,
  scope: RuntimeScope,
): Promise<SystemConversationMessage | null> {
  const config = systemConversationConfigs[conversationId];
  const notification = await getNotificationForUser(notificationId, userId, scope);
  return notification?.stream === config.stream ? toSystemConversationMessage(notification) : null;
}

export async function markSystemConversationMessageRead(
  conversationId: SystemConversationId,
  notificationId: string,
  userId: string,
  scope: RuntimeScope,
) {
  const message = await getSystemConversationMessage(conversationId, notificationId, userId, scope);
  if (!message) return null;
  return markNotificationRead(notificationId, userId, scope);
}

export async function markSystemConversationMessageUnread(
  conversationId: SystemConversationId,
  notificationId: string,
  userId: string,
  scope: RuntimeScope,
) {
  const message = await getSystemConversationMessage(conversationId, notificationId, userId, scope);
  if (!message) return null;
  return markNotificationUnread(notificationId, userId, scope);
}

export async function markSystemConversationRead(_conversationId: SystemConversationId, userId: string, scope: RuntimeScope) {
  return markAllNotificationsRead(userId, scope);
}

function replyParentMessageIdForNotification(message: SystemConversationMessage) {
  const metadataMessageId = message.metadata.commentMessageId?.trim();
  if (metadataMessageId) return metadataMessageId;
  const targetId = message.targetId.trim();
  return message.targetType === "comment" && targetId.startsWith("cmsg-") ? targetId : null;
}

export async function replyToSystemConversationMessage(input: {
  actor: SystemConversationReplyActor;
  body: string;
  conversationId: SystemConversationId;
  notificationId: string;
}): Promise<SystemConversationReplyOutcome> {
  if (!input.actor.scope) return { status: "notFound" };
  const message = await getSystemConversationMessage(
    input.conversationId,
    input.notificationId,
    input.actor.id,
    input.actor.scope,
  );
  if (!message) return { status: "notFound" };

  const replyTargetType = message.replyTargetType as CommentTargetType | null | undefined;
  const replyTargetId = message.replyTargetId?.trim();
  if (!replyTargetType || !replyTargetId) return { status: "notReplyable" };

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
