DO $$ BEGIN
 CREATE TYPE "chat_channel_type" AS ENUM ('public', 'private', 'direct', 'group');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "chat_member_role" AS ENUM ('owner', 'admin', 'member');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_channels" (
  "id" text PRIMARY KEY NOT NULL,
  "team_id" text NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
  "type" "chat_channel_type" NOT NULL,
  "name" text,
  "display_name" text NOT NULL,
  "purpose" text NOT NULL DEFAULT '',
  "header" text NOT NULL DEFAULT '',
  "created_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "archived_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "chat_channels_team_name_unique" ON "chat_channels" USING btree ("team_id", "name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_channels_team_type_idx" ON "chat_channels" USING btree ("team_id", "type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_channels_team_updated_idx" ON "chat_channels" USING btree ("team_id", "updated_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_channel_members" (
  "channel_id" text NOT NULL REFERENCES "chat_channels"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "role" "chat_member_role" NOT NULL DEFAULT 'member',
  "favorite" boolean NOT NULL DEFAULT false,
  "muted" boolean NOT NULL DEFAULT false,
  "manually_unread" boolean NOT NULL DEFAULT false,
  "last_viewed_at" timestamp with time zone,
  "last_read_at" timestamp with time zone,
  "last_read_message_id" text,
  "joined_at" timestamp with time zone NOT NULL,
  CONSTRAINT "chat_channel_members_pkey" PRIMARY KEY ("channel_id", "user_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_channel_members_user_idx" ON "chat_channel_members" USING btree ("user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_messages" (
  "id" text PRIMARY KEY NOT NULL,
  "team_id" text NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
  "channel_id" text NOT NULL REFERENCES "chat_channels"("id") ON DELETE cascade,
  "author_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "body" text NOT NULL,
  "root_message_id" text,
  "parent_message_id" text,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "edited_at" timestamp with time zone,
  "deleted_at" timestamp with time zone,
  "deleted_by" uuid REFERENCES "users"("id") ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_messages_channel_created_idx" ON "chat_messages" USING btree ("channel_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_messages_root_created_idx" ON "chat_messages" USING btree ("root_message_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_messages_team_created_idx" ON "chat_messages" USING btree ("team_id", "created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_message_reactions" (
  "message_id" text NOT NULL REFERENCES "chat_messages"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "emoji_name" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  CONSTRAINT "chat_message_reactions_pkey" PRIMARY KEY ("message_id", "user_id", "emoji_name")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_message_reactions_user_idx" ON "chat_message_reactions" USING btree ("user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_thread_follows" (
  "root_message_id" text NOT NULL REFERENCES "chat_messages"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "following" boolean NOT NULL DEFAULT true,
  "last_viewed_at" timestamp with time zone,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "chat_thread_follows_pkey" PRIMARY KEY ("root_message_id", "user_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_thread_follows_user_idx" ON "chat_thread_follows" USING btree ("user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_attachments" (
  "id" text PRIMARY KEY NOT NULL,
  "team_id" text NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
  "channel_id" text NOT NULL REFERENCES "chat_channels"("id") ON DELETE cascade,
  "message_id" text REFERENCES "chat_messages"("id") ON DELETE cascade,
  "object_key" text NOT NULL,
  "file_name" text NOT NULL,
  "mime_type" text NOT NULL,
  "file_size" integer NOT NULL,
  "width" integer,
  "height" integer,
  "created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "created_at" timestamp with time zone NOT NULL,
  "attached_at" timestamp with time zone,
  "expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_attachments_message_idx" ON "chat_attachments" USING btree ("message_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_attachments_pending_creator_idx" ON "chat_attachments" USING btree ("created_by", "channel_id", "expires_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_attachments_team_channel_idx" ON "chat_attachments" USING btree ("team_id", "channel_id");
--> statement-breakpoint
UPDATE "role_permissions"
SET "actions" = (
  SELECT jsonb_agg(DISTINCT value)
  FROM jsonb_array_elements_text("actions" || '["chat.read","chat.write","chat.channel.create"]'::jsonb) AS permission(value)
)
WHERE "role" = 'member'
  AND "stage" = 'global'
  AND "resource" = 'permissionKeys';
