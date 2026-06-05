ALTER TABLE "objectives" ADD COLUMN IF NOT EXISTS "challenger_user_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "objectives" ADD COLUMN IF NOT EXISTS "assigned_challenger_user_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "results" ADD COLUMN IF NOT EXISTS "definer_user_id" uuid REFERENCES "users"("id");
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "assignee_user_id" uuid REFERENCES "users"("id");
ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "owner_user_id" uuid REFERENCES "users"("id");
ALTER TABLE "evidence" ADD COLUMN IF NOT EXISTS "owner_user_id" uuid REFERENCES "users"("id");
ALTER TABLE "objective_loot" ADD COLUMN IF NOT EXISTS "submitted_by_user_id" uuid REFERENCES "users"("id");
ALTER TABLE "objective_trial_reviews" ADD COLUMN IF NOT EXISTS "requested_by_user_id" uuid REFERENCES "users"("id");
ALTER TABLE "objective_trial_reviews" ADD COLUMN IF NOT EXISTS "reviewed_by_user_id" uuid REFERENCES "users"("id");
ALTER TABLE "objective_alignment_requests" ADD COLUMN IF NOT EXISTS "requested_by_user_id" uuid REFERENCES "users"("id");
ALTER TABLE "objective_alignment_requests" ADD COLUMN IF NOT EXISTS "reviewed_by_user_id" uuid REFERENCES "users"("id");
ALTER TABLE "objective_contribution_reviews" ADD COLUMN IF NOT EXISTS "reviewer_user_id" uuid REFERENCES "users"("id");
--> statement-breakpoint
UPDATE "objectives" AS target
SET "challenger_user_ids" = source.user_ids
FROM (
  SELECT
    objective.id,
    COALESCE(jsonb_agg(to_jsonb(matched.user_id::text) ORDER BY matched.ordinality) FILTER (WHERE matched.user_id IS NOT NULL), '[]'::jsonb) AS user_ids
  FROM "objectives" AS objective
  LEFT JOIN LATERAL (
    SELECT item.ordinality, "users"."id" AS user_id
    FROM jsonb_array_elements_text(COALESCE(objective."challengers", '[]'::jsonb)) WITH ORDINALITY AS item("name", "ordinality")
    INNER JOIN "team_members" ON "team_members"."team_id" = objective."team_id"
    INNER JOIN "users" ON "users"."id" = "team_members"."user_id" AND "users"."name" = item."name"
  ) AS matched ON TRUE
  GROUP BY objective.id
) AS source
WHERE target.id = source.id;

UPDATE "objectives" AS target
SET "assigned_challenger_user_ids" = source.user_ids
FROM (
  SELECT
    objective.id,
    COALESCE(jsonb_agg(to_jsonb(matched.user_id::text) ORDER BY matched.ordinality) FILTER (WHERE matched.user_id IS NOT NULL), '[]'::jsonb) AS user_ids
  FROM "objectives" AS objective
  LEFT JOIN LATERAL (
    SELECT item.ordinality, "users"."id" AS user_id
    FROM jsonb_array_elements_text(COALESCE(objective."assigned_challengers", '[]'::jsonb)) WITH ORDINALITY AS item("name", "ordinality")
    INNER JOIN "team_members" ON "team_members"."team_id" = objective."team_id"
    INNER JOIN "users" ON "users"."id" = "team_members"."user_id" AND "users"."name" = item."name"
  ) AS matched ON TRUE
  GROUP BY objective.id
) AS source
WHERE target.id = source.id;

UPDATE "objectives" AS target
SET "challenge_applications" = source.applications
FROM (
  SELECT
    objective.id,
    COALESCE(
      jsonb_agg(
        CASE
          WHEN matched_user.id IS NULL THEN item.value
          ELSE jsonb_set(item.value, '{applicantUserId}', to_jsonb(matched_user.id::text), true)
        END
        ORDER BY item.ordinality
      ) FILTER (WHERE item.value IS NOT NULL),
      '[]'::jsonb
    ) AS applications
  FROM "objectives" AS objective
  LEFT JOIN LATERAL jsonb_array_elements(COALESCE(objective."challenge_applications", '[]'::jsonb)) WITH ORDINALITY AS item(value, ordinality) ON TRUE
  LEFT JOIN LATERAL (
    SELECT "users"."id"
    FROM "team_members"
    INNER JOIN "users" ON "users"."id" = "team_members"."user_id"
    WHERE "team_members"."team_id" = objective."team_id" AND "users"."name" = item.value->>'applicant'
    LIMIT 1
  ) AS matched_user ON TRUE
  GROUP BY objective.id
) AS source
WHERE target.id = source.id;

UPDATE "results" AS target
SET "definer_user_id" = "users"."id"
FROM "team_members"
INNER JOIN "users" ON "users"."id" = "team_members"."user_id"
WHERE target."team_id" = "team_members"."team_id" AND target."definer" = "users"."name" AND COALESCE(target."definer", '') <> '';

