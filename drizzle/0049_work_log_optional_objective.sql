DROP INDEX "work_log_entries_author_date_objective_unique";
--> statement-breakpoint
ALTER TABLE "work_log_entries"
  ALTER COLUMN "objective_id_snapshot" DROP NOT NULL,
  ALTER COLUMN "objective_title_snapshot" DROP NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "work_log_entries_author_date_objective_unique"
  ON "work_log_entries" ("team_id", "author_user_id", "work_date", "objective_id_snapshot")
  WHERE "objective_id_snapshot" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "work_log_entries_author_date_general_unique"
  ON "work_log_entries" ("team_id", "author_user_id", "work_date")
  WHERE "objective_id_snapshot" IS NULL;
