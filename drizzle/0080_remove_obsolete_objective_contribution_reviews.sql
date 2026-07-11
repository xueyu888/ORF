DO $$
BEGIN
  IF to_regclass('public.objective_contribution_reviews') IS NOT NULL
    AND EXISTS (SELECT 1 FROM "objective_contribution_reviews") THEN
    RAISE EXCEPTION 'objective_contribution_reviews still contains historical data; archive it in the private settlement service before applying migration 0080';
  END IF;
END;
$$;
--> statement-breakpoint
DROP TABLE IF EXISTS "objective_contribution_reviews";
