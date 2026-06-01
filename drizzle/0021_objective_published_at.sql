ALTER TABLE "objectives" ADD COLUMN IF NOT EXISTS "published_at" date;
--> statement-breakpoint
UPDATE "objectives"
SET "published_at" = "updated_at"
WHERE "published_at" IS NULL
  AND "flow_status" IN ('open', 'applying', 'recruiting', 'reestimating', 'frozen', 'submitted', 'settled', 'closed');
