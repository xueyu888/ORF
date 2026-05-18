ALTER TABLE "users" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "objectives" ADD COLUMN "flow_status" text DEFAULT 'candidate' NOT NULL;--> statement-breakpoint
UPDATE "objectives"
SET "flow_status" = CASE
  WHEN "accepted_result" IS NOT NULL OR "objective_settlement_points" IS NOT NULL THEN 'settled'
  WHEN "loot_submitted_at" IS NOT NULL THEN 'submitted'
  WHEN "confirmed_at" IS NOT NULL OR "stage" = 'goalFrozen' THEN 'frozen'
  WHEN jsonb_array_length(COALESCE("challengers", '[]'::jsonb)) > 0 THEN 'reestimating'
  WHEN jsonb_array_length(COALESCE("assigned_challengers", '[]'::jsonb)) > 0 THEN 'recruiting'
  WHEN EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE("challenge_applications", '[]'::jsonb)) AS "application"("value")
    WHERE "application"."value"->>'status' = 'pending'
  ) THEN 'applying'
  WHEN "stage" = 'resultClaiming' THEN 'open'
  ELSE 'candidate'
END;--> statement-breakpoint
CREATE TABLE "objective_loot" (
  "id" text PRIMARY KEY NOT NULL,
  "team_id" text NOT NULL,
  "objective_id" text NOT NULL,
  "submitted_by" text NOT NULL,
  "body" text NOT NULL,
  "result_claims" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "self_test_report_url" text,
  "self_test_report_body" text,
  "submitted_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "point_ledger" (
  "id" text PRIMARY KEY NOT NULL,
  "team_id" text NOT NULL,
  "objective_id" text NOT NULL,
  "user_id" text,
  "member_name" text NOT NULL,
  "points" real NOT NULL,
  "reason" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "objective_loot" ADD CONSTRAINT "objective_loot_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objective_loot" ADD CONSTRAINT "objective_loot_objective_id_objectives_id_fk" FOREIGN KEY ("objective_id") REFERENCES "objectives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_ledger" ADD CONSTRAINT "point_ledger_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_ledger" ADD CONSTRAINT "point_ledger_objective_id_objectives_id_fk" FOREIGN KEY ("objective_id") REFERENCES "objectives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_ledger" ADD CONSTRAINT "point_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
