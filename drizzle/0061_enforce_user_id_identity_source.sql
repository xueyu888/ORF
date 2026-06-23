WITH scoped_users AS (
  SELECT
    tm."team_id",
    u."id",
    u."name",
    count(*) OVER (PARTITION BY tm."team_id", u."name") AS "name_count"
  FROM "team_members" tm
  INNER JOIN "users" u ON u."id" = tm."user_id"
)
UPDATE "results" AS target
SET "definer_user_id" = scoped_users."id"
FROM scoped_users
WHERE target."definer_user_id" IS NULL
  AND target."team_id" = scoped_users."team_id"
  AND (
    target."definer" = scoped_users."id"::text
    OR (scoped_users."name_count" = 1 AND target."definer" = scoped_users."name")
  );
--> statement-breakpoint
WITH scoped_users AS (
  SELECT
    tm."team_id",
    u."id",
    u."name",
    count(*) OVER (PARTITION BY tm."team_id", u."name") AS "name_count"
  FROM "team_members" tm
  INNER JOIN "users" u ON u."id" = tm."user_id"
)
UPDATE "tasks" AS target
SET "assignee_user_id" = scoped_users."id"
FROM scoped_users
WHERE target."assignee_user_id" IS NULL
  AND target."team_id" = scoped_users."team_id"
  AND (
    target."assignee" = scoped_users."id"::text
    OR (scoped_users."name_count" = 1 AND target."assignee" = scoped_users."name")
  );
--> statement-breakpoint
WITH scoped_users AS (
  SELECT
    tm."team_id",
    u."id",
    u."name",
    count(*) OVER (PARTITION BY tm."team_id", u."name") AS "name_count"
  FROM "team_members" tm
  INNER JOIN "users" u ON u."id" = tm."user_id"
)
UPDATE "feedback" AS target
SET "owner_user_id" = scoped_users."id"
FROM scoped_users
WHERE target."owner_user_id" IS NULL
  AND target."team_id" = scoped_users."team_id"
  AND (
    target."owner" = scoped_users."id"::text
    OR (scoped_users."name_count" = 1 AND target."owner" = scoped_users."name")
  );
--> statement-breakpoint
WITH scoped_users AS (
  SELECT
    tm."team_id",
    u."id",
    u."name",
    count(*) OVER (PARTITION BY tm."team_id", u."name") AS "name_count"
  FROM "team_members" tm
  INNER JOIN "users" u ON u."id" = tm."user_id"
)
UPDATE "evidence" AS target
SET "owner_user_id" = scoped_users."id"
FROM scoped_users
WHERE target."owner_user_id" IS NULL
  AND target."team_id" = scoped_users."team_id"
  AND (
    target."owner" = scoped_users."id"::text
    OR (scoped_users."name_count" = 1 AND target."owner" = scoped_users."name")
  );
--> statement-breakpoint
WITH scoped_users AS (
  SELECT
    tm."team_id",
    u."id",
    u."name",
    count(*) OVER (PARTITION BY tm."team_id", u."name") AS "name_count"
  FROM "team_members" tm
  INNER JOIN "users" u ON u."id" = tm."user_id"
)
UPDATE "objective_loot" AS target
SET "submitted_by_user_id" = scoped_users."id"
FROM scoped_users
WHERE target."submitted_by_user_id" IS NULL
  AND target."team_id" = scoped_users."team_id"
  AND (
    target."submitted_by" = scoped_users."id"::text
    OR (scoped_users."name_count" = 1 AND target."submitted_by" = scoped_users."name")
  );
--> statement-breakpoint
WITH scoped_users AS (
  SELECT
    tm."team_id",
    u."id",
    u."name",
    count(*) OVER (PARTITION BY tm."team_id", u."name") AS "name_count"
  FROM "team_members" tm
  INNER JOIN "users" u ON u."id" = tm."user_id"
)
UPDATE "objective_trial_reviews" AS target
SET "requested_by_user_id" = scoped_users."id"
FROM scoped_users
WHERE target."requested_by_user_id" IS NULL
  AND target."team_id" = scoped_users."team_id"
  AND (
    target."requested_by" = scoped_users."id"::text
    OR (scoped_users."name_count" = 1 AND target."requested_by" = scoped_users."name")
  );
