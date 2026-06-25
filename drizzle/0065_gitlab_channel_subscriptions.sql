CREATE TABLE IF NOT EXISTS "gitlab_orf_channel_subscriptions" (
  "id" text PRIMARY KEY,
  "team_id" text NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
  "chat_channel_id" text NOT NULL REFERENCES "chat_channels"("id") ON DELETE cascade,
  "gitlab_group_path" text NOT NULL,
  "gitlab_project_id" text,
  "gitlab_project_path" text,
  "gitlab_project_url" text DEFAULT '' NOT NULL,
  "event_types" jsonb DEFAULT '["push","tag_push","merge_request","issue","pipeline"]'::jsonb NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "gitlab_orf_channel_subscriptions_project_scope_check"
    CHECK (
      ("gitlab_project_id" IS NULL AND "gitlab_project_path" IS NULL)
      OR ("gitlab_project_id" IS NOT NULL AND "gitlab_project_path" IS NOT NULL)
    )
);
--> statement-breakpoint
INSERT INTO "gitlab_orf_channel_subscriptions" (
  "id",
  "team_id",
  "chat_channel_id",
  "gitlab_group_path",
  "gitlab_project_id",
  "gitlab_project_path",
  "gitlab_project_url",
  "event_types",
  "enabled",
  "created_by_user_id",
  "created_at",
  "updated_at"
)
SELECT
  'gitlab-subscription-' || md5("team_id" || ':' || "chat_channel_id" || ':' || "gitlab_project_id") AS "id",
  "team_id",
  "chat_channel_id",
  split_part(lower(trim(both '/' from "gitlab_project_path")), '/', 1) AS "gitlab_group_path",
  "gitlab_project_id",
  lower(trim(both '/' from "gitlab_project_path")) AS "gitlab_project_path",
  "gitlab_project_url",
  '["push","tag_push","merge_request","issue","pipeline"]'::jsonb AS "event_types",
  true AS "enabled",
  NULL AS "created_by_user_id",
  "created_at",
  "updated_at"
FROM "gitlab_orf_project_channels"
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gitlab_orf_channel_subscriptions_channel_idx"
  ON "gitlab_orf_channel_subscriptions" ("team_id", "chat_channel_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gitlab_orf_channel_subscriptions_project_idx"
  ON "gitlab_orf_channel_subscriptions" ("team_id", "gitlab_project_id")
  WHERE "gitlab_project_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gitlab_orf_channel_subscriptions_enabled_idx"
  ON "gitlab_orf_channel_subscriptions" ("team_id", "enabled");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "gitlab_orf_channel_subscriptions_group_unique"
  ON "gitlab_orf_channel_subscriptions" ("team_id", "chat_channel_id", "gitlab_group_path")
  WHERE "gitlab_project_id" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "gitlab_orf_channel_subscriptions_project_unique"
  ON "gitlab_orf_channel_subscriptions" ("team_id", "chat_channel_id", "gitlab_project_id")
  WHERE "gitlab_project_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "gitlab_orf_event_deliveries"
  DROP CONSTRAINT IF EXISTS "gitlab_orf_event_deliveries_project_fk";
--> statement-breakpoint
ALTER TABLE "gitlab_orf_event_deliveries"
  DROP CONSTRAINT IF EXISTS "gitlab_orf_event_deliveries_pk";
--> statement-breakpoint
ALTER TABLE "gitlab_orf_event_deliveries"
  ADD COLUMN IF NOT EXISTS "subscription_id" text,
  ADD COLUMN IF NOT EXISTS "gitlab_project_path" text DEFAULT '' NOT NULL,
  ADD COLUMN IF NOT EXISTS "gitlab_project_url" text DEFAULT '' NOT NULL;
--> statement-breakpoint
UPDATE "gitlab_orf_event_deliveries" delivery
SET
  "subscription_id" = subscription."id",
  "gitlab_project_path" = subscription."gitlab_project_path",
  "gitlab_project_url" = subscription."gitlab_project_url"
FROM "gitlab_orf_channel_subscriptions" subscription
WHERE delivery."team_id" = subscription."team_id"
  AND delivery."gitlab_project_id" = subscription."gitlab_project_id"
  AND delivery."chat_channel_id" = subscription."chat_channel_id";
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'gitlab_orf_event_deliveries_subscription_fk'
  ) THEN
    ALTER TABLE "gitlab_orf_event_deliveries"
      ADD CONSTRAINT "gitlab_orf_event_deliveries_subscription_fk"
      FOREIGN KEY ("subscription_id") REFERENCES "gitlab_orf_channel_subscriptions"("id") ON DELETE set null;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "gitlab_orf_event_deliveries_channel_event_unique"
  ON "gitlab_orf_event_deliveries" ("team_id", "chat_channel_id", "external_event_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gitlab_orf_event_deliveries_subscription_idx"
  ON "gitlab_orf_event_deliveries" ("subscription_id", "received_at");
--> statement-breakpoint
DROP TABLE IF EXISTS "gitlab_orf_project_channels";
