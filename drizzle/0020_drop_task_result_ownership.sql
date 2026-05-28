ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_linked_result_id_results_id_fk";
--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN IF EXISTS "linked_result_id";
