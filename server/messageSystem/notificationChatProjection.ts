import {
  ensureNotificationChatProjectionActor,
  ensureNotificationChatProjectionChannel,
  findExistingNotificationChatProjectionMessage,
  sendNotificationChatProjectionMessage,
} from "../chat/notificationChatProjectionRepository";
import {
  buildNotificationSystemMetadata,
  formatNotificationChatBody,
  type NotificationMetadataInput,
} from "../notifications/notificationEventModel";
import {
  listNotificationChatDeliveryIdsForEvent,
  listPendingNotificationChatDeliveryIds,
  loadNotificationChatDelivery,
  markNotificationChatDeliveryDelivered,
  markNotificationChatDeliveryFailed,
  type NotificationChatDeliveryEvent,
} from "../repositories/notificationRepository";
import { iso, nowIso } from "../repositories/chatRepositoryModel";

function notificationRecipientReasons(value: readonly unknown[] | null | undefined) {
  return Array.from(new Set(
    (value ?? [])
      .filter((reason): reason is string => typeof reason === "string")
      .map((reason) => reason.trim())
      .filter(Boolean),
  ));
}

function metadataInputFromDelivery(row: NotificationChatDeliveryEvent): NotificationMetadataInput {
  return {
    actorName: row.actor_name,
    actorUserId: row.actor_user_id,
    attentionLevel: row.attention_level ?? "normal",
    body: row.body,
    deliveryClass: row.delivery_class ?? "ordinary",
    kind: row.kind,
    metadata: row.metadata ?? {},
    recipientReasons: notificationRecipientReasons(row.recipient_reasons),
    replyTargetId: row.reply_target_id,
    replyTargetType: row.reply_target_type,
    stream: row.stream,
    targetHref: row.target_href,
    targetId: row.target_id,
    targetType: row.target_type,
    title: row.title,
  };
}

async function deliverNotificationChatDelivery(deliveryId: string): Promise<"delivered" | "failed" | "skipped"> {
  const row = await loadNotificationChatDelivery(deliveryId);
  if (!row || row.delivery_status === "delivered") return "skipped";
  try {
    const existing = await findExistingNotificationChatProjectionMessage({
      destinationId: row.delivery_destination_id,
      eventId: row.event_id,
      recipientUserId: row.delivery_recipient_user_id,
      teamId: row.team_id,
    });
    if (existing) {
      await markNotificationChatDeliveryDelivered({
        channelId: existing.channel_id,
        deliveredAt: iso(existing.created_at) ?? nowIso(),
        deliveryId,
        messageId: existing.id,
      });
      return "delivered";
    }

    const actor = await ensureNotificationChatProjectionActor(row.team_id);
    const channelId = await ensureNotificationChatProjectionChannel({
      actor,
      destinationId: row.delivery_destination_id,
      recipientUserId: row.delivery_recipient_user_id,
      stream: row.stream,
      teamId: row.team_id,
    });
    if (!channelId) {
      throw new Error("Notification chat delivery has no active destination channel");
    }

    const metadataInput = metadataInputFromDelivery(row);
    const message = await sendNotificationChatProjectionMessage({
      actor,
      body: formatNotificationChatBody(metadataInput),
      channelId,
      createdAt: iso(row.event_created_at) ?? nowIso(),
      systemMetadata: buildNotificationSystemMetadata(metadataInput, row.event_id, row.delivery_recipient_user_id),
    });

    await markNotificationChatDeliveryDelivered({
      channelId,
      deliveredAt: message.createdAt,
      deliveryId,
      messageId: message.id,
    });
    return "delivered";
  } catch (error) {
    await markNotificationChatDeliveryFailed({ attempts: row.attempts, deliveryId, error }).catch(() => undefined);
    return "failed";
  }
}

export async function flushNotificationChatDeliveriesForEvent(eventId: string) {
  const deliveryIds = await listNotificationChatDeliveryIdsForEvent(eventId);
  for (const deliveryId of deliveryIds) {
    await deliverNotificationChatDelivery(deliveryId);
  }
}

export async function flushPendingNotificationChatDeliveries(limit = 50) {
  const deliveryIds = await listPendingNotificationChatDeliveryIds(limit);
  let delivered = 0;
  let failed = 0;
  for (const deliveryId of deliveryIds) {
    const result = await deliverNotificationChatDelivery(deliveryId);
    if (result === "delivered") delivered += 1;
    if (result === "failed") failed += 1;
  }
  return { attempted: deliveryIds.length, delivered, failed };
}
