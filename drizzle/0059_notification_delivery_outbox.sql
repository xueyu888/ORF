CREATE TABLE IF NOT EXISTS "notification_deliveries" (
  "id" text PRIMARY KEY NOT NULL,
  "event_id" text NOT NULL REFERENCES "notification_events"("id") ON DELETE cascade,
  "recipient_user_id" uuid REFERENCES "users"("id") ON DELETE cascade,
  "channel" text DEFAULT 'chat' NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "destination_id" text,
  "message_id" text REFERENCES "chat_messages"("id") ON DELETE set null,
  "attempts" integer DEFAULT 0 NOT NULL,
  "last_error" text,
  "next_attempt_at" timestamp with time zone,
  "delivered_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "notification_deliveries_channel_check" CHECK ("channel" IN ('chat')),
  CONSTRAINT "notification_deliveries_status_check" CHECK ("status" IN ('pending', 'delivered', 'failed'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_deliveries_event_channel_idx" ON "notification_deliveries" ("event_id", "channel");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_deliveries_retry_idx" ON "notification_deliveries" ("channel", "status", "next_attempt_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notification_deliveries_team_chat_unique"
  ON "notification_deliveries" ("event_id", "channel")
  WHERE "recipient_user_id" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notification_deliveries_user_chat_unique"
  ON "notification_deliveries" ("event_id", "recipient_user_id", "channel")
  WHERE "recipient_user_id" IS NOT NULL;
--> statement-breakpoint
WITH delivered_messages AS (
  SELECT DISTINCT ON (
    e."id",
    CASE WHEN c."system_kind" = 'personalNotification' THEN c."system_recipient_user_id"::text ELSE 'team' END
  )
    'ndel-' || md5(e."id" || '|' || CASE WHEN c."system_kind" = 'personalNotification' THEN c."system_recipient_user_id"::text ELSE 'team' END || '|chat') AS "delivery_id",
    e."id" AS "event_id",
    CASE WHEN c."system_kind" = 'personalNotification' THEN c."system_recipient_user_id" ELSE NULL END AS "recipient_user_id",
    c."id" AS "destination_id",
    m."id" AS "message_id",
    m."created_at"
  FROM "chat_messages" m
  INNER JOIN "chat_channels" c ON c."id" = m."channel_id"
  INNER JOIN "notification_events" e ON e."id" = m."system_metadata"->>'notificationEventId'
  WHERE m."source" = 'system'
    AND m."root_message_id" IS NULL
    AND m."deleted_at" IS NULL
    AND c."system_kind" IN ('teamAnnouncement', 'personalNotification')
    AND (c."system_kind" <> 'personalNotification' OR c."system_recipient_user_id" IS NOT NULL)
  ORDER BY
    e."id",
    CASE WHEN c."system_kind" = 'personalNotification' THEN c."system_recipient_user_id"::text ELSE 'team' END,
    m."created_at" ASC,
    m."id" ASC
)
INSERT INTO "notification_deliveries" (
  "id",
  "event_id",
  "recipient_user_id",
  "channel",
  "status",
  "destination_id",
  "message_id",
  "attempts",
  "delivered_at",
  "created_at",
  "updated_at"
)
SELECT
  "delivery_id",
  "event_id",
  "recipient_user_id",
  'chat',
  'delivered',
  "destination_id",
  "message_id",
  1,
  "created_at",
  "created_at",
  "created_at"
FROM delivered_messages
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "notification_deliveries" (
  "id",
  "event_id",
  "recipient_user_id",
  "channel",
  "status",
  "attempts",
  "created_at",
  "updated_at"
)
SELECT
  'ndel-' || md5(e."id" || '|' || r."recipient_user_id"::text || '|chat'),
  e."id",
  r."recipient_user_id",
  'chat',
  'pending',
  0,
  e."created_at",
  e."created_at"
FROM "notification_events" e
INNER JOIN "notification_receipts" r ON r."event_id" = e."id"
WHERE e."stream" = 'personalNotification'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "notification_deliveries" (
  "id",
  "event_id",
  "recipient_user_id",
  "channel",
  "status",
  "attempts",
  "created_at",
  "updated_at"
)
SELECT
  'ndel-' || md5(e."id" || '|team|chat'),
  e."id",
  NULL,
  'chat',
  'pending',
  0,
  e."created_at",
  e."created_at"
FROM "notification_events" e
WHERE e."stream" = 'teamAnnouncement'
ON CONFLICT DO NOTHING;
