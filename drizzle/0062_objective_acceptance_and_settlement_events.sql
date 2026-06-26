CREATE TABLE IF NOT EXISTS "objective_acceptance_reviews" (
  "id" text PRIMARY KEY NOT NULL,
  "team_id" text NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
  "objective_id" text NOT NULL REFERENCES "objectives"("id") ON DELETE cascade,
  "loot_id" text NOT NULL REFERENCES "objective_loot"("id") ON DELETE cascade,
  "reviewer_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "accepted_result" text NOT NULL,
  "result_reviews" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "reason" text,
  "reviewed_at" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "objective_acceptance_reviews_objective_reviewed_at_idx"
  ON "objective_acceptance_reviews" ("objective_id", "reviewed_at");

CREATE INDEX IF NOT EXISTS "objective_acceptance_reviews_team_reviewed_at_idx"
  ON "objective_acceptance_reviews" ("team_id", "reviewed_at");

CREATE TABLE IF NOT EXISTS "objective_settlement_events" (
  "id" text PRIMARY KEY NOT NULL,
  "team_id" text NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
  "objective_id" text NOT NULL REFERENCES "objectives"("id") ON DELETE cascade,
  "kind" text NOT NULL,
  "loot_id" text REFERENCES "objective_loot"("id") ON DELETE set null,
  "base_points" real NOT NULL,
  "multiplier" real NOT NULL,
  "settlement_points" real NOT NULL,
  "reason" text NOT NULL,
  "created_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "objective_settlement_events_objective_kind_idx"
  ON "objective_settlement_events" ("objective_id", "kind");

CREATE INDEX IF NOT EXISTS "objective_settlement_events_team_created_at_idx"
  ON "objective_settlement_events" ("team_id", "created_at");

ALTER TABLE "point_ledger"
  ADD COLUMN IF NOT EXISTS "settlement_event_id" text REFERENCES "objective_settlement_events"("id") ON DELETE set null;
