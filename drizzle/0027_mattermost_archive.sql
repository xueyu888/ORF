DO $$
BEGIN
  CREATE TYPE "mattermost_archive_file_storage_status" AS ENUM (
    'metadata_only',
    'copied',
    'skipped_non_image',
    'skipped_large',
    'copy_failed'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mattermost_archive_channels" (
  "id" text PRIMARY KEY NOT NULL,
  "mattermost_team_id" text,
  "name" text DEFAULT '' NOT NULL,
  "display_name" text DEFAULT '' NOT NULL,
  "type" text DEFAULT '' NOT NULL,
  "header" text DEFAULT '' NOT NULL,
  "purpose" text DEFAULT '' NOT NULL,
  "delete_at" bigint DEFAULT 0 NOT NULL,
  "last_post_at" bigint DEFAULT 0 NOT NULL,
  "total_msg_count" integer DEFAULT 0 NOT NULL,
  "total_msg_count_root" integer DEFAULT 0 NOT NULL,
  "raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "discovered_at" timestamp with time zone NOT NULL,
  "synced_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mattermost_archive_channels_display_name_idx" ON "mattermost_archive_channels" ("display_name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mattermost_archive_channels_type_idx" ON "mattermost_archive_channels" ("type");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mattermost_archive_users" (
  "id" text PRIMARY KEY NOT NULL,
  "username" text DEFAULT '' NOT NULL,
  "nickname" text DEFAULT '' NOT NULL,
  "first_name" text DEFAULT '' NOT NULL,
  "last_name" text DEFAULT '' NOT NULL,
  "delete_at" bigint DEFAULT 0 NOT NULL,
  "is_bot" boolean DEFAULT false NOT NULL,
  "raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "synced_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mattermost_archive_users_username_idx" ON "mattermost_archive_users" ("username");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mattermost_archive_posts" (
  "id" text PRIMARY KEY NOT NULL,
  "channel_id" text NOT NULL,
  "user_id" text,
  "root_id" text DEFAULT '' NOT NULL,
  "original_id" text DEFAULT '' NOT NULL,
  "type" text DEFAULT '' NOT NULL,
  "message" text DEFAULT '' NOT NULL,
  "hashtags" text DEFAULT '' NOT NULL,
  "props" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "file_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "create_at" bigint DEFAULT 0 NOT NULL,
  "update_at" bigint DEFAULT 0 NOT NULL,
  "edit_at" bigint DEFAULT 0 NOT NULL,
  "delete_at" bigint DEFAULT 0 NOT NULL,
  "reply_count" integer DEFAULT 0 NOT NULL,
  "last_reply_at" bigint DEFAULT 0 NOT NULL,
  "archived_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'mattermost_archive_posts_channel_id_channels_id_fk'
      AND conrelid = 'mattermost_archive_posts'::regclass
  ) THEN
    ALTER TABLE "mattermost_archive_posts" ADD CONSTRAINT "mattermost_archive_posts_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "mattermost_archive_channels"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'mattermost_archive_posts_user_id_users_id_fk'
      AND conrelid = 'mattermost_archive_posts'::regclass
  ) THEN
    ALTER TABLE "mattermost_archive_posts" ADD CONSTRAINT "mattermost_archive_posts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "mattermost_archive_users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mattermost_archive_posts_channel_create_at_idx" ON "mattermost_archive_posts" ("channel_id", "create_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mattermost_archive_posts_channel_update_at_idx" ON "mattermost_archive_posts" ("channel_id", "update_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mattermost_archive_posts_root_idx" ON "mattermost_archive_posts" ("root_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mattermost_archive_posts_user_idx" ON "mattermost_archive_posts" ("user_id");
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    CREATE INDEX IF NOT EXISTS "mattermost_archive_posts_message_trgm_idx" ON "mattermost_archive_posts" USING gin ("message" gin_trgm_ops);
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mattermost_archive_post_files" (
  "id" text PRIMARY KEY NOT NULL,
  "post_id" text NOT NULL,
  "channel_id" text NOT NULL,
  "user_id" text,
  "name" text DEFAULT '' NOT NULL,
  "extension" text DEFAULT '' NOT NULL,
  "mime_type" text DEFAULT '' NOT NULL,
  "size" integer DEFAULT 0 NOT NULL,
  "width" integer,
  "height" integer,
  "has_preview_image" boolean DEFAULT false NOT NULL,
  "create_at" bigint DEFAULT 0 NOT NULL,
  "update_at" bigint DEFAULT 0 NOT NULL,
  "delete_at" bigint DEFAULT 0 NOT NULL,
  "storage_status" "mattermost_archive_file_storage_status" DEFAULT 'metadata_only' NOT NULL,
  "object_key" text,
  "copied_at" timestamp with time zone,
  "raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "synced_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'mattermost_archive_post_files_post_id_posts_id_fk'
      AND conrelid = 'mattermost_archive_post_files'::regclass
  ) THEN
    ALTER TABLE "mattermost_archive_post_files" ADD CONSTRAINT "mattermost_archive_post_files_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "mattermost_archive_posts"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'mattermost_archive_post_files_channel_id_channels_id_fk'
      AND conrelid = 'mattermost_archive_post_files'::regclass
  ) THEN
    ALTER TABLE "mattermost_archive_post_files" ADD CONSTRAINT "mattermost_archive_post_files_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "mattermost_archive_channels"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'mattermost_archive_post_files_user_id_users_id_fk'
      AND conrelid = 'mattermost_archive_post_files'::regclass
  ) THEN
    ALTER TABLE "mattermost_archive_post_files" ADD CONSTRAINT "mattermost_archive_post_files_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "mattermost_archive_users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mattermost_archive_post_files_post_idx" ON "mattermost_archive_post_files" ("post_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mattermost_archive_post_files_channel_idx" ON "mattermost_archive_post_files" ("channel_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mattermost_archive_post_files_storage_status_idx" ON "mattermost_archive_post_files" ("storage_status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mattermost_archive_sync_cursors" (
  "channel_id" text PRIMARY KEY NOT NULL,
  "history_before_post_id" text,
  "history_exhausted" boolean DEFAULT false NOT NULL,
  "last_synced_update_at" bigint DEFAULT 0 NOT NULL,
  "synced_post_count" integer DEFAULT 0 NOT NULL,
  "last_started_at" timestamp with time zone,
  "last_completed_at" timestamp with time zone,
  "last_error" text
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'mattermost_archive_sync_cursors_channel_id_channels_id_fk'
      AND conrelid = 'mattermost_archive_sync_cursors'::regclass
  ) THEN
    ALTER TABLE "mattermost_archive_sync_cursors" ADD CONSTRAINT "mattermost_archive_sync_cursors_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "mattermost_archive_channels"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
