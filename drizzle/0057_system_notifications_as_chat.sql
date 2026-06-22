ALTER TABLE "chat_channels" ADD COLUMN IF NOT EXISTS "system_kind" text;
--> statement-breakpoint
ALTER TABLE "chat_channels" ADD COLUMN IF NOT EXISTS "system_recipient_user_id" uuid REFERENCES "users"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'user' NOT NULL;
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "system_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "chat_channels_team_system_announcement_unique"
  ON "chat_channels" ("team_id", "system_kind")
  WHERE "system_kind" = 'teamAnnouncement';
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "chat_channels_team_system_personal_unique"
  ON "chat_channels" ("team_id", "system_kind", "system_recipient_user_id")
  WHERE "system_kind" = 'personalNotification';
--> statement-breakpoint
WITH event_teams AS (
  SELECT DISTINCT "team_id"
  FROM "notification_events"
),
system_bots AS (
  SELECT
    "team_id",
    (
      substr(md5("team_id" || ':orf-system-bot'), 1, 8) || '-' ||
      substr(md5("team_id" || ':orf-system-bot'), 9, 4) || '-' ||
      substr(md5("team_id" || ':orf-system-bot'), 13, 4) || '-' ||
      substr(md5("team_id" || ':orf-system-bot'), 17, 4) || '-' ||
      substr(md5("team_id" || ':orf-system-bot'), 21, 12)
    )::uuid AS "bot_user_id"
  FROM event_teams
)
INSERT INTO "users" ("id", "name", "email", "status", "created_at")
SELECT
  "bot_user_id",
  'ORF 系统通知',
  'orf-system+' || substr(md5("team_id"), 1, 12) || '@orf.local',
  'active',
  CURRENT_DATE
FROM system_bots
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
WITH event_teams AS (
  SELECT DISTINCT "team_id"
  FROM "notification_events"
),
system_bots AS (
  SELECT
    "team_id",
    (
      substr(md5("team_id" || ':orf-system-bot'), 1, 8) || '-' ||
      substr(md5("team_id" || ':orf-system-bot'), 9, 4) || '-' ||
      substr(md5("team_id" || ':orf-system-bot'), 13, 4) || '-' ||
      substr(md5("team_id" || ':orf-system-bot'), 17, 4) || '-' ||
      substr(md5("team_id" || ':orf-system-bot'), 21, 12)
    )::uuid AS "bot_user_id"
  FROM event_teams
)
INSERT INTO "team_members" ("team_id", "user_id", "role")
SELECT "team_id", "bot_user_id", 'member'
FROM system_bots
ON CONFLICT ("team_id", "user_id") DO NOTHING;
--> statement-breakpoint
WITH event_teams AS (
  SELECT DISTINCT "team_id"
  FROM "notification_events"
),
system_bots AS (
  SELECT
    "team_id",
    (
      substr(md5("team_id" || ':orf-system-bot'), 1, 8) || '-' ||
      substr(md5("team_id" || ':orf-system-bot'), 9, 4) || '-' ||
      substr(md5("team_id" || ':orf-system-bot'), 13, 4) || '-' ||
      substr(md5("team_id" || ':orf-system-bot'), 17, 4) || '-' ||
      substr(md5("team_id" || ':orf-system-bot'), 21, 12)
    )::uuid AS "bot_user_id"
  FROM event_teams
)
INSERT INTO "chat_channels" (
  "id",
  "team_id",
  "type",
  "name",
  "system_kind",
  "system_recipient_user_id",
  "display_name",
  "purpose",
  "header",
  "created_by",
  "created_at",
  "updated_at"
)
SELECT
  'chat-system-announcements-' || md5("team_id"),
  "team_id",
  'public',
  'orf-system-announcements',
  'teamAnnouncement',
  NULL,
  '系统公告',
  '全体可见的系统公告和公共业务事件',
  '系统事件以普通聊天消息进入这个频道。',
  "bot_user_id",
  COALESCE((SELECT min("created_at") FROM "notification_events" e WHERE e."team_id" = system_bots."team_id"), now()),
  COALESCE((SELECT max("created_at") FROM "notification_events" e WHERE e."team_id" = system_bots."team_id"), now())