--> statement-breakpoint
WITH scoped_users AS (
  SELECT
    tm."team_id",
    u."id",
    u."name",
    count(*) OVER (PARTITION BY tm."team_id", u."name") AS "name_count"
  FROM "team_members" tm
  INNER JOIN "users" u ON u."id" = tm."user_id"
)
UPDATE "objective_alignment_requests" AS target
SET "requested_by_user_id" = scoped_users."id"
FROM scoped_users
WHERE target."requested_by_user_id" IS NULL
  AND target."team_id" = scoped_users."team_id"
  AND (
    target."requested_by" = scoped_users."id"::text
    OR (scoped_users."name_count" = 1 AND target."requested_by" = scoped_users."name")
  );
--> statement-breakpoint
WITH scoped_users AS (
  SELECT
    tm."team_id",
    u."id",
    u."name",
    count(*) OVER (PARTITION BY tm."team_id", u."name") AS "name_count"
  FROM "team_members" tm
  INNER JOIN "users" u ON u."id" = tm."user_id"
)
UPDATE "objective_contribution_reviews" AS target
SET "reviewer_user_id" = scoped_users."id"
FROM scoped_users
WHERE target."reviewer_user_id" IS NULL
  AND target."team_id" = scoped_users."team_id"
  AND (
    target."reviewer" = scoped_users."id"::text
    OR (scoped_users."name_count" = 1 AND target."reviewer" = scoped_users."name")
  );
--> statement-breakpoint
WITH scoped_users AS (
  SELECT
    tm."team_id",
    u."id",
    u."name",
    count(*) OVER (PARTITION BY tm."team_id", u."name") AS "name_count"
  FROM "team_members" tm
  INNER JOIN "users" u ON u."id" = tm."user_id"
)
UPDATE "point_ledger" AS target
SET "user_id" = scoped_users."id"
FROM scoped_users
WHERE target."user_id" IS NULL
  AND target."team_id" = scoped_users."team_id"
  AND (
    target."member_name" = scoped_users."id"::text
    OR (scoped_users."name_count" = 1 AND target."member_name" = scoped_users."name")
  );
--> statement-breakpoint
UPDATE "objectives" AS target
SET "challengers" = source."names"
FROM (
  SELECT
    objective."id",
    COALESCE(
      jsonb_agg(to_jsonb(u."name") ORDER BY item."ordinality") FILTER (WHERE u."id" IS NOT NULL),
      '[]'::jsonb
    ) AS "names"
  FROM "objectives" objective
  LEFT JOIN LATERAL jsonb_array_elements_text(COALESCE(objective."challenger_user_ids", '[]'::jsonb)) WITH ORDINALITY AS item("user_id", "ordinality") ON TRUE
  LEFT JOIN "users" u ON u."id"::text = item."user_id"
  GROUP BY objective."id"
) AS source
WHERE target."id" = source."id"
  AND target."challengers" IS DISTINCT FROM source."names";
--> statement-breakpoint
UPDATE "objectives" AS target
SET "assigned_challengers" = source."names"
FROM (
  SELECT
    objective."id",
    COALESCE(
      jsonb_agg(to_jsonb(u."name") ORDER BY item."ordinality") FILTER (WHERE u."id" IS NOT NULL),
      '[]'::jsonb
    ) AS "names"
  FROM "objectives" objective
  LEFT JOIN LATERAL jsonb_array_elements_text(COALESCE(objective."assigned_challenger_user_ids", '[]'::jsonb)) WITH ORDINALITY AS item("user_id", "ordinality") ON TRUE
  LEFT JOIN "users" u ON u."id"::text = item."user_id"
  GROUP BY objective."id"
) AS source
WHERE target."id" = source."id"
  AND target."assigned_challengers" IS DISTINCT FROM source."names";
