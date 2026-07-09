ALTER TABLE "notification_deliveries"
  ADD COLUMN IF NOT EXISTS "destination_id" text;
--> statement-breakpoint
DROP INDEX IF EXISTS "notification_deliveries_team_chat_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notification_deliveries_team_chat_unique"
  ON "notification_deliveries" ("event_id", "channel")
  WHERE "recipient_user_id" IS NULL AND "destination_id" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notification_deliveries_destination_chat_unique"
  ON "notification_deliveries" ("event_id", "channel", "destination_id")
  WHERE "recipient_user_id" IS NULL AND "destination_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_deliveries_destination_retry_idx"
  ON "notification_deliveries" ("channel", "destination_id", "status", "next_attempt_at");
