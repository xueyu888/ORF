ALTER TABLE "task_checklist_items" ADD COLUMN "updated_at" date;--> statement-breakpoint
UPDATE "task_checklist_items"
SET "updated_at" = COALESCE("tasks"."updated_at", CURRENT_DATE)
FROM "tasks"
WHERE "task_checklist_items"."task_id" = "tasks"."id";--> statement-breakpoint
UPDATE "task_checklist_items"
SET "updated_at" = CURRENT_DATE
WHERE "updated_at" IS NULL;--> statement-breakpoint
ALTER TABLE "task_checklist_items" ALTER COLUMN "updated_at" SET NOT NULL;