--> statement-breakpoint
UPDATE "objectives" AS target
SET "challenge_applications" = source."applications"
FROM (
  SELECT
    objective."id",
    COALESCE(
      jsonb_agg(
        CASE
          WHEN matched_user."id" IS NULL THEN item."value"
          ELSE jsonb_set(
            jsonb_set(item."value", '{applicantUserId}', to_jsonb(matched_user."id"::text), true),
            '{applicant}',
            to_jsonb(matched_user."name"),
            true
          )
        END
        ORDER BY item."ordinality"
      ) FILTER (WHERE item."value" IS NOT NULL),
      '[]'::jsonb
    ) AS "applications"
  FROM "objectives" objective
  LEFT JOIN LATERAL jsonb_array_elements(COALESCE(objective."challenge_applications", '[]'::jsonb)) WITH ORDINALITY AS item("value", "ordinality") ON TRUE
  LEFT JOIN LATERAL (
    SELECT scoped_user."id", scoped_user."name"
    FROM (
      SELECT
        tm."team_id",
        u."id",
        u."name",
        count(*) OVER (PARTITION BY tm."team_id", u."name") AS "name_count"
      FROM "team_members" tm
      INNER JOIN "users" u ON u."id" = tm."user_id"
      WHERE tm."team_id" = objective."team_id"
    ) scoped_user
    WHERE scoped_user."id"::text = item."value"->>'applicantUserId'
      OR (scoped_user."name_count" = 1 AND scoped_user."name" = item."value"->>'applicant')
    ORDER BY CASE WHEN scoped_user."id"::text = item."value"->>'applicantUserId' THEN 0 ELSE 1 END
    LIMIT 1
  ) AS matched_user ON TRUE
  GROUP BY objective."id"
) AS source
WHERE target."id" = source."id"
  AND target."challenge_applications" IS DISTINCT FROM source."applications";
--> statement-breakpoint
UPDATE "objective_contribution_reviews" AS target
SET "allocations" = source."allocations"
FROM (
  SELECT
    review."id",
    COALESCE(
      jsonb_agg(
        CASE
          WHEN matched_user."id" IS NULL THEN item."value"
          ELSE jsonb_set(item."value", '{memberUserId}', to_jsonb(matched_user."id"::text), true)
        END
        ORDER BY item."ordinality"
      ) FILTER (WHERE item."value" IS NOT NULL),
      '[]'::jsonb
    ) AS "allocations"
  FROM "objective_contribution_reviews" review
  LEFT JOIN LATERAL jsonb_array_elements(COALESCE(review."allocations", '[]'::jsonb)) WITH ORDINALITY AS item("value", "ordinality") ON TRUE
  LEFT JOIN LATERAL (
    SELECT scoped_user."id", scoped_user."name"
    FROM (
      SELECT
        tm."team_id",
        u."id",
        u."name",
        count(*) OVER (PARTITION BY tm."team_id", u."name") AS "name_count"
      FROM "team_members" tm
      INNER JOIN "users" u ON u."id" = tm."user_id"
      WHERE tm."team_id" = review."team_id"
    ) scoped_user
    WHERE scoped_user."id"::text = item."value"->>'memberUserId'
      OR (scoped_user."name_count" = 1 AND scoped_user."name" = item."value"->>'member')
    ORDER BY CASE WHEN scoped_user."id"::text = item."value"->>'memberUserId' THEN 0 ELSE 1 END
    LIMIT 1
  ) AS matched_user ON TRUE
  GROUP BY review."id"
) AS source
WHERE target."id" = source."id"
  AND target."allocations" IS DISTINCT FROM source."allocations";
--> statement-breakpoint
UPDATE "results" AS target
SET "definer" = "users"."name"
FROM "users"
WHERE target."definer_user_id" = "users"."id"
  AND target."definer" IS DISTINCT FROM "users"."name";
--> statement-breakpoint
UPDATE "tasks" AS target
SET "assignee" = "users"."name"
FROM "users"
WHERE target."assignee_user_id" = "users"."id"
  AND target."assignee" IS DISTINCT FROM "users"."name";
--> statement-breakpoint
UPDATE "feedback" AS target
SET "owner" = "users"."name"
FROM "users"
WHERE target."owner_user_id" = "users"."id"
  AND target."owner" IS DISTINCT FROM "users"."name";
--> statement-breakpoint
UPDATE "evidence" AS target
SET "owner" = "users"."name"
FROM "users"
WHERE target."owner_user_id" = "users"."id"
  AND target."owner" IS DISTINCT FROM "users"."name";
