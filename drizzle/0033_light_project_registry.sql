CREATE TABLE IF NOT EXISTS "projects" (
  "id" text PRIMARY KEY NOT NULL,
  "team_id" text NOT NULL,
  "name" text NOT NULL,
  "created_at" date NOT NULL,
  "updated_at" date NOT NULL,
  "created_by" uuid,
  "updated_by" uuid
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "projects_team_name_unique" ON "projects" USING btree ("team_id","name");
--> statement-breakpoint
WITH grouped_projects AS (
  SELECT
    "project_id" AS "id",
    "team_id",
    COALESCE(NULLIF(MAX("project_name"), ''), "project_id") AS "raw_name",
    MIN("created_at") AS "created_at",
    MAX("updated_at") AS "updated_at"
  FROM "objectives"
  WHERE "project_id" IS NOT NULL AND btrim("project_id") <> ''
  GROUP BY "project_id", "team_id"
),
named_projects AS (
  SELECT
    "id",
    "team_id",
    CASE
      WHEN COUNT(*) OVER (PARTITION BY "team_id", "raw_name") > 1 THEN "raw_name" || ' (' || "id" || ')'
      ELSE "raw_name"
    END AS "name",
    "created_at",
    "updated_at"
  FROM grouped_projects
)
INSERT INTO "projects" ("id", "team_id", "name", "created_at", "updated_at")
SELECT "id", "team_id", "name", "created_at", "updated_at"
FROM named_projects
ON CONFLICT DO NOTHING;
--> statement-breakpoint
ALTER TABLE "objectives" DROP COLUMN IF EXISTS "project_name";
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "objectives" ADD CONSTRAINT "objectives_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
