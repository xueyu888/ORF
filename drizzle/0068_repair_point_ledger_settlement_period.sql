WITH expected_ledger_periods AS (
  SELECT
    ledger."id",
    COALESCE(MAX(review."reviewed_at"), ledger."created_at") AS "expected_settlement_period_at"
  FROM "point_ledger" AS ledger
  LEFT JOIN "objective_acceptance_reviews" AS review
    ON review."objective_id" = ledger."objective_id"
   AND review."accepted_result" = 'completed'
  GROUP BY ledger."id", ledger."created_at"
)
UPDATE "point_ledger" AS ledger
SET "settlement_period_at" = expected_ledger_periods."expected_settlement_period_at"
FROM expected_ledger_periods
WHERE ledger."id" = expected_ledger_periods."id"
  AND ledger."settlement_period_at" IS DISTINCT FROM expected_ledger_periods."expected_settlement_period_at";
