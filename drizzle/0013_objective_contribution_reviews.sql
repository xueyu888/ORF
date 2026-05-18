CREATE TABLE "objective_contribution_reviews" (
  "id" text PRIMARY KEY NOT NULL,
  "team_id" text NOT NULL,
  "objective_id" text NOT NULL,
  "reviewer" text NOT NULL,
  "allocations" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "objective_contribution_reviews" ADD CONSTRAINT "objective_contribution_reviews_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objective_contribution_reviews" ADD CONSTRAINT "objective_contribution_reviews_objective_id_objectives_id_fk" FOREIGN KEY ("objective_id") REFERENCES "objectives"("id") ON DELETE cascade ON UPDATE no action;
