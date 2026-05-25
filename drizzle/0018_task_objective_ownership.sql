UPDATE "tasks"
SET "linked_objective_id" = "results"."objective_id"
FROM "results"
WHERE "tasks"."linked_result_id" = "results"."id"
  AND "tasks"."linked_objective_id" IS DISTINCT FROM "results"."objective_id";
--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_linked_result_id_results_id_fk";
--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "linked_result_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_linked_result_id_results_id_fk" FOREIGN KEY ("linked_result_id") REFERENCES "results"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
WITH ranked_tasks AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "linked_objective_id" ORDER BY "sort_order", "id") - 1 AS "rank"
  FROM "tasks"
)
UPDATE "tasks"
SET "sort_order" = ranked_tasks."rank"
FROM ranked_tasks
WHERE "tasks"."id" = ranked_tasks."id";
