import type { ChatChannel, ChatMessage } from "../../src/types/orf";
import type { ChatRealtimeEventType } from "../../src/types/realtime";
import { chatNotificationPreviewText } from "../../src/domain/chatNotificationPresentation";
import { chatMessageTargetPath } from "../../src/domain/chatNavigation";
import { pool } from "../db/client";
import {
  E2E_NOTIFICATION_ACTOR_NAME_SQL_PATTERN,
  normalizedE2eNotificationViewerEmails,
  visibleSystemNotificationMessageSql,
} from "../notifications/notificationIsolationPolicy";
import { publishRealtimeChatEvent } from "../realtime/realtimeEventBus";

type RealtimeRecipient = { muted: boolean; user_id: string };
type MessageMutationRealtimeEventType = Extract<
  ChatRealtimeEventType,
  "message.updated" | "message.deleted" | "reaction.changed"
>;

export async function publishChatMessageCreatedRealtime(input: {
  channel: Pick<ChatChannel, "displayName" | "id" | "type">;
  message: Pick<ChatMessage, "attachments" | "authorName" | "authorUserId" | "body" | "createdAt" | "id" | "rootMessageId" | "system">;
  teamId: string;
}) {
  const visibilitySql = visibleSystemNotificationMessageSql({
    actorNamePatternParam: "$4",
    messageSql: "message",
    recipientUserIdParam: "members.user_id::text",
    viewerEmailsParam: "$5",
  });
  const { rows } = await pool.query<RealtimeRecipient>(
    `
      SELECT members.user_id, members.muted
      FROM chat_channel_members members
      INNER JOIN users recipients
        ON recipients.id = members.user_id
       AND COALESCE(recipients.status, 'active') = 'active'
      INNER JOIN chat_messages message
        ON message.id = $2
       AND message.channel_id = members.channel_id
       AND message.team_id = $1
      WHERE members.channel_id = $3
        AND ${visibilitySql}
    `,
    [input.teamId, input.message.id, input.channel.id, E2E_NOTIFICATION_ACTOR_NAME_SQL_PATTERN, normalizedE2eNotificationViewerEmails()],
  );
  const preview = chatNotificationPreviewText(input.message);
  const baseTitle = input.channel.type === "direct" ? input.message.authorName : input.channel.displayName || "聊天";
  const notification = {
    body: input.channel.type === "direct" ? preview : `${input.message.authorName}: ${preview}`,
    targetPath: chatMessageTargetPath({
      channelId: input.channel.id,
      messageId: input.message.id,
      threadRootMessageId: input.message.rootMessageId,
    }),
    title: input.message.rootMessageId ? `回复：${baseTitle}` : baseTitle,
  };
  for (const recipient of rows) {
    const mayNotify = !recipient.muted
      && recipient.user_id !== input.message.authorUserId
      && recipient.user_id !== input.message.system?.actorUserId;
    publishRealtimeChatEvent(input.teamId, [recipient.user_id], {
      actorUserId: input.message.authorUserId,
      channelId: input.channel.id,
      createdAt: input.message.createdAt,
      eventType: "message.created",
      id: `chat-message-created-${input.message.id}`,
      messageId: input.message.id,
      notification: mayNotify ? notification : undefined,
      rootMessageId: input.message.rootMessageId,
    });
  }
}

export function publishChatMessageMutationRealtime(input: {
  actorUserId: string;
  channelId: string;
  eventCreatedAt?: string;
  eventId?: string;
  eventType: MessageMutationRealtimeEventType;
  messageId: string;
  recipientUserIds: string[];
  rootMessageId?: string | null;
  teamId: string;
}) {
  for (const recipientUserId of new Set(input.recipientUserIds)) {
    publishRealtimeChatEvent(input.teamId, [recipientUserId], {
      actorUserId: input.actorUserId,
      channelId: input.channelId,
      createdAt: input.eventCreatedAt,
      eventType: input.eventType,
      id: input.eventId,
      messageId: input.messageId,
      rootMessageId: input.rootMessageId ?? null,
    });
  }
}
