import type { ChatChannel } from "../../src/types/orf";
import {
  findNotificationProjectionEventIdForMessage,
  listReadNotificationProjectionEventIds,
} from "../chat/notificationChatProjectionRepository";
import { publishChatChannelRealtime } from "../chat/chatChannelRealtime";
import { pool } from "../db/client";
import { publishRealtimeReadModelInvalidation } from "../realtime/realtimeEventBus";
import {
  advanceChatChannelReadState,
  getVisibleChatChannel,
  setChatChannelUnreadState,
  type ChatActor,
} from "../repositories/chatRepository";
import type { Outcome } from "../repositories/chatRepositoryModel";
import {
  markNotificationReceiptsReadByEventIds,
  markNotificationReceiptsUnreadByEventIds,
} from "../repositories/notificationRepository";

function publishChatReadChanged(input: { actorUserId: string; channelId: string; teamId: string }) {
  publishChatChannelRealtime({
    actorUserId: input.actorUserId,
    channelId: input.channelId,
    eventType: "read.changed",
    recipientUserIds: [input.actorUserId],
    teamId: input.teamId,
  });
}

function publishNotificationReadChanged(input: { actorUserId: string; teamId: string }) {
  publishRealtimeReadModelInvalidation(input.teamId, {
    actorUserId: input.actorUserId,
    models: ["notifications"],
    reason: "notification.changed",
  });
}

export async function markChatChannelRead(
  channelId: string,
  actor: ChatActor,
  options: { includeThreads?: boolean; messageId?: string | null } = {},
): Promise<Outcome<{ channel: ChatChannel }>> {
  const client = await pool.connect();
  let notificationReadCount = 0;
  let changed: { channelId: string; teamId: string; userId: string } | null = null;
  try {
    await client.query("BEGIN");
    const chatRead = await advanceChatChannelReadState(client, channelId, actor, options);
    if (chatRead.status !== "ok") {
      await client.query("ROLLBACK");
      return chatRead;
    }
    const eventIds = await listReadNotificationProjectionEventIds(client, {
      actor,
      channelId: chatRead.channelId,
      readThroughAt: chatRead.readThroughAt,
      teamId: chatRead.teamId,
    });
    notificationReadCount = await markNotificationReceiptsReadByEventIds(client, {
      eventIds,
      readAt: chatRead.readAt,
      teamId: chatRead.teamId,
      userId: chatRead.userId,
    });
    changed = { channelId: chatRead.channelId, teamId: chatRead.teamId, userId: chatRead.userId };
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  const updated = await getVisibleChatChannel(actor, channelId);
  if (!updated) return { status: "notFound" };
  if (changed) publishChatReadChanged({ actorUserId: changed.userId, channelId: changed.channelId, teamId: changed.teamId });
  if (changed && notificationReadCount > 0) publishNotificationReadChanged({ actorUserId: changed.userId, teamId: changed.teamId });
  return { status: "ok", channel: updated };
}

export async function setChatChannelUnread(
  input: { channelId: string; messageId?: string | null },
  actor: ChatActor,
): Promise<Outcome<{ channel: ChatChannel }>> {
  const client = await pool.connect();
  let notificationUnreadCount = 0;
  let changed: { channelId: string; teamId: string; userId: string } | null = null;
  try {
    await client.query("BEGIN");
    const chatUnread = await setChatChannelUnreadState(client, input, actor);
    if (chatUnread.status !== "ok") {
      await client.query("ROLLBACK");
      return chatUnread;
    }
    if (chatUnread.targetMessageId) {
      const eventId = await findNotificationProjectionEventIdForMessage(client, {
        actor,
        channelId: chatUnread.channelId,
        messageId: chatUnread.targetMessageId,
        teamId: chatUnread.teamId,
      });
      notificationUnreadCount = eventId
        ? await markNotificationReceiptsUnreadByEventIds(client, {
          eventIds: [eventId],
          teamId: chatUnread.teamId,
          userId: chatUnread.userId,
        })
        : 0;
      changed = { channelId: chatUnread.channelId, teamId: chatUnread.teamId, userId: chatUnread.userId };
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  const updated = await getVisibleChatChannel(actor, input.channelId);
  if (!updated) return { status: "notFound" };
  if (changed) publishChatReadChanged({ actorUserId: changed.userId, channelId: changed.channelId, teamId: changed.teamId });
  if (changed && notificationUnreadCount > 0) publishNotificationReadChanged({ actorUserId: changed.userId, teamId: changed.teamId });
  return { status: "ok", channel: updated };
}
