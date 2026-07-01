ALTER TABLE "point_ledger"
  ADD COLUMN IF NOT EXISTS "settlement_period_at" timestamp with time zone DEFAULT now();

UPDATE "point_ledger" AS ledger
SET "settlement_period_at" = COALESCE(
  (
    SELECT MAX(review."reviewed_at")
    FROM "objective_acceptance_reviews" AS review
    WHERE review."objective_id" = ledger."objective_id"
      AND review."accepted_result" = 'completed'
  ),
  ledger."created_at"
)
WHERE ledger."settlement_period_at" IS NULL;

ALTER TABLE "point_ledger"
  ALTER COLUMN "settlement_period_at" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "point_ledger_team_settlement_period_at_idx"
  ON "point_ledger" ("team_id", "settlement_period_at");
