ALTER TABLE "chat_message_deliveries" RENAME COLUMN "delivered_at" TO "completed_at";
--> statement-breakpoint
ALTER TABLE "chat_message_deliveries" ADD COLUMN "outcome" text;
--> statement-breakpoint
ALTER TABLE "chat_message_deliveries" ADD COLUMN "target_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "chat_message_deliveries" ADD COLUMN "success_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "chat_message_deliveries" ADD COLUMN "failure_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "chat_message_deliveries" DROP CONSTRAINT "chat_message_deliveries_status_check";
--> statement-breakpoint
UPDATE "chat_message_deliveries"
SET "status" = 'completed',
    "outcome" = 'legacy_processed',
    "completed_at" = COALESCE("completed_at", "updated_at"),
    "next_attempt_at" = NULL,
    "lease_expires_at" = NULL
WHERE "status" = 'delivered';
--> statement-breakpoint
UPDATE "chat_message_deliveries"
SET "status" = 'retry_scheduled',
    "outcome" = NULL,
    "completed_at" = NULL,
    "lease_expires_at" = NULL,
    "next_attempt_at" = COALESCE("next_attempt_at", now())
WHERE "status" = 'failed';
--> statement-breakpoint
ALTER TABLE "chat_message_deliveries"
ADD CONSTRAINT "chat_message_deliveries_status_check" CHECK (
  "status" IN ('pending', 'processing', 'retry_scheduled', 'completed', 'dead_letter')
);
--> statement-breakpoint
ALTER TABLE "chat_message_deliveries"
ADD CONSTRAINT "chat_message_deliveries_outcome_check" CHECK (
  "outcome" IS NULL OR "outcome" IN (
    'legacy_processed', 'sent_to_connection', 'no_online_subscriber',
    'push_accepted', 'push_partially_accepted', 'push_rejected',
    'no_push_device', 'push_disabled', 'not_applicable', 'failed'
  )
);
--> statement-breakpoint
ALTER TABLE "chat_message_deliveries"
ADD CONSTRAINT "chat_message_deliveries_counts_check" CHECK (
  "target_count" >= 0
  AND "success_count" >= 0
  AND "failure_count" >= 0
  AND "success_count" + "failure_count" <= "target_count"
);
--> statement-breakpoint
ALTER TABLE "chat_message_deliveries"
ADD CONSTRAINT "chat_message_deliveries_state_shape_check" CHECK (
  (
    "status" = 'pending'
    AND "outcome" IS NULL
    AND "completed_at" IS NULL
    AND "lease_expires_at" IS NULL
  ) OR (
    "status" = 'processing'
    AND "outcome" IS NULL
    AND "completed_at" IS NULL
    AND "lease_expires_at" IS NOT NULL
  ) OR (
    "status" = 'retry_scheduled'
    AND "outcome" IS NULL
    AND "completed_at" IS NULL
    AND "lease_expires_at" IS NULL
    AND "next_attempt_at" IS NOT NULL
  ) OR (
    "status" = 'completed'
    AND "outcome" IS NOT NULL
    AND "outcome" <> 'failed'
    AND "completed_at" IS NOT NULL
    AND "next_attempt_at" IS NULL
    AND "lease_expires_at" IS NULL
  ) OR (
    "status" = 'dead_letter'
    AND "outcome" = 'failed'
    AND "completed_at" IS NOT NULL
    AND "next_attempt_at" IS NULL
    AND "lease_expires_at" IS NULL
    AND "last_error" IS NOT NULL
  )
);
