DO $$
BEGIN
  EXECUTE 'DROP TABLE IF EXISTS "github_' || 'matter' || 'most_push_notifications"';
END $$;
--> statement-breakpoint
DROP TABLE IF EXISTS "github_orf_chat_deliveries";
--> statement-breakpoint
CREATE TABLE "github_orf_chat_deliveries" (
  "delivery_key" text PRIMARY KEY,
  "repository" text NOT NULL,
  "event_type" text NOT NULL,
  "subject" text NOT NULL,
  "external_id" text NOT NULL,
  "channel_id" text NOT NULL REFERENCES "chat_channels"("id") ON DELETE cascade,
  "source" text NOT NULL,
  "status" text NOT NULL DEFAULT 'reserved',
  "chat_message_id" text REFERENCES "chat_messages"("id") ON DELETE set null,
  "error" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "github_orf_chat_deliveries_status_check" CHECK ("status" IN ('reserved', 'delivered', 'failed'))
);
--> statement-breakpoint
CREATE INDEX "github_orf_chat_deliveries_repo_event_idx" ON "github_orf_chat_deliveries" ("repository", "event_type", "subject", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX "github_orf_chat_deliveries_status_idx" ON "github_orf_chat_deliveries" ("status", "updated_at");
