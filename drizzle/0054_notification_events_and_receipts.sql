DO $$ BEGIN
  CREATE TYPE "notification_stream" AS ENUM ('personalNotification', 'teamAnnouncement');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_events" (
  "id" text PRIMARY KEY NOT NULL,
  "team_id" text NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
  "stream" "notification_stream" NOT NULL,
  "actor_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "actor_name" text DEFAULT '' NOT NULL,
  "kind" text NOT NULL,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "target_type" text NOT NULL,
  "target_id" text NOT NULL,
  "target_href" text NOT NULL,
  "reply_target_type" "comment_target_type",
  "reply_target_id" text,
  "created_at" timestamp with time zone NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_events_stream_created_at_idx" ON "notification_events" ("team_id", "stream", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_events_target_idx" ON "notification_events" ("team_id", "target_type", "target_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_receipts" (
  "event_id" text NOT NULL REFERENCES "notification_events"("id") ON DELETE cascade,
  "recipient_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "read_at" timestamp with time zone,
  "delivered_at" timestamp with time zone NOT NULL,
  CONSTRAINT "notification_receipts_event_user_pk" PRIMARY KEY ("event_id", "recipient_user_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_receipts_recipient_delivered_at_idx" ON "notification_receipts" ("recipient_user_id", "delivered_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_receipts_recipient_unread_idx" ON "notification_receipts" ("recipient_user_id", "read_at");
--> statement-breakpoint
WITH legacy_events AS (
  SELECT
    'nevt-legacy-' || md5(concat_ws('|',
      n.team_id,
      n.kind,
      coalesce(n.actor_user_id::text, ''),
      n.actor_name,
      n.title,
      n.body,
      n.target_type,
      n.target_id,
      n.target_href,
      n.created_at::text,
      n.metadata::text
    )) AS event_id,
    n.team_id,
    CASE
      WHEN n.kind = 'objective.published' THEN 'teamAnnouncement'::notification_stream
      ELSE 'personalNotification'::notification_stream
    END AS stream,
    n.actor_user_id,
    n.actor_name,
    n.kind,
    n.title,
    n.body,
    n.target_type,
    n.target_id,
    n.target_href,
    CASE
      WHEN n.target_type = 'feedback' THEN 'feedback'::comment_target_type
      WHEN n.target_type = 'objective' THEN 'objective'::comment_target_type
      WHEN n.target_type = 'comment' AND n.metadata->>'targetType' IN ('objective', 'result', 'task', 'subtask', 'feedback')
        THEN (n.metadata->>'targetType')::comment_target_type
      ELSE NULL
    END AS reply_target_type,
    CASE
      WHEN n.target_type IN ('feedback', 'objective') THEN n.target_id
      WHEN n.target_type = 'comment' THEN n.metadata->>'targetId'
      ELSE NULL
    END AS reply_target_id,
    n.created_at,
    n.metadata
  FROM "notifications" n
  WHERE n.target_type <> 'chat'
),
deduplicated_legacy_events AS (
  SELECT DISTINCT ON (event_id) *
  FROM legacy_events
  ORDER BY event_id, created_at
)
INSERT INTO "notification_events" (
  "id",
  "team_id",
  "stream",
  "actor_user_id",
  "actor_name",
  "kind",
  "title",
  "body",
  "target_type",
  "target_id",
  "target_href",
  "reply_target_type",
  "reply_target_id",
  "created_at",
  "metadata"
)
SELECT
  event_id,
  team_id,
  stream,
  actor_user_id,
  actor_name,
  kind,
  title,
  body,
  target_type,
  target_id,
  target_href,
  reply_target_type,
  reply_target_id,
  created_at,
  metadata
FROM deduplicated_legacy_events
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
WITH legacy_receipts AS (
  SELECT
    'nevt-legacy-' || md5(concat_ws('|',
      n.team_id,
      n.kind,
      coalesce(n.actor_user_id::text, ''),
      n.actor_name,
      n.title,
      n.body,
      n.target_type,
      n.target_id,
      n.target_href,
      n.created_at::text,
      n.metadata::text
    )) AS event_id,
    n.recipient_user_id,
    n.read_at,
    n.created_at AS delivered_at
  FROM "notifications" n
  WHERE n.target_type <> 'chat'
)
INSERT INTO "notification_receipts" ("event_id", "recipient_user_id", "read_at", "delivered_at")
SELECT event_id, recipient_user_id, read_at, delivered_at
FROM legacy_receipts
ON CONFLICT ("event_id", "recipient_user_id") DO UPDATE SET
  "read_at" = COALESCE("notification_receipts"."read_at", excluded."read_at"),
  "delivered_at" = LEAST("notification_receipts"."delivered_at", excluded."delivered_at");
