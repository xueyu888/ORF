ALTER TABLE "objectives" ADD COLUMN IF NOT EXISTS "project_id" text;
--> statement-breakpoint
ALTER TABLE "objectives" ADD COLUMN IF NOT EXISTS "project_name" text;