FROM system_bots
ON CONFLICT ("team_id", "name") DO UPDATE SET
  "system_kind" = 'teamAnnouncement',
  "display_name" = EXCLUDED."display_name",
  "purpose" = EXCLUDED."purpose",
  "header" = EXCLUDED."header",
  "updated_at" = GREATEST("chat_channels"."updated_at", EXCLUDED."updated_at");
--> statement-breakpoint
WITH personal_recipients AS (
  SELECT DISTINCT e."team_id", r."recipient_user_id"
  FROM "notification_events" e
  INNER JOIN "notification_receipts" r ON r."event_id" = e."id"
  WHERE e."stream" = 'personalNotification'
),
system_bots AS (
  SELECT
    "team_id",
    (
      substr(md5("team_id" || ':orf-system-bot'), 1, 8) || '-' ||
      substr(md5("team_id" || ':orf-system-bot'), 9, 4) || '-' ||
      substr(md5("team_id" || ':orf-system-bot'), 13, 4) || '-' ||
      substr(md5("team_id" || ':orf-system-bot'), 17, 4) || '-' ||
      substr(md5("team_id" || ':orf-system-bot'), 21, 12)
    )::uuid AS "bot_user_id"
  FROM (SELECT DISTINCT "team_id" FROM personal_recipients) teams
)
INSERT INTO "chat_channels" (
  "id",
  "team_id",
  "type",
  "name",
  "system_kind",
  "system_recipient_user_id",
  "display_name",
  "purpose",
  "header",
  "created_by",
  "created_at",
  "updated_at"
)
SELECT
  'chat-system-personal-' || md5(p."team_id" || ':' || p."recipient_user_id"::text),
  p."team_id",
  'direct',
  'dm-' || substr(md5(least(b."bot_user_id"::text, p."recipient_user_id"::text) || ':' || greatest(b."bot_user_id"::text, p."recipient_user_id"::text)), 1, 24),
  'personalNotification',
  p."recipient_user_id",
  '我的系统通知',
  '只投递给你的系统通知和业务提醒',
  '系统事件以普通聊天消息进入这个私聊。',
  b."bot_user_id",
  COALESCE((SELECT min(e."created_at") FROM "notification_events" e INNER JOIN "notification_receipts" r ON r."event_id" = e."id" WHERE e."team_id" = p."team_id" AND r."recipient_user_id" = p."recipient_user_id"), now()),
  COALESCE((SELECT max(e."created_at") FROM "notification_events" e INNER JOIN "notification_receipts" r ON r."event_id" = e."id" WHERE e."team_id" = p."team_id" AND r."recipient_user_id" = p."recipient_user_id"), now())
FROM personal_recipients p
INNER JOIN system_bots b ON b."team_id" = p."team_id"
ON CONFLICT ("team_id", "name") DO UPDATE SET
  "system_kind" = 'personalNotification',
  "system_recipient_user_id" = EXCLUDED."system_recipient_user_id",
  "display_name" = EXCLUDED."display_name",
  "purpose" = EXCLUDED."purpose",
  "header" = EXCLUDED."header",
  "updated_at" = GREATEST("chat_channels"."updated_at", EXCLUDED."updated_at");
