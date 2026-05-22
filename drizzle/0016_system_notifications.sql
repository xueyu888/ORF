CREATE TABLE IF NOT EXISTS "notifications" (
  "id" text PRIMARY KEY NOT NULL,
  "team_id" text NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
  "recipient_user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "actor_user_id" text REFERENCES "users"("id") ON DELETE set null,
  "actor_name" text DEFAULT '' NOT NULL,
  "kind" text NOT NULL,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "target_type" text NOT NULL,
  "target_id" text NOT NULL,
  "target_href" text NOT NULL,
  "read_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_recipient_created_at_idx" ON "notifications" ("recipient_user_id", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_recipient_unread_idx" ON "notifications" ("recipient_user_id", "read_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_team_created_at_idx" ON "notifications" ("team_id", "created_at");
