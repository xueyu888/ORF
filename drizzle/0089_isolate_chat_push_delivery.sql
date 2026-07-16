CREATE TABLE "chat_legacy_realtime_deliveries" (
  "id" text PRIMARY KEY NOT NULL,
  "message_id" text NOT NULL,
  "team_id" text NOT NULL,
  "channel_id" text NOT NULL,
  "recipient_user_id" uuid NOT NULL,
  "status" text DEFAULT 'completed' NOT NULL,
  "final_reason" text DEFAULT 'legacy_realtime_retired' NOT NULL,
  "original_status" text NOT NULL,
  "original_outcome" text,
  "attempts" integer DEFAULT 0 NOT NULL,
  "target_count" integer DEFAULT 0 NOT NULL,
  "success_count" integer DEFAULT 0 NOT NULL,
  "failure_count" integer DEFAULT 0 NOT NULL,
  "last_error" text,
  "created_at" timestamp with time zone NOT NULL,
  "original_updated_at" timestamp with time zone NOT NULL,
  "completed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "purge_after" timestamp with time zone DEFAULT now() + interval '30 days' NOT NULL,
  CONSTRAINT "chat_legacy_realtime_deliveries_status_check" CHECK ("status" = 'completed'),
  CONSTRAINT "chat_legacy_realtime_deliveries_reason_check" CHECK ("final_reason" = 'legacy_realtime_retired')
);
--> statement-breakpoint
INSERT INTO "chat_legacy_realtime_deliveries" (
  "id", "message_id", "team_id", "channel_id", "recipient_user_id",
  "original_status", "original_outcome", "attempts", "target_count",
  "success_count", "failure_count", "last_error", "created_at",
  "original_updated_at", "completed_at", "purge_after"
)
SELECT
  "id", "message_id", "team_id", "channel_id", "recipient_user_id",
  "status", "outcome", "attempts", "target_count", "success_count",
  "failure_count", "last_error", "created_at", "updated_at", now(),
  now() + interval '30 days'
FROM "chat_message_deliveries"
WHERE "transport" = 'realtime'
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
DELETE FROM "chat_message_deliveries" WHERE "transport" = 'realtime';
--> statement-breakpoint
ALTER TABLE "chat_message_deliveries" DROP CONSTRAINT "chat_message_deliveries_transport_check";
--> statement-breakpoint
DROP INDEX "chat_message_deliveries_message_recipient_transport_unique";
--> statement-breakpoint
ALTER TABLE "chat_message_deliveries" DROP COLUMN "transport";
--> statement-breakpoint
ALTER TABLE "chat_message_deliveries" RENAME TO "chat_push_deliveries";
--> statement-breakpoint
ALTER TABLE "chat_push_deliveries" RENAME CONSTRAINT "chat_message_deliveries_pkey" TO "chat_push_deliveries_pkey";
--> statement-breakpoint
ALTER TABLE "chat_push_deliveries" RENAME CONSTRAINT "chat_message_deliveries_message_id_chat_messages_id_fk" TO "chat_push_deliveries_message_id_chat_messages_id_fk";
--> statement-breakpoint
ALTER TABLE "chat_push_deliveries" RENAME CONSTRAINT "chat_message_deliveries_team_id_teams_id_fk" TO "chat_push_deliveries_team_id_teams_id_fk";
--> statement-breakpoint
ALTER TABLE "chat_push_deliveries" RENAME CONSTRAINT "chat_message_deliveries_channel_id_chat_channels_id_fk" TO "chat_push_deliveries_channel_id_chat_channels_id_fk";
--> statement-breakpoint
ALTER TABLE "chat_push_deliveries" RENAME CONSTRAINT "chat_message_deliveries_recipient_user_id_users_id_fk" TO "chat_push_deliveries_recipient_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "chat_push_deliveries" RENAME CONSTRAINT "chat_message_deliveries_status_check" TO "chat_push_deliveries_status_check";
--> statement-breakpoint
ALTER TABLE "chat_push_deliveries" DROP CONSTRAINT "chat_message_deliveries_outcome_check";
--> statement-breakpoint
ALTER TABLE "chat_push_deliveries" RENAME CONSTRAINT "chat_message_deliveries_counts_check" TO "chat_push_deliveries_counts_check";
--> statement-breakpoint
ALTER TABLE "chat_push_deliveries" RENAME CONSTRAINT "chat_message_deliveries_state_shape_check" TO "chat_push_deliveries_state_shape_check";
--> statement-breakpoint
ALTER INDEX "chat_message_deliveries_retry_idx" RENAME TO "chat_push_deliveries_retry_idx";
--> statement-breakpoint
ALTER TABLE "chat_push_deliveries"
ADD CONSTRAINT "chat_push_deliveries_outcome_check" CHECK (
  "outcome" IS NULL OR "outcome" IN (
    'legacy_processed', 'push_accepted', 'push_partially_accepted',
    'push_rejected', 'no_push_device', 'push_disabled',
    'not_applicable', 'failed'
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX "chat_push_deliveries_message_recipient_unique"
ON "chat_push_deliveries" USING btree ("message_id", "recipient_user_id");
--> statement-breakpoint
CREATE INDEX "chat_legacy_realtime_deliveries_purge_idx"
ON "chat_legacy_realtime_deliveries" USING btree ("purge_after");
