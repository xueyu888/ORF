CREATE TABLE IF NOT EXISTS "work_log_categories" (
  "id" text PRIMARY KEY NOT NULL,
  "team_id" text NOT NULL,
  "name" text NOT NULL,
  "normalized_name" text NOT NULL,
  "created_by_user_id" uuid,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "work_log_categories"
    ADD CONSTRAINT "work_log_categories_team_id_teams_id_fk"
    FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "work_log_categories"
    ADD CONSTRAINT "work_log_categories_created_by_user_id_users_id_fk"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "work_log_categories_team_name_idx"
  ON "work_log_categories" ("team_id", "normalized_name");
--> statement-breakpoint
ALTER TABLE "work_log_entries"
  ADD COLUMN IF NOT EXISTS "category_id" text,
  ADD COLUMN IF NOT EXISTS "category_id_snapshot" text,
  ADD COLUMN IF NOT EXISTS "category_name_snapshot" text,
  ADD COLUMN IF NOT EXISTS "duration_minutes" integer;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "work_log_entries"
    ADD CONSTRAINT "work_log_entries_category_id_work_log_categories_id_fk"
    FOREIGN KEY ("category_id") REFERENCES "work_log_categories"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "work_log_entries"
    ADD CONSTRAINT "work_log_entries_duration_minutes_range"
    CHECK ("duration_minutes" IS NULL OR ("duration_minutes" >= 1 AND "duration_minutes" <= 1440));
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_log_entries_category_snapshot_idx"
  ON "work_log_entries" ("team_id", "category_id_snapshot");
