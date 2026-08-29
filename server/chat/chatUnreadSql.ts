import { visibleSystemNotificationMessageSql } from "../notifications/notificationIsolationPolicy";

type ChatUnreadMessageFactsSqlInput = {
  actorNamePatternParam: string;
  broadcastMentionParam: string;
  channelRelation: "displayable_channels" | "unread_channels";
  currentUserMentionParam: string;
  userIdParam: string;
  viewerEmailsParam: string;
};

function visibleMessageSql(messageSql: string, input: ChatUnreadMessageFactsSqlInput) {
  return visibleSystemNotificationMessageSql({
    actorNamePatternParam: input.actorNamePatternParam,
    messageSql,
    recipientUserIdParam: input.userIdParam,
    viewerEmailsParam: input.viewerEmailsParam,
  });
}

function visibleThreadRootSql(messageSql: string, input: ChatUnreadMessageFactsSqlInput) {
  return `(
    ${messageSql}.root_message_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM chat_messages visible_thread_root
      WHERE visible_thread_root.id = ${messageSql}.root_message_id
        AND visible_thread_root.team_id = ${messageSql}.team_id
        AND visible_thread_root.channel_id = ${messageSql}.channel_id
        AND visible_thread_root.root_message_id IS NULL
        AND visible_thread_root.deleted_at IS NULL
        AND ${visibleMessageSql("visible_thread_root", input)}
    )
  )`;
}

function notificationProjectionEventIdSql(messageSql: string) {
  return `NULLIF(${messageSql}.system_metadata->>'notificationEventId', '')`;
}

export function unreadSystemNotificationProjectionSql(messageSql: string, input: { userIdParam: string }) {
  const eventIdSql = notificationProjectionEventIdSql(messageSql);
  return `(
    ${messageSql}.source = 'system'
    AND ${eventIdSql} IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM notification_receipts projection_receipt
      INNER JOIN notification_events projection_event
        ON projection_event.id = projection_receipt.event_id
       AND projection_event.team_id = ${messageSql}.team_id
      WHERE projection_receipt.event_id = ${eventIdSql}
        AND projection_receipt.recipient_user_id = ${input.userIdParam}
        AND projection_receipt.read_at IS NULL
    )
  )`;
}

function unreadMainMessageSql(messageSql: string, input: ChatUnreadMessageFactsSqlInput) {
  const eventIdSql = notificationProjectionEventIdSql(messageSql);
  return `(
    ${unreadSystemNotificationProjectionSql(messageSql, input)}
    OR (
      ${eventIdSql} IS NULL
      AND (cm.last_read_at IS NULL OR ${messageSql}.created_at > cm.last_read_at)
    )
  )`;
}

export function chatUnreadMessageFactsSql(input: ChatUnreadMessageFactsSqlInput) {
  return `
    SELECT
      m.channel_id,
      m.id AS message_id,
      m.root_message_id,
      m.created_at,
      m.root_message_id IS NULL AS is_main,
      dc.type = 'direct' AND dc.system_kind IS NULL AS is_direct,
      m.body LIKE ${input.currentUserMentionParam} AS mentions_current_user,
      m.body ~* ${input.broadcastMentionParam} AS mentions_everyone,
      CASE
        WHEN dc.type = 'direct' AND dc.system_kind IS NULL THEN 1
        WHEN m.body LIKE ${input.currentUserMentionParam} THEN 2
        WHEN m.body ~* ${input.broadcastMentionParam} THEN 3
        WHEN dc.system_kind IS NOT NULL OR m.source = 'system' THEN 4
        ELSE 5
      END AS priority,
      CASE
        WHEN dc.type = 'direct' AND dc.system_kind IS NULL THEN 'direct'
        WHEN m.body LIKE ${input.currentUserMentionParam} THEN 'mention_me'
        WHEN m.body ~* ${input.broadcastMentionParam} THEN 'mention_all'
        WHEN dc.system_kind IS NOT NULL OR m.source = 'system' THEN 'system'
        ELSE 'normal'
      END AS reason
    FROM chat_messages m
    INNER JOIN chat_channel_members cm
      ON cm.channel_id = m.channel_id AND cm.user_id = ${input.userIdParam}
    INNER JOIN ${input.channelRelation} dc ON dc.id = m.channel_id
    LEFT JOIN chat_thread_follows f
      ON f.root_message_id = m.root_message_id AND f.user_id = ${input.userIdParam}
    WHERE m.author_user_id <> ${input.userIdParam}
      AND m.deleted_at IS NULL
      AND ${visibleMessageSql("m", input)}
      AND (
        (
          m.root_message_id IS NULL
          AND ${unreadMainMessageSql("m", input)}
        )
        OR (
          m.root_message_id IS NOT NULL
          AND (f.last_viewed_at IS NULL OR m.created_at > f.last_viewed_at)
          AND ${visibleThreadRootSql("m", input)}
          AND (
            f.following = true
            OR m.body LIKE ${input.currentUserMentionParam}
            OR m.body ~* ${input.broadcastMentionParam}
            OR (
              f.user_id IS NULL
              AND EXISTS (
                SELECT 1
                FROM chat_messages mention
                WHERE mention.root_message_id = m.root_message_id
                  AND mention.author_user_id <> ${input.userIdParam}
                  AND mention.deleted_at IS NULL
                  AND (
                    mention.body LIKE ${input.currentUserMentionParam}
                    OR mention.body ~* ${input.broadcastMentionParam}
                  )
                  AND ${visibleMessageSql("mention", input)}
              )
            )
          )
        )
      )
  `;
}
