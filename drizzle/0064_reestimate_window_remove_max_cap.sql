WITH expected_reestimate_windows AS (
  SELECT
    "id",
    "accepted_at" + (
      GREATEST(
        1,
        ROUND(
          EXTRACT(
            EPOCH FROM (((("final_due_at"::timestamp + time '23:59') AT TIME ZONE 'Asia/Shanghai') - "accepted_at")) * 0.3
          ) / (12 * 60 * 60)
        )::integer
      ) * INTERVAL '12 hours'
    ) AS "expected_confirmation_due_at"
  FROM "objectives"
  WHERE "flow_status" = 'reestimating'
    AND "accepted_at" IS NOT NULL
    AND ((("final_due_at"::timestamp + time '23:59') AT TIME ZONE 'Asia/Shanghai') - "accepted_at") >= INTERVAL '12 hours'
)
UPDATE "objectives"
SET "confirmation_due_at" = expected_reestimate_windows."expected_confirmation_due_at"
FROM expected_reestimate_windows
WHERE "objectives"."id" = expected_reestimate_windows."id"
  AND "objectives"."flow_status" = 'reestimating'
  AND "objectives"."confirmation_due_at" IS DISTINCT FROM expected_reestimate_windows."expected_confirmation_due_at";
