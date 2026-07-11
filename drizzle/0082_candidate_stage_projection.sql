CREATE OR REPLACE FUNCTION "orf_objective_stage_for_flow_status"("value" text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT CASE "value"
    WHEN 'candidate' THEN 'goalSetting'
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
UPDATE "objectives"
SET "flow_status" = "flow_status"
WHERE "flow_status" = 'candidate';
