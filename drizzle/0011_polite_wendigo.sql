UPDATE "results"
SET "uncertainty_score" = CASE "uncertainty_level"
  WHEN '入门' THEN 10
  WHEN '进阶' THEN 30
  WHEN '破局' THEN 90
  WHEN '渡劫' THEN 270
  WHEN '飞升' THEN 810
  ELSE 30
END;--> statement-breakpoint
UPDATE "objectives" AS "objective"
SET
  "final_due_at" = COALESCE(
    (
      SELECT MAX("result"."final_due_at")
      FROM "results" AS "result"
      WHERE "result"."objective_id" = "objective"."id"
        AND "result"."final_due_at" IS NOT NULL
    ),
    "objective"."final_due_at"
  ),
  "challengers" = to_jsonb(ARRAY(
    SELECT DISTINCT btrim("result"."owner")
    FROM "results" AS "result"
    WHERE "result"."objective_id" = "objective"."id"
      AND btrim("result"."owner") NOT IN ('', 'User', '未分配')
    ORDER BY 1
  )),
  "assigned_challengers" = to_jsonb(ARRAY(
    SELECT DISTINCT btrim("result"."assigned_challenger")
    FROM "results" AS "result"
    WHERE "result"."objective_id" = "objective"."id"
      AND "result"."assigned_challenger" IS NOT NULL
      AND btrim("result"."assigned_challenger") NOT IN ('', 'User', '未分配')
    ORDER BY 1
  )),
  "challenge_applications" = COALESCE(
    (
      SELECT jsonb_agg("application"."value")
      FROM "results" AS "result"
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE("result"."challenge_applications", '[]'::jsonb)) AS "application"("value")
      WHERE "result"."objective_id" = "objective"."id"
    ),
    "objective"."challenge_applications"
  ),
  "accepted_at" = COALESCE(
    "objective"."accepted_at",
    (
      SELECT MIN("result"."accepted_at")
      FROM "results" AS "result"
      WHERE "result"."objective_id" = "objective"."id"
    )
  ),
  "confirmation_due_at" = COALESCE(
    "objective"."confirmation_due_at",
    (
      SELECT MAX("result"."confirmation_due_at")
      FROM "results" AS "result"
      WHERE "result"."objective_id" = "objective"."id"
    )
  ),
  "confirmed_at" = COALESCE(
    "objective"."confirmed_at",
    (
      SELECT MIN("result"."confirmed_at")
      FROM "results" AS "result"
      WHERE "result"."objective_id" = "objective"."id"
    )
  );--> statement-breakpoint
ALTER TABLE "results" DROP COLUMN "owner";--> statement-breakpoint
ALTER TABLE "results" DROP COLUMN "final_due_at";--> statement-breakpoint
ALTER TABLE "results" DROP COLUMN "assigned_challenger";--> statement-breakpoint
ALTER TABLE "results" DROP COLUMN "accepted_at";--> statement-breakpoint
ALTER TABLE "results" DROP COLUMN "confirmation_due_at";--> statement-breakpoint
ALTER TABLE "results" DROP COLUMN "confirmed_at";--> statement-breakpoint
ALTER TABLE "results" DROP COLUMN "priority_challenge_expires_at";--> statement-breakpoint
ALTER TABLE "results" DROP COLUMN "priority_declined_by";--> statement-breakpoint
ALTER TABLE "results" DROP COLUMN "challenge_applications";