--> statement-breakpoint
INSERT INTO "chat_channel_members" ("channel_id", "user_id", "role", "favorite", "muted", "manually_unread", "joined_at")
SELECT c."id", u."id", 'member', false, false, false, COALESCE(c."created_at", now())
FROM "chat_channels" c
INNER JOIN "team_members" tm ON tm."team_id" = c."team_id"
INNER JOIN "users" u ON u."id" = tm."user_id" AND COALESCE(u."status", 'active') = 'active'
WHERE c."system_kind" = 'teamAnnouncement'
ON CONFLICT ("channel_id", "user_id") DO NOTHING;
--> statement-breakpoint
WITH personal_channels AS (
  SELECT c."id" AS "channel_id", c."team_id", c."created_by" AS "bot_user_id", c."system_recipient_user_id" AS "recipient_user_id", c."created_at"
  FROM "chat_channels" c
  WHERE c."system_kind" = 'personalNotification'
    AND c."system_recipient_user_id" IS NOT NULL
),
members AS (
  SELECT "channel_id", "team_id", "created_at", "bot_user_id" AS "user_id", true AS "is_bot"
  FROM personal_channels
  UNION ALL
  SELECT "channel_id", "team_id", "created_at", "recipient_user_id" AS "user_id", false AS "is_bot"
  FROM personal_channels
)
INSERT INTO "chat_channel_members" ("channel_id", "user_id", "role", "favorite", "muted", "manually_unread", "joined_at")
SELECT m."channel_id", m."user_id", CASE WHEN m."is_bot" THEN 'owner'::chat_member_role ELSE 'member'::chat_member_role END, false, false, false, COALESCE(m."created_at", now())
FROM members m
INNER JOIN "team_members" tm ON tm."team_id" = m."team_id" AND tm."user_id" = m."user_id"
INNER JOIN "users" u ON u."id" = m."user_id" AND COALESCE(u."status", 'active') = 'active'
ON CONFLICT ("channel_id", "user_id") DO NOTHING;
--> statement-breakpoint
WITH system_bots AS (
  SELECT
    "team_id",
    (
      substr(md5("team_id" || ':orf-system-bot'), 1, 8) || '-' ||
      substr(md5("team_id" || ':orf-system-bot'), 9, 4) || '-' ||
      substr(md5("team_id" || ':orf-system-bot'), 13, 4) || '-' ||
      substr(md5("team_id" || ':orf-system-bot'), 17, 4) || '-' ||
      substr(md5("team_id" || ':orf-system-bot'), 21, 12)
    )::uuid AS "bot_user_id"
  FROM (SELECT DISTINCT "team_id" FROM "notification_events") teams
),
announcement_channels AS (
  SELECT "id", "team_id"
  FROM "chat_channels"
  WHERE "system_kind" = 'teamAnnouncement'
)
INSERT INTO "chat_messages" (
  "id",
  "team_id",
  "channel_id",
  "author_user_id",
  "source",
  "system_metadata",
  "body",
  "root_message_id",
  "parent_message_id",
  "created_at",
  "updated_at"
)
SELECT
  'chat-system-msg-' || md5(e."id" || ':team'),
  e."team_id",
  c."id",
  b."bot_user_id",
  'system',
  jsonb_build_object(
    'actorName', e."actor_name",
    'actorUserId', e."actor_user_id",
    'kind', e."kind",
    'metadata', e."metadata",
    'notificationEventId', e."id",
    'recipientUserId', NULL,
    'replyTargetId', e."reply_target_id",
    'replyTargetType', e."reply_target_type",
    'stream', e."stream",
    'targetHref', e."target_href",
    'targetId', e."target_id",
    'targetTitle', COALESCE(e."metadata"->>'targetTitle', e."title"),
    'targetType', e."target_type",
    'title', e."title"
  ),
  (
    CASE WHEN trim(e."body") = '' THEN '**' || e."title" || '**' ELSE '**' || e."title" || E'**\n\n' || e."body" END
    || CASE WHEN trim(e."target_href") = '' THEN '' ELSE E'\n\n[打开目标](' || e."target_href" || ')' END
  ),
  NULL,
  NULL,
  e."created_at",
  e."created_at"
