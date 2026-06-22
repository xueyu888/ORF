CREATE TABLE IF NOT EXISTS "gitlab_orf_project_channels" (
  "team_id" text NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
  "gitlab_project_id" text NOT NULL,
  "gitlab_project_path" text NOT NULL,
  "gitlab_project_url" text DEFAULT '' NOT NULL,
  "chat_channel_id" text NOT NULL REFERENCES "chat_channels"("id") ON DELETE cascade,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "last_seen_at" timestamp with time zone NOT NULL,
  CONSTRAINT "gitlab_orf_project_channels_pk" PRIMARY KEY ("team_id", "gitlab_project_id"),
  CONSTRAINT "gitlab_orf_project_channels_team_path_unique" UNIQUE ("team_id", "gitlab_project_path"),
  CONSTRAINT "gitlab_orf_project_channels_team_channel_unique" UNIQUE ("team_id", "chat_channel_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gitlab_orf_project_channels_channel_idx" ON "gitlab_orf_project_channels" ("chat_channel_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gitlab_orf_event_deliveries" (
  "team_id" text NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
  "external_event_key" text NOT NULL,
  "gitlab_project_id" text NOT NULL,
  "event_type" text NOT NULL,
  "chat_channel_id" text REFERENCES "chat_channels"("id") ON DELETE set null,
  "chat_message_id" text REFERENCES "chat_messages"("id") ON DELETE set null,
  "status" text NOT NULL,
  "error" text,
  "received_at" timestamp with time zone NOT NULL,
  "delivered_at" timestamp with time zone,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "gitlab_orf_event_deliveries_pk" PRIMARY KEY ("team_id", "external_event_key"),
  CONSTRAINT "gitlab_orf_event_deliveries_status_check" CHECK ("status" IN ('reserved', 'delivered', 'failed', 'ignored')),
  CONSTRAINT "gitlab_orf_event_deliveries_project_fk" FOREIGN KEY ("team_id", "gitlab_project_id")
    REFERENCES "gitlab_orf_project_channels"("team_id", "gitlab_project_id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gitlab_orf_event_deliveries_project_idx" ON "gitlab_orf_event_deliveries" ("team_id", "gitlab_project_id", "received_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gitlab_orf_event_deliveries_status_idx" ON "gitlab_orf_event_deliveries" ("team_id", "status", "updated_at");
