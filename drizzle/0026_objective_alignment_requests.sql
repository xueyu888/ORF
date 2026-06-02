CREATE TABLE IF NOT EXISTS "objective_alignment_requests" (
  "id" text PRIMARY KEY NOT NULL,
  "team_id" text NOT NULL,
  "objective_id" text NOT NULL,
  "kind" text NOT NULL,
  "requested_by" text NOT NULL,
  "status" text DEFAULT 'requested' NOT NULL,
  "proposed_at" timestamp with time zone NOT NULL,
  "scheduled_at" timestamp with time zone,
  "meeting_room" text,
  "note" text,
  "commander_feedback" text,
  "reviewed_by" text,
  "reviewed_at" timestamp with time zone
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'objective_alignment_requests_team_id_teams_id_fk'
      AND conrelid = 'objective_alignment_requests'::regclass
  ) THEN
    ALTER TABLE "objective_alignment_requests" ADD CONSTRAINT "objective_alignment_requests_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'objective_alignment_requests_objective_id_objectives_id_fk'
      AND conrelid = 'objective_alignment_requests'::regclass
  ) THEN
    ALTER TABLE "objective_alignment_requests" ADD CONSTRAINT "objective_alignment_requests_objective_id_objectives_id_fk" FOREIGN KEY ("objective_id") REFERENCES "objectives"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "objective_alignment_requests_objective_kind_status_idx" ON "objective_alignment_requests" ("objective_id", "kind", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "objective_alignment_requests_team_proposed_at_idx" ON "objective_alignment_requests" ("team_id", "proposed_at");