FROM "notification_events" e
INNER JOIN announcement_channels c ON c."team_id" = e."team_id"
INNER JOIN system_bots b ON b."team_id" = e."team_id"
WHERE e."stream" = 'teamAnnouncement'
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
WITH system_bots AS (
  SELECT
    "team_id",
    (
      substr(md5("team_id" || ':orf-system-bot'), 1, 8) || '-' ||
      substr(md5("team_id" || ':orf-system-bot'), 9, 4) || '-' ||
      substr(md5("team_id" || ':orf-system-bot'), 13, 4) || '-' ||
      substr(md5("team_id" || ':orf-system-bot'), 17, 4) || '-' ||
      substr(md5("team_id" || ':orf-system-bot'), 21, 12)
    )::uuid AS "bot_user_id"
  FROM (SELECT DISTINCT "team_id" FROM "notification_events") teams
),
personal_channels AS (
  SELECT "id", "team_id", "system_recipient_user_id"
  FROM "chat_channels"
  WHERE "system_kind" = 'personalNotification'
)
INSERT INTO "chat_messages" (
  "id",
  "team_id",
  "channel_id",
  "author_user_id",
  "source",
  "system_metadata",
  "body",
  "root_message_id",
  "parent_message_id",
  "created_at",
  "updated_at"
)
SELECT
  'chat-system-msg-' || md5(e."id" || ':' || r."recipient_user_id"::text),
  e."team_id",
  c."id",
  b."bot_user_id",
  'system',
  jsonb_build_object(
    'actorName', e."actor_name",
    'actorUserId', e."actor_user_id",
    'kind', e."kind",
    'metadata', e."metadata",
    'notificationEventId', e."id",
    'recipientUserId', r."recipient_user_id",
    'replyTargetId', e."reply_target_id",
    'replyTargetType', e."reply_target_type",
    'stream', e."stream",
    'targetHref', e."target_href",
    'targetId', e."target_id",
    'targetTitle', COALESCE(e."metadata"->>'targetTitle', e."title"),
    'targetType', e."target_type",
    'title', e."title"
  ),
  (
    CASE WHEN trim(e."body") = '' THEN '**' || e."title" || '**' ELSE '**' || e."title" || E'**\n\n' || e."body" END
    || CASE WHEN trim(e."target_href") = '' THEN '' ELSE E'\n\n[打开目标](' || e."target_href" || ')' END
  ),
  NULL,
  NULL,
  e."created_at",
  e."created_at"
FROM "notification_events" e
INNER JOIN "notification_receipts" r ON r."event_id" = e."id"
INNER JOIN personal_channels c ON c."team_id" = e."team_id" AND c."system_recipient_user_id" = r."recipient_user_id"
INNER JOIN system_bots b ON b."team_id" = e."team_id"
WHERE e."stream" = 'personalNotification'
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
WITH latest AS (
  SELECT "channel_id", max("created_at") AS "latest_at"
  FROM "chat_messages"
  WHERE "source" = 'system'
  GROUP BY "channel_id"
)
UPDATE "chat_channels" c
SET "updated_at" = GREATEST(c."updated_at", latest."latest_at")
FROM latest
WHERE c."id" = latest."channel_id";
--> statement-breakpoint
WITH personal_state AS (
  SELECT
    c."id" AS "channel_id",
    r."recipient_user_id",
    min(e."created_at") FILTER (WHERE r."read_at" IS NULL) AS "earliest_unread_at",
    max(e."created_at") AS "latest_at"
  FROM "notification_events" e
  INNER JOIN "notification_receipts" r ON r."event_id" = e."id"
  INNER JOIN "chat_channels" c ON c."team_id" = e."team_id"
    AND c."system_kind" = 'personalNotification'
    AND c."system_recipient_user_id" = r."recipient_user_id"
  WHERE e."stream" = 'personalNotification'
  GROUP BY c."id", r."recipient_user_id"
),
personal_boundary AS (
  SELECT
    ps."channel_id",
    ps."recipient_user_id",
    COALESCE(prev."created_at", CASE WHEN ps."earliest_unread_at" IS NULL THEN latest_msg."created_at" ELSE NULL END) AS "last_read_at",
    COALESCE(prev."id", CASE WHEN ps."earliest_unread_at" IS NULL THEN latest_msg."id" ELSE NULL END) AS "last_read_message_id"
  FROM personal_state ps
  LEFT JOIN LATERAL (
    SELECT "id", "created_at"
    FROM "chat_messages"
    WHERE "channel_id" = ps."channel_id"
      AND "root_message_id" IS NULL
      AND "created_at" < ps."earliest_unread_at"
    ORDER BY "created_at" DESC, "id" DESC
    LIMIT 1
  ) prev ON true
  LEFT JOIN LATERAL (
    SELECT "id", "created_at"
    FROM "chat_messages"
    WHERE "channel_id" = ps."channel_id"
      AND "root_message_id" IS NULL
    ORDER BY "created_at" DESC, "id" DESC
    LIMIT 1
  ) latest_msg ON true
)
UPDATE "chat_channel_members" cm
SET "last_read_at" = personal_boundary."last_read_at",
    "last_read_message_id" = personal_boundary."last_read_message_id",
    "manually_unread" = personal_boundary."last_read_at" IS NULL
