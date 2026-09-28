-- Additive migration: legacy timestamps remain archived for old release rollback.
ALTER TABLE objective_settlement_events
  ADD COLUMN achievement_start date,
  ADD COLUMN achievement_end date,
  ADD CONSTRAINT objective_settlement_events_achievement_period_check CHECK (
    (achievement_start IS NULL AND achievement_end IS NULL) OR
    (achievement_start IS NOT NULL AND achievement_end IS NOT NULL AND achievement_start <= achievement_end)
  );
--> statement-breakpoint
CREATE INDEX objective_settlement_events_achievement_period_idx
ON objective_settlement_events(team_id, achievement_start, achievement_end);
--> statement-breakpoint
CREATE TABLE settlement_period_corrections (
 id text PRIMARY KEY,
 settlement_event_id text NOT NULL REFERENCES objective_settlement_events(id),
 old_start date, old_end date,
 new_start date NOT NULL, new_end date NOT NULL,
 reason text NOT NULL,
 actor_user_id uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL,
 CHECK (new_start <= new_end)
);
