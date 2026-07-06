DO $$ BEGIN
 CREATE TYPE "project_file_node_type" AS ENUM ('folder', 'file');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "project_file_preview_kind" AS ENUM ('download', 'image', 'markdown', 'pdf', 'text');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "chat_channels" ADD COLUMN IF NOT EXISTS "project_id" text;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chat_channels" ADD CONSTRAINT "chat_channels_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_channels_project_idx" ON "chat_channels" USING btree ("team_id","project_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_file_trees" (
  "id" text PRIMARY KEY NOT NULL,
  "team_id" text NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
  "project_id" text NOT NULL REFERENCES "projects"("id") ON DELETE cascade,
  "created_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "project_file_trees_team_project_unique" ON "project_file_trees" USING btree ("team_id","project_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_file_nodes" (
  "id" text PRIMARY KEY NOT NULL,
  "tree_id" text NOT NULL REFERENCES "project_file_trees"("id") ON DELETE cascade,
  "team_id" text NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
  "project_id" text NOT NULL REFERENCES "projects"("id") ON DELETE cascade,
  "parent_id" text,
  "node_type" "project_file_node_type" NOT NULL,
  "name" text NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "updated_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "deleted_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "deleted_at" timestamp with time zone,
  CONSTRAINT "project_file_nodes_root_folder_check" CHECK (("parent_id" IS NOT NULL) OR ("node_type" = 'folder'))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_file_nodes" ADD CONSTRAINT "project_file_nodes_parent_id_fk" FOREIGN KEY ("parent_id") REFERENCES "project_file_nodes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_file_nodes_tree_parent_idx" ON "project_file_nodes" USING btree ("tree_id","parent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_file_nodes_project_parent_idx" ON "project_file_nodes" USING btree ("project_id","parent_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "project_file_nodes_active_sibling_name_unique" ON "project_file_nodes" USING btree ("tree_id","parent_id", lower("name")) WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "project_file_nodes_active_root_unique" ON "project_file_nodes" USING btree ("tree_id") WHERE "parent_id" IS NULL AND "deleted_at" IS NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_files" (
  "id" text PRIMARY KEY NOT NULL,
  "node_id" text NOT NULL REFERENCES "project_file_nodes"("id") ON DELETE cascade,
  "tree_id" text NOT NULL REFERENCES "project_file_trees"("id") ON DELETE cascade,
  "team_id" text NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
  "project_id" text NOT NULL REFERENCES "projects"("id") ON DELETE cascade,
  "object_key" text NOT NULL,
  "file_name" text NOT NULL,
  "mime_type" text NOT NULL,
  "file_size" bigint NOT NULL,
  "preview_kind" "project_file_preview_kind" NOT NULL DEFAULT 'download',
  "width" integer,
  "height" integer,
  "created_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "project_files_node_unique" ON "project_files" USING btree ("node_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_files_project_created_idx" ON "project_files" USING btree ("project_id","created_at");
