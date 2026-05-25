WITH non_member_names AS (
  SELECT tm."team_id", u."name"
  FROM "team_members" tm
  INNER JOIN "users" u ON u."id" = tm."user_id"
  WHERE tm."role" <> 'member'
)
UPDATE "objectives" o
SET
  "challengers" = COALESCE(
    (
      SELECT jsonb_agg(challenger."name" ORDER BY challenger."ord")
      FROM jsonb_array_elements_text(o."challengers") WITH ORDINALITY AS challenger("name", "ord")
      WHERE NOT EXISTS (
        SELECT 1
        FROM non_member_names n
        WHERE n."team_id" = o."team_id"
          AND n."name" = challenger."name"
      )
    ),
    '[]'::jsonb
  ),
  "assigned_challengers" = COALESCE(
    (
      SELECT jsonb_agg(challenger."name" ORDER BY challenger."ord")
      FROM jsonb_array_elements_text(o."assigned_challengers") WITH ORDINALITY AS challenger("name", "ord")
      WHERE NOT EXISTS (
        SELECT 1
        FROM non_member_names n
        WHERE n."team_id" = o."team_id"
          AND n."name" = challenger."name"
      )
    ),
    '[]'::jsonb
  ),
  "challenge_applications" = COALESCE(
    (
      SELECT jsonb_agg(application."value" ORDER BY application."ord")
      FROM jsonb_array_elements(o."challenge_applications") WITH ORDINALITY AS application("value", "ord")
      WHERE NOT EXISTS (
        SELECT 1
        FROM non_member_names n
        WHERE n."team_id" = o."team_id"
          AND n."name" = application."value"->>'applicant'
      )
    ),
    '[]'::jsonb
  )
WHERE EXISTS (
  SELECT 1
  FROM non_member_names n
  WHERE n."team_id" = o."team_id"
    AND (
      o."challengers" ? n."name"
      OR o."assigned_challengers" ? n."name"
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements(o."challenge_applications") AS application("value")
        WHERE application."value"->>'applicant' = n."name"
      )
    )
);
--> statement-breakpoint
WITH invalid_totals AS (
  SELECT pl."team_id", pl."objective_id", SUM(pl."points") AS invalid_points
  FROM "point_ledger" pl
  INNER JOIN "users" u ON u."name" = pl."member_name"
  INNER JOIN "team_members" tm ON tm."team_id" = pl."team_id" AND tm."user_id" = u."id"
  WHERE tm."role" <> 'member'
  GROUP BY pl."team_id", pl."objective_id"
),
valid_totals AS (
  SELECT pl."team_id", pl."objective_id", SUM(pl."points") AS valid_points, COUNT(*) AS valid_count
  FROM "point_ledger" pl
  INNER JOIN "users" u ON u."name" = pl."member_name"
  INNER JOIN "team_members" tm ON tm."team_id" = pl."team_id" AND tm."user_id" = u."id"
  WHERE tm."role" = 'member'
  GROUP BY pl."team_id", pl."objective_id"
)
UPDATE "point_ledger" pl
SET "points" = CASE
  WHEN valid_totals.valid_points > 0
    THEN (pl."points" + invalid_totals.invalid_points * pl."points" / valid_totals.valid_points)::real
  ELSE (pl."points" + invalid_totals.invalid_points / valid_totals.valid_count)::real
END
FROM invalid_totals
INNER JOIN valid_totals
  ON valid_totals."team_id" = invalid_totals."team_id"
  AND valid_totals."objective_id" = invalid_totals."objective_id"
, "users" u
, "team_members" tm
WHERE pl."team_id" = invalid_totals."team_id"
  AND pl."objective_id" = invalid_totals."objective_id"
  AND u."name" = pl."member_name"
  AND tm."team_id" = pl."team_id"
  AND tm."user_id" = u."id"
  AND tm."role" = 'member';
--> statement-breakpoint
DELETE FROM "point_ledger" pl
USING "users" u, "team_members" tm
WHERE u."name" = pl."member_name"
  AND tm."team_id" = pl."team_id"
  AND tm."user_id" = u."id"
  AND tm."role" <> 'member';
--> statement-breakpoint
WITH non_member_names AS (
  SELECT tm."team_id", u."name"
  FROM "team_members" tm
  INNER JOIN "users" u ON u."id" = tm."user_id"
  WHERE tm."role" <> 'member'
)
DELETE FROM "objective_contribution_reviews" review
USING non_member_names n
WHERE n."team_id" = review."team_id"
  AND n."name" = review."reviewer";
--> statement-breakpoint
WITH non_member_names AS (
  SELECT tm."team_id", u."name"
  FROM "team_members" tm
  INNER JOIN "users" u ON u."id" = tm."user_id"
  WHERE tm."role" <> 'member'
)
UPDATE "objective_contribution_reviews" review
SET "allocations" = COALESCE(
  (
    SELECT jsonb_agg(allocation."value" ORDER BY allocation."ord")
    FROM jsonb_array_elements(review."allocations") WITH ORDINALITY AS allocation("value", "ord")
    WHERE NOT EXISTS (
      SELECT 1
      FROM non_member_names n
      WHERE n."team_id" = review."team_id"
        AND n."name" = allocation."value"->>'member'
    )
  ),
  '[]'::jsonb
)
WHERE EXISTS (
  SELECT 1
  FROM non_member_names n
  WHERE n."team_id" = review."team_id"
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(review."allocations") AS allocation("value")
      WHERE allocation."value"->>'member' = n."name"
    )
);
--> statement-breakpoint
WITH objective_state AS (
  SELECT
    o."id",
    CASE
      WHEN jsonb_array_length(o."challengers") > 0 THEN 'reestimating'
      WHEN jsonb_array_length(o."assigned_challengers") > 0 THEN 'recruiting'
      WHEN EXISTS (
        SELECT 1
        FROM jsonb_array_elements(o."challenge_applications") AS application("value")
        WHERE application."value"->>'status' = 'pending'
      ) THEN 'applying'
      ELSE 'open'
    END AS next_flow_status
  FROM "objectives" o
  WHERE o."flow_status" IN ('applying', 'recruiting', 'reestimating', 'frozen')
    AND jsonb_array_length(o."challengers") = 0
    AND o."loot_submitted_at" IS NULL
)
UPDATE "objectives" o
SET
  "flow_status" = objective_state.next_flow_status,
  "stage" = CASE
    WHEN objective_state.next_flow_status = 'reestimating' THEN 'orfReestimate'
    ELSE 'resultClaiming'
  END,
  "accepted_at" = NULL,
  "confirmation_due_at" = NULL,
  "confirmed_at" = NULL
FROM objective_state
WHERE o."id" = objective_state."id"
  AND o."flow_status" IS DISTINCT FROM objective_state.next_flow_status;
