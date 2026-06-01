CREATE TABLE IF NOT EXISTS "objective_trial_reviews" (
  "id" text PRIMARY KEY NOT NULL,
  "team_id" text NOT NULL,
  "objective_id" text NOT NULL,
  "requested_by" text NOT NULL,
  "body" text NOT NULL,
  "result_claims" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "self_test_report_body" text,
  "status" text DEFAULT 'requested' NOT NULL,
  "commander_feedback" text,
  "reviewed_by" text,
  "reviewed_at" timestamp with time zone,
  "requested_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "objective_trial_reviews" ADD CONSTRAINT "objective_trial_reviews_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "objective_trial_reviews" ADD CONSTRAINT "objective_trial_reviews_objective_id_objectives_id_fk" FOREIGN KEY ("objective_id") REFERENCES "objectives"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "objective_trial_reviews_objective_once_idx" ON "objective_trial_reviews" ("objective_id");
