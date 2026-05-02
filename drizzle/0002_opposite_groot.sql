ALTER TABLE "results" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
WITH ranked_results AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "objective_id" ORDER BY "id") - 1 AS "rank"
  FROM "results"
)
UPDATE "results"
SET "sort_order" = ranked_results."rank"
FROM ranked_results
WHERE "results"."id" = ranked_results."id";--> statement-breakpoint
WITH ranked_tasks AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "linked_result_id" ORDER BY "id") - 1 AS "rank"
  FROM "tasks"
)
UPDATE "tasks"
SET "sort_order" = ranked_tasks."rank"
FROM ranked_tasks
WHERE "tasks"."id" = ranked_tasks."id";