--> statement-breakpoint
UPDATE "point_ledger" AS target
SET "member_name" = "users"."name"
FROM "users"
WHERE target."user_id" = "users"."id"
  AND target."member_name" IS DISTINCT FROM "users"."name";
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "results" WHERE "definer_user_id" IS NULL) THEN
    RAISE EXCEPTION 'User identity migration left results.definer_user_id empty';
  END IF;

  IF EXISTS (SELECT 1 FROM "tasks" WHERE "assignee_user_id" IS NULL) THEN
    RAISE EXCEPTION 'User identity migration left tasks.assignee_user_id empty';
  END IF;

  IF EXISTS (SELECT 1 FROM "feedback" WHERE "owner_user_id" IS NULL) THEN
    RAISE EXCEPTION 'User identity migration left feedback.owner_user_id empty';
  END IF;

  IF EXISTS (SELECT 1 FROM "evidence" WHERE "owner_user_id" IS NULL) THEN
    RAISE EXCEPTION 'User identity migration left evidence.owner_user_id empty';
  END IF;

  IF EXISTS (SELECT 1 FROM "objective_loot" WHERE "submitted_by_user_id" IS NULL) THEN
    RAISE EXCEPTION 'User identity migration left objective_loot.submitted_by_user_id empty';
  END IF;

  IF EXISTS (SELECT 1 FROM "objective_trial_reviews" WHERE "requested_by_user_id" IS NULL) THEN
    RAISE EXCEPTION 'User identity migration left objective_trial_reviews.requested_by_user_id empty';
  END IF;

  IF EXISTS (SELECT 1 FROM "objective_alignment_requests" WHERE "requested_by_user_id" IS NULL) THEN
    RAISE EXCEPTION 'User identity migration left objective_alignment_requests.requested_by_user_id empty';
  END IF;

  IF EXISTS (SELECT 1 FROM "objective_contribution_reviews" WHERE "reviewer_user_id" IS NULL) THEN
    RAISE EXCEPTION 'User identity migration left objective_contribution_reviews.reviewer_user_id empty';
  END IF;

  IF EXISTS (SELECT 1 FROM "point_ledger" WHERE "user_id" IS NULL) THEN
    RAISE EXCEPTION 'User identity migration left point_ledger.user_id empty';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "objectives" objective,
      jsonb_array_elements_text(COALESCE(objective."challenger_user_ids", '[]'::jsonb)) AS item("user_id")
    WHERE NOT EXISTS (
      SELECT 1
      FROM "team_members" tm
      WHERE tm."team_id" = objective."team_id" AND tm."user_id"::text = item."user_id"
    )
  ) THEN
    RAISE EXCEPTION 'User identity migration left objective challenger_user_ids outside team members';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "objectives" objective,
      jsonb_array_elements_text(COALESCE(objective."assigned_challenger_user_ids", '[]'::jsonb)) AS item("user_id")
    WHERE NOT EXISTS (
      SELECT 1
      FROM "team_members" tm
      WHERE tm."team_id" = objective."team_id" AND tm."user_id"::text = item."user_id"
    )
  ) THEN
    RAISE EXCEPTION 'User identity migration left objective assigned_challenger_user_ids outside team members';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "objectives" objective,
      jsonb_array_elements(COALESCE(objective."challenge_applications", '[]'::jsonb)) AS application("value")
    WHERE COALESCE(application."value"->>'applicantUserId', '') = ''
      OR NOT EXISTS (
        SELECT 1
        FROM "team_members" tm
        WHERE tm."team_id" = objective."team_id" AND tm."user_id"::text = application."value"->>'applicantUserId'
      )
  ) THEN
    RAISE EXCEPTION 'User identity migration left challenge application without valid applicantUserId';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "objective_contribution_reviews" review,
      jsonb_array_elements(COALESCE(review."allocations", '[]'::jsonb)) AS allocation("value")
    WHERE COALESCE(allocation."value"->>'memberUserId', '') = ''
      OR NOT EXISTS (
        SELECT 1
        FROM "team_members" tm
        WHERE tm."team_id" = review."team_id" AND tm."user_id"::text = allocation."value"->>'memberUserId'
      )
  ) THEN
    RAISE EXCEPTION 'User identity migration left contribution allocation without valid memberUserId';
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "results" ALTER COLUMN "definer_user_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "assignee_user_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "feedback" ALTER COLUMN "owner_user_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "evidence" ALTER COLUMN "owner_user_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "objective_loot" ALTER COLUMN "submitted_by_user_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "objective_trial_reviews" ALTER COLUMN "requested_by_user_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "objective_alignment_requests" ALTER COLUMN "requested_by_user_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "objective_contribution_reviews" ALTER COLUMN "reviewer_user_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "point_ledger" ALTER COLUMN "user_id" SET NOT NULL;
