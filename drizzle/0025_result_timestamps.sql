ALTER TABLE "results" ADD COLUMN "created_at" date;--> statement-breakpoint
ALTER TABLE "results" ADD COLUMN "updated_at" date;--> statement-breakpoint
UPDATE "results"
SET
  "created_at" = "objectives"."updated_at",
  "updated_at" = "objectives"."updated_at"
FROM "objectives"
WHERE "results"."objective_id" = "objectives"."id";--> statement-breakpoint
UPDATE "results"
SET
  "created_at" = COALESCE("created_at", CURRENT_DATE),
  "updated_at" = COALESCE("updated_at", CURRENT_DATE);--> statement-breakpoint
ALTER TABLE "results" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "results" ALTER COLUMN "updated_at" SET NOT NULL;
