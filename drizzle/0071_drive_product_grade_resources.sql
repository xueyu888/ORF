DO $$ BEGIN
 CREATE TYPE "drive_node_event_action" AS ENUM (
  'folder_created',
  'file_uploaded',
  'file_version_uploaded',
  'file_version_restored',
  'node_deleted',
  'node_restored',
  'context_linked',
  'context_unlinked',
  'chat_linked',
  'chat_unlinked'
 );
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "drive_context_type" AS ENUM ('project', 'objective', 'chatChannel');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "drive_file_versions" (
  "id" text PRIMARY KEY NOT NULL,
  "team_id" text NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
  "file_id" text NOT NULL REFERENCES "drive_files"("id") ON DELETE cascade,
  "node_id" text NOT NULL REFERENCES "drive_nodes"("id") ON DELETE cascade,
  "version_number" integer NOT NULL,
  "object_key" text NOT NULL,
  "file_name" text NOT NULL,
  "mime_type" text NOT NULL,
  "file_size" bigint NOT NULL,
  "preview_kind" "drive_file_preview_kind" NOT NULL DEFAULT 'download',
  "width" integer,
  "height" integer,
  "created_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "drive_file_versions_file_version_unique" ON "drive_file_versions" USING btree ("file_id","version_number");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "drive_file_versions_team_file_created_idx" ON "drive_file_versions" USING btree ("team_id","file_id","created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "drive_node_events" (
  "id" text PRIMARY KEY NOT NULL,
  "team_id" text NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
  "node_id" text NOT NULL REFERENCES "drive_nodes"("id") ON DELETE cascade,
  "actor_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "action" "drive_node_event_action" NOT NULL,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "drive_node_events_team_created_idx" ON "drive_node_events" USING btree ("team_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "drive_node_events_node_created_idx" ON "drive_node_events" USING btree ("node_id","created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "drive_node_context_links" (
  "id" text PRIMARY KEY NOT NULL,
  "team_id" text NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
  "node_id" text NOT NULL REFERENCES "drive_nodes"("id") ON DELETE cascade,
  "context_type" "drive_context_type" NOT NULL,
  "context_id" text NOT NULL,
  "label" text,
  "created_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "drive_node_context_links_node_context_unique" ON "drive_node_context_links" USING btree ("team_id","node_id","context_type","context_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "drive_node_context_links_context_idx" ON "drive_node_context_links" USING btree ("team_id","context_type","context_id");
--> statement-breakpoint
INSERT INTO "drive_file_versions" (
  "id",
  "team_id",
  "file_id",
  "node_id",
  "version_number",
  "object_key",
  "file_name",
  "mime_type",
  "file_size",
  "preview_kind",
  "width",
  "height",
  "created_by",
  "created_at"
)
SELECT
  'drive-version-' || md5(f."id" || ':1'),
  f."team_id",
  f."id",
  f."node_id",
  1,
  f."object_key",
  f."file_name",
  f."mime_type",
  f."file_size",
  f."preview_kind",
  f."width",
  f."height",
  f."created_by",
  f."created_at"
FROM "drive_files" f
ON CONFLICT ("file_id","version_number") DO NOTHING;
--> statement-breakpoint
INSERT INTO "drive_node_events" ("id", "team_id", "node_id", "actor_user_id", "action", "metadata", "created_at")
SELECT
  'drive-event-seed-' || md5(n."id"),
  n."team_id",
  n."id",
  n."created_by",
  CASE WHEN n."node_type" = 'folder' THEN 'folder_created'::"drive_node_event_action" ELSE 'file_uploaded'::"drive_node_event_action" END,
  jsonb_build_object('seeded', true, 'name', n."name"),
  n."created_at"
FROM "drive_nodes" n
ON CONFLICT ("id") DO NOTHING;
