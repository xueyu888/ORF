DO $$ BEGIN
 CREATE TYPE "drive_node_type" AS ENUM ('folder', 'file');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "drive_file_preview_kind" AS ENUM ('download', 'image', 'markdown', 'pdf', 'text');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "drive_nodes" (
  "id" text PRIMARY KEY NOT NULL,
  "team_id" text NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
  "parent_id" text,
  "node_type" "drive_node_type" NOT NULL,
  "name" text NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "updated_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "deleted_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "deleted_at" timestamp with time zone,
  CONSTRAINT "drive_nodes_root_folder_check" CHECK (("parent_id" IS NOT NULL) OR ("node_type" = 'folder'))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "drive_nodes" ADD CONSTRAINT "drive_nodes_parent_id_fk" FOREIGN KEY ("parent_id") REFERENCES "drive_nodes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "drive_nodes_team_parent_idx" ON "drive_nodes" USING btree ("team_id","parent_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "drive_nodes_active_sibling_name_unique" ON "drive_nodes" USING btree ("team_id","parent_id", lower("name")) WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "drive_nodes_active_root_unique" ON "drive_nodes" USING btree ("team_id") WHERE "parent_id" IS NULL AND "deleted_at" IS NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "drive_files" (
  "id" text PRIMARY KEY NOT NULL,
  "node_id" text NOT NULL REFERENCES "drive_nodes"("id") ON DELETE cascade,
  "team_id" text NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
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
CREATE UNIQUE INDEX IF NOT EXISTS "drive_files_node_unique" ON "drive_files" USING btree ("node_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "drive_files_team_created_idx" ON "drive_files" USING btree ("team_id","created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_channel_drive_links" (
  "id" text PRIMARY KEY NOT NULL,
  "team_id" text NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
  "channel_id" text NOT NULL REFERENCES "chat_channels"("id") ON DELETE cascade,
  "node_id" text NOT NULL REFERENCES "drive_nodes"("id") ON DELETE cascade,
  "label" text,
  "is_default_upload_target" boolean NOT NULL DEFAULT false,
  "created_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "chat_channel_drive_links_channel_node_unique" ON "chat_channel_drive_links" USING btree ("channel_id","node_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "chat_channel_drive_links_default_upload_unique" ON "chat_channel_drive_links" USING btree ("channel_id") WHERE "is_default_upload_target" = true;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_channel_drive_links_team_channel_idx" ON "chat_channel_drive_links" USING btree ("team_id","channel_id");
--> statement-breakpoint
INSERT INTO "drive_nodes" ("id", "team_id", "parent_id", "node_type", "name", "created_by", "updated_by", "created_at", "updated_at")
SELECT 'drive-root-' || md5(t."id"), t."id", NULL, 'folder'::"drive_node_type", '团队云盘', NULL, NULL, now(), now()
FROM "teams" t
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "drive_nodes" ("id", "team_id", "parent_id", "node_type", "name", "created_by", "updated_by", "deleted_by", "created_at", "updated_at", "deleted_at")
SELECT
  n."id",
  n."team_id",
  CASE WHEN n."parent_id" IS NULL THEN 'drive-root-' || md5(n."team_id") ELSE n."parent_id" END,
  n."node_type"::text::"drive_node_type",
  CASE WHEN n."parent_id" IS NULL THEN COALESCE(NULLIF(p."name", ''), n."name") ELSE n."name" END,
  n."created_by",
  n."updated_by",
  n."deleted_by",
  n."created_at",
  n."updated_at",
  n."deleted_at"
FROM "project_file_nodes" n
LEFT JOIN "projects" p ON p."id" = n."project_id"
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "drive_files" ("id", "node_id", "team_id", "object_key", "file_name", "mime_type", "file_size", "preview_kind", "width", "height", "created_by", "created_at")
SELECT
  f."id",
  f."node_id",
  f."team_id",
  f."object_key",
  f."file_name",
  f."mime_type",
  f."file_size",
  f."preview_kind"::text::"drive_file_preview_kind",
  f."width",
  f."height",
  f."created_by",
  f."created_at"
FROM "project_files" f
INNER JOIN "drive_nodes" n ON n."id" = f."node_id"
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "chat_channel_drive_links" ("id", "team_id", "channel_id", "node_id", "label", "is_default_upload_target", "created_by", "created_at", "updated_at")
SELECT
  'chat-drive-link-' || md5(c."id" || ':' || root."id"),
  c."team_id",
  c."id",
  root."id",
  p."name",
  true,
  c."created_by",
  now(),
  now()
FROM "chat_channels" c
INNER JOIN "projects" p ON p."id" = c."project_id" AND p."team_id" = c."team_id"
INNER JOIN "project_file_trees" t ON t."project_id" = p."id" AND t."team_id" = c."team_id"
INNER JOIN "project_file_nodes" root ON root."tree_id" = t."id" AND root."parent_id" IS NULL AND root."deleted_at" IS NULL
WHERE c."project_id" IS NOT NULL
  AND c."archived_at" IS NULL
  AND c."type" IN ('public', 'private')
ON CONFLICT ("channel_id", "node_id") DO NOTHING;
