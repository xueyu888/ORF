CREATE TABLE "work_log_entries" (
  "id" text PRIMARY KEY NOT NULL,
  "team_id" text NOT NULL,
  "author_user_id" uuid NOT NULL,
  "author_name_snapshot" text NOT NULL,
  "work_date" date NOT NULL,
  "objective_id" text,
  "objective_id_snapshot" text NOT NULL,
  "objective_title_snapshot" text NOT NULL,
  "body_markdown" text NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

ALTER TABLE "work_log_entries"
  ADD CONSTRAINT "work_log_entries_team_id_teams_id_fk"
  FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "work_log_entries"
  ADD CONSTRAINT "work_log_entries_author_user_id_users_id_fk"
  FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "work_log_entries"
  ADD CONSTRAINT "work_log_entries_objective_id_objectives_id_fk"
  FOREIGN KEY ("objective_id") REFERENCES "objectives"("id") ON DELETE set null ON UPDATE no action;

CREATE INDEX "work_log_entries_author_date_idx"
  ON "work_log_entries" ("team_id", "author_user_id", "work_date");

CREATE INDEX "work_log_entries_team_date_idx"
  ON "work_log_entries" ("team_id", "work_date");

CREATE INDEX "work_log_entries_objective_snapshot_idx"
  ON "work_log_entries" ("team_id", "objective_id_snapshot");

CREATE UNIQUE INDEX "work_log_entries_author_date_objective_unique"
  ON "work_log_entries" ("team_id", "author_user_id", "work_date", "objective_id_snapshot");