UPDATE "tasks" AS target
SET "assignee_user_id" = "users"."id"
FROM "team_members"
INNER JOIN "users" ON "users"."id" = "team_members"."user_id"
WHERE target."team_id" = "team_members"."team_id" AND target."assignee" = "users"."name" AND COALESCE(target."assignee", '') NOT IN ('', 'User', '未分配');

UPDATE "feedback" AS target
SET "owner_user_id" = "users"."id"
FROM "team_members"
INNER JOIN "users" ON "users"."id" = "team_members"."user_id"
WHERE target."team_id" = "team_members"."team_id" AND target."owner" = "users"."name" AND COALESCE(target."owner", '') <> '';

UPDATE "evidence" AS target
SET "owner_user_id" = "users"."id"
FROM "team_members"
INNER JOIN "users" ON "users"."id" = "team_members"."user_id"
WHERE target."team_id" = "team_members"."team_id" AND target."owner" = "users"."name" AND COALESCE(target."owner", '') <> '';

UPDATE "objective_loot" AS target
SET "submitted_by_user_id" = "users"."id"
FROM "team_members"
INNER JOIN "users" ON "users"."id" = "team_members"."user_id"
WHERE target."team_id" = "team_members"."team_id" AND target."submitted_by" = "users"."name" AND COALESCE(target."submitted_by", '') <> '';

UPDATE "objective_trial_reviews" AS target
SET "requested_by_user_id" = "users"."id"
FROM "team_members"
INNER JOIN "users" ON "users"."id" = "team_members"."user_id"
WHERE target."team_id" = "team_members"."team_id" AND (target."requested_by" = "users"."name" OR target."requested_by" = "users"."id"::text) AND COALESCE(target."requested_by", '') <> '';

UPDATE "objective_trial_reviews" AS target
SET "reviewed_by_user_id" = "users"."id"
FROM "team_members"
INNER JOIN "users" ON "users"."id" = "team_members"."user_id"
WHERE target."team_id" = "team_members"."team_id" AND (target."reviewed_by" = "users"."name" OR target."reviewed_by" = "users"."id"::text) AND COALESCE(target."reviewed_by", '') <> '';

UPDATE "objective_alignment_requests" AS target
SET "requested_by_user_id" = "users"."id"
FROM "team_members"
INNER JOIN "users" ON "users"."id" = "team_members"."user_id"
WHERE target."team_id" = "team_members"."team_id" AND (target."requested_by" = "users"."name" OR target."requested_by" = "users"."id"::text) AND COALESCE(target."requested_by", '') <> '';

UPDATE "objective_alignment_requests" AS target
SET "reviewed_by_user_id" = "users"."id"
FROM "team_members"
INNER JOIN "users" ON "users"."id" = "team_members"."user_id"
WHERE target."team_id" = "team_members"."team_id" AND (target."reviewed_by" = "users"."name" OR target."reviewed_by" = "users"."id"::text) AND COALESCE(target."reviewed_by", '') <> '';

UPDATE "objective_contribution_reviews" AS target
SET "reviewer_user_id" = "users"."id"
FROM "team_members"
INNER JOIN "users" ON "users"."id" = "team_members"."user_id"
WHERE target."team_id" = "team_members"."team_id" AND target."reviewer" = "users"."name" AND COALESCE(target."reviewer", '') <> '';

