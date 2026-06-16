ALTER TABLE "tasks"
  ADD COLUMN IF NOT EXISTS "definition_contributor_user_ids" jsonb NOT NULL DEFAULT '[]'::jsonb;
--> statement-breakpoint
UPDATE "tasks"
SET "definition_contributor_user_ids" =
  CASE
    WHEN "created_by" IS NOT NULL AND "updated_by" IS NOT NULL AND "created_by" <> "updated_by"
      THEN jsonb_build_array("created_by"::text, "updated_by"::text)
    WHEN "created_by" IS NOT NULL
      THEN jsonb_build_array("created_by"::text)
    WHEN "updated_by" IS NOT NULL
      THEN jsonb_build_array("updated_by"::text)
    ELSE '[]'::jsonb
  END
WHERE "definition_contributor_user_ids" = '[]'::jsonb;
