CREATE OR REPLACE FUNCTION "orf_objective_stage_for_flow_status"("value" text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT CASE "value"
    WHEN 'candidate' THEN 'orfReestimate'
    WHEN 'open' THEN 'resultClaiming'
    WHEN 'applying' THEN 'resultClaiming'
    WHEN 'recruiting' THEN 'resultClaiming'
    WHEN 'reestimating' THEN 'orfReestimate'
    WHEN 'frozen' THEN 'goalFrozen'
    WHEN 'submitted' THEN 'goalFrozen'
    WHEN 'revisionRequired' THEN 'goalFrozen'
    WHEN 'accepted' THEN 'goalFrozen'
    WHEN 'settled' THEN 'goalFrozen'
    WHEN 'closed' THEN 'goalFrozen'
    ELSE NULL
  END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "orf_enforce_objective_lifecycle_participants"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  derived_stage text;
BEGIN
  derived_stage := "orf_objective_stage_for_flow_status"(NEW."flow_status");
  IF derived_stage IS NULL THEN
    RAISE EXCEPTION 'Unsupported objective flow status: %', NEW."flow_status";
  END IF;
  NEW."stage" := derived_stage;

  IF jsonb_typeof(NEW."challenger_user_ids") <> 'array'
    OR jsonb_typeof(NEW."assigned_challenger_user_ids") <> 'array'
    OR jsonb_typeof(NEW."challenge_applications") <> 'array' THEN
    RAISE EXCEPTION 'Objective participant fields must be JSON arrays';
  END IF;

  IF jsonb_array_length(NEW."challenger_user_ids") <>
    (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(NEW."challenger_user_ids") AS item(value)) THEN
    RAISE EXCEPTION 'Objective challenger user ids must be unique';
  END IF;
  IF jsonb_array_length(NEW."assigned_challenger_user_ids") <>
    (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(NEW."assigned_challenger_user_ids") AS item(value)) THEN
    RAISE EXCEPTION 'Objective assigned challenger user ids must be unique';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(NEW."challenger_user_ids") AS item(user_id)
    LEFT JOIN "team_members" member
      ON member."team_id" = NEW."team_id" AND member."user_id"::text = item.user_id
    WHERE member."user_id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Objective challenger must be a member of the objective team';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(NEW."assigned_challenger_user_ids") AS item(user_id)
    LEFT JOIN "team_members" member
      ON member."team_id" = NEW."team_id" AND member."user_id"::text = item.user_id
    WHERE member."user_id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Objective assigned challenger must be a member of the objective team';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(NEW."challenger_user_ids") AS challenger(user_id)
    JOIN jsonb_array_elements_text(NEW."assigned_challenger_user_ids") AS assigned(user_id)
      USING (user_id)
  ) THEN
    RAISE EXCEPTION 'Objective challenger cannot also be assigned';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(NEW."challenge_applications") AS application(value)
    WHERE jsonb_typeof(application.value) <> 'object'
      OR COALESCE(application.value->>'id', '') = ''
      OR COALESCE(application.value->>'applicantUserId', '') = ''
      OR COALESCE(application.value->>'status', '') NOT IN ('pending', 'approved', 'declined')
  ) THEN
    RAISE EXCEPTION 'Objective challenge application is invalid';
  END IF;
  IF jsonb_array_length(NEW."challenge_applications") <>
    (SELECT count(DISTINCT application.value->>'id') FROM jsonb_array_elements(NEW."challenge_applications") AS application(value)) THEN
    RAISE EXCEPTION 'Objective challenge application ids must be unique';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(NEW."challenge_applications") AS application(value)
    LEFT JOIN "team_members" member
      ON member."team_id" = NEW."team_id" AND member."user_id"::text = application.value->>'applicantUserId'
    WHERE member."user_id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Objective challenge applicant must be a member of the objective team';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(member_user."name") ORDER BY item.ordinality), '[]'::jsonb)
  INTO NEW."challengers"
  FROM jsonb_array_elements_text(NEW."challenger_user_ids") WITH ORDINALITY AS item(user_id, ordinality)
  JOIN "users" member_user ON member_user."id"::text = item.user_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(member_user."name") ORDER BY item.ordinality), '[]'::jsonb)
  INTO NEW."assigned_challengers"
  FROM jsonb_array_elements_text(NEW."assigned_challenger_user_ids") WITH ORDINALITY AS item(user_id, ordinality)
  JOIN "users" member_user ON member_user."id"::text = item.user_id;

  SELECT COALESCE(
    jsonb_agg(jsonb_set(application.value, '{applicant}', to_jsonb(member_user."name"), true) ORDER BY application.ordinality),
    '[]'::jsonb
  )
  INTO NEW."challenge_applications"
  FROM jsonb_array_elements(NEW."challenge_applications") WITH ORDINALITY AS application(value, ordinality)
  JOIN "users" member_user ON member_user."id"::text = application.value->>'applicantUserId';

  RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "objectives_enforce_lifecycle_participants" ON "objectives";
--> statement-breakpoint
CREATE TRIGGER "objectives_enforce_lifecycle_participants"
BEFORE INSERT OR UPDATE OF "team_id", "flow_status", "stage", "challenger_user_ids", "assigned_challenger_user_ids", "challenge_applications"
ON "objectives"
FOR EACH ROW
EXECUTE FUNCTION "orf_enforce_objective_lifecycle_participants"();
--> statement-breakpoint
UPDATE "objectives"
SET
  "flow_status" = "flow_status",
  "challenger_user_ids" = "challenger_user_ids",
  "assigned_challenger_user_ids" = "assigned_challenger_user_ids",
  "challenge_applications" = "challenge_applications";
--> statement-breakpoint
ALTER TABLE "objectives"
DROP CONSTRAINT IF EXISTS "objectives_stage_matches_flow_status";
--> statement-breakpoint
ALTER TABLE "objectives"
ADD CONSTRAINT "objectives_stage_matches_flow_status"
CHECK ("stage" = "orf_objective_stage_for_flow_status"("flow_status"));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "orf_refresh_objective_participant_names"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE "objectives"
  SET "challenger_user_ids" = "challenger_user_ids"
  WHERE "challenger_user_ids" ? NEW."id"::text
    OR "assigned_challenger_user_ids" ? NEW."id"::text
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements("challenge_applications") AS application(value)
      WHERE application.value->>'applicantUserId' = NEW."id"::text
    );
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "users_refresh_objective_participant_names" ON "users";
--> statement-breakpoint
CREATE TRIGGER "users_refresh_objective_participant_names"
AFTER UPDATE OF "name" ON "users"
FOR EACH ROW
WHEN (OLD."name" IS DISTINCT FROM NEW."name")
EXECUTE FUNCTION "orf_refresh_objective_participant_names"();