UPDATE "objective_contribution_reviews" AS target
SET "allocations" = source.allocations
FROM (
  SELECT
    review.id,
    COALESCE(
      jsonb_agg(
        CASE
          WHEN matched_user.id IS NULL THEN item.value
          ELSE jsonb_set(item.value, '{memberUserId}', to_jsonb(matched_user.id::text), true)
        END
        ORDER BY item.ordinality
      ) FILTER (WHERE item.value IS NOT NULL),
      '[]'::jsonb
    ) AS allocations
  FROM "objective_contribution_reviews" AS review
  LEFT JOIN LATERAL jsonb_array_elements(COALESCE(review."allocations", '[]'::jsonb)) WITH ORDINALITY AS item(value, ordinality) ON TRUE
  LEFT JOIN LATERAL (
    SELECT "users"."id"
    FROM "team_members"
    INNER JOIN "users" ON "users"."id" = "team_members"."user_id"
    WHERE "team_members"."team_id" = review."team_id" AND "users"."name" = item.value->>'member'
    LIMIT 1
  ) AS matched_user ON TRUE
  GROUP BY review.id
) AS source
WHERE target.id = source.id;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "objectives" AS objective
    WHERE jsonb_array_length(COALESCE(objective."challengers", '[]'::jsonb)) <> jsonb_array_length(COALESCE(objective."challenger_user_ids", '[]'::jsonb))
  ) THEN
    RAISE EXCEPTION 'Business participant migration left objective challenger without user id';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "objectives" AS objective
    WHERE jsonb_array_length(COALESCE(objective."assigned_challengers", '[]'::jsonb)) <> jsonb_array_length(COALESCE(objective."assigned_challenger_user_ids", '[]'::jsonb))
  ) THEN
    RAISE EXCEPTION 'Business participant migration left assigned challenger without user id';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "objectives" AS objective,
      jsonb_array_elements(COALESCE(objective."challenge_applications", '[]'::jsonb)) AS application(value)
    WHERE COALESCE(application.value->>'applicant', '') <> '' AND COALESCE(application.value->>'applicantUserId', '') = ''
  ) THEN
    RAISE EXCEPTION 'Business participant migration left challenge application without applicant user id';
  END IF;

  IF EXISTS (SELECT 1 FROM "results" WHERE COALESCE("definer", '') <> '' AND "definer_user_id" IS NULL) THEN
    RAISE EXCEPTION 'Business participant migration left result definer without user id';
  END IF;

  IF EXISTS (SELECT 1 FROM "tasks" WHERE COALESCE("assignee", '') NOT IN ('', 'User', '未分配') AND "assignee_user_id" IS NULL) THEN
    RAISE EXCEPTION 'Business participant migration left task assignee without user id';
  END IF;

  IF EXISTS (SELECT 1 FROM "feedback" WHERE COALESCE("owner", '') <> '' AND "owner_user_id" IS NULL) THEN
    RAISE EXCEPTION 'Business participant migration left feedback owner without user id';
  END IF;

  IF EXISTS (SELECT 1 FROM "evidence" WHERE COALESCE("owner", '') <> '' AND "owner_user_id" IS NULL) THEN
    RAISE EXCEPTION 'Business participant migration left evidence owner without user id';
  END IF;

  IF EXISTS (SELECT 1 FROM "objective_loot" WHERE COALESCE("submitted_by", '') <> '' AND "submitted_by_user_id" IS NULL) THEN
    RAISE EXCEPTION 'Business participant migration left objective loot submitter without user id';
  END IF;

  IF EXISTS (SELECT 1 FROM "objective_trial_reviews" WHERE COALESCE("requested_by", '') <> '' AND "requested_by_user_id" IS NULL) THEN
    RAISE EXCEPTION 'Business participant migration left trial review requester without user id';
  END IF;

  IF EXISTS (SELECT 1 FROM "objective_trial_reviews" WHERE COALESCE("reviewed_by", '') <> '' AND "reviewed_by_user_id" IS NULL) THEN
    RAISE EXCEPTION 'Business participant migration left trial review reviewer without user id';
  END IF;

  IF EXISTS (SELECT 1 FROM "objective_alignment_requests" WHERE COALESCE("requested_by", '') <> '' AND "requested_by_user_id" IS NULL) THEN
    RAISE EXCEPTION 'Business participant migration left alignment requester without user id';
  END IF;

  IF EXISTS (SELECT 1 FROM "objective_alignment_requests" WHERE COALESCE("reviewed_by", '') <> '' AND "reviewed_by_user_id" IS NULL) THEN
    RAISE EXCEPTION 'Business participant migration left alignment reviewer without user id';
  END IF;

  IF EXISTS (SELECT 1 FROM "objective_contribution_reviews" WHERE COALESCE("reviewer", '') <> '' AND "reviewer_user_id" IS NULL) THEN
    RAISE EXCEPTION 'Business participant migration left contribution reviewer without user id';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "objective_contribution_reviews" AS review,
      jsonb_array_elements(COALESCE(review."allocations", '[]'::jsonb)) AS allocation(value)
    WHERE COALESCE(allocation.value->>'member', '') <> '' AND COALESCE(allocation.value->>'memberUserId', '') = ''
  ) THEN
    RAISE EXCEPTION 'Business participant migration left contribution allocation without member user id';
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "results_definer_user_id_idx" ON "results" ("definer_user_id");
CREATE INDEX IF NOT EXISTS "tasks_assignee_user_id_idx" ON "tasks" ("assignee_user_id");
CREATE INDEX IF NOT EXISTS "feedback_owner_user_id_idx" ON "feedback" ("owner_user_id");
CREATE INDEX IF NOT EXISTS "evidence_owner_user_id_idx" ON "evidence" ("owner_user_id");
CREATE INDEX IF NOT EXISTS "objective_loot_submitted_by_user_id_idx" ON "objective_loot" ("submitted_by_user_id");
CREATE INDEX IF NOT EXISTS "objective_trial_reviews_requested_by_user_id_idx" ON "objective_trial_reviews" ("requested_by_user_id");
CREATE INDEX IF NOT EXISTS "objective_alignment_requests_requested_by_user_id_idx" ON "objective_alignment_requests" ("requested_by_user_id");
CREATE INDEX IF NOT EXISTS "objective_contribution_reviews_reviewer_user_id_idx" ON "objective_contribution_reviews" ("reviewer_user_id");