FROM personal_boundary
WHERE cm."channel_id" = personal_boundary."channel_id"
  AND cm."user_id" = personal_boundary."recipient_user_id";
--> statement-breakpoint
WITH announcement_members AS (
  SELECT c."id" AS "channel_id", c."team_id", cm."user_id"
  FROM "chat_channels" c
  INNER JOIN "chat_channel_members" cm ON cm."channel_id" = c."id"
  WHERE c."system_kind" = 'teamAnnouncement'
),
announcement_state AS (
  SELECT
    am."channel_id",
    am."user_id",
    min(e."created_at") FILTER (WHERE r."event_id" IS NOT NULL AND r."read_at" IS NULL) AS "earliest_unread_at"
  FROM announcement_members am
  INNER JOIN "notification_events" e ON e."team_id" = am."team_id" AND e."stream" = 'teamAnnouncement'
  LEFT JOIN "notification_receipts" r ON r."event_id" = e."id" AND r."recipient_user_id" = am."user_id"
  GROUP BY am."channel_id", am."user_id"
),
announcement_boundary AS (
  SELECT
    st."channel_id",
    st."user_id",
    COALESCE(prev."created_at", CASE WHEN st."earliest_unread_at" IS NULL THEN latest_msg."created_at" ELSE NULL END) AS "last_read_at",
    COALESCE(prev."id", CASE WHEN st."earliest_unread_at" IS NULL THEN latest_msg."id" ELSE NULL END) AS "last_read_message_id"
  FROM announcement_state st
  LEFT JOIN LATERAL (
    SELECT "id", "created_at"
    FROM "chat_messages"
    WHERE "channel_id" = st."channel_id"
      AND "root_message_id" IS NULL
      AND "created_at" < st."earliest_unread_at"
    ORDER BY "created_at" DESC, "id" DESC
    LIMIT 1
  ) prev ON true
  LEFT JOIN LATERAL (
    SELECT "id", "created_at"
    FROM "chat_messages"
    WHERE "channel_id" = st."channel_id"
      AND "root_message_id" IS NULL
    ORDER BY "created_at" DESC, "id" DESC
    LIMIT 1
  ) latest_msg ON true
)
UPDATE "chat_channel_members" cm
SET "last_read_at" = announcement_boundary."last_read_at",
    "last_read_message_id" = announcement_boundary."last_read_message_id",
    "manually_unread" = announcement_boundary."last_read_at" IS NULL
FROM announcement_boundary
WHERE cm."channel_id" = announcement_boundary."channel_id"
  AND cm."user_id" = announcement_boundary."user_id";
