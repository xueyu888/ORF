CREATE TABLE IF NOT EXISTS "comment_attachments" (
  "id" text PRIMARY KEY NOT NULL,
  "team_id" text NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
  "target_type" "comment_target_type" NOT NULL,
  "target_id" text NOT NULL,
  "message_id" text REFERENCES "comment_messages"("id") ON DELETE cascade,
  "object_key" text NOT NULL,
  "file_name" text NOT NULL,
  "mime_type" text NOT NULL,
  "file_size" integer NOT NULL,
  "width" integer,
  "height" integer,
  "created_by" text NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone NOT NULL,
  "attached_at" timestamp with time zone,
  "expires_at" timestamp with time zone NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comment_attachments_message_idx" ON "comment_attachments" ("message_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comment_attachments_pending_creator_idx" ON "comment_attachments" ("created_by", "target_type", "target_id", "expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comment_attachments_team_target_idx" ON "comment_attachments" ("team_id", "target_type", "target_id");
