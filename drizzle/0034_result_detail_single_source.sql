ALTER TABLE "results" ADD COLUMN "detail" text;
--> statement-breakpoint
UPDATE "results"
SET "detail" = NULLIF(btrim(concat_ws(E'\n\n',
  CASE
    WHEN NULLIF(btrim(COALESCE("description", '')), '') IS NULL THEN NULL
    WHEN btrim(COALESCE("description", '')) = '由 ORF Flow 规划创建的指标。' THEN NULL
    ELSE '说明：' || btrim("description")
  END,
  CASE
    WHEN NULLIF(btrim(COALESCE("metric_requirement", '')), '') IS NULL THEN NULL
    WHEN btrim(COALESCE("metric_requirement", '')) = COALESCE("metric_name", '') || '：写清统计对象和完成标准后进入执行。' THEN NULL
    ELSE '要求：' || btrim("metric_requirement")
  END,
  CASE
    WHEN NULLIF(btrim(COALESCE("statistical_object", '')), '') IS NULL THEN NULL
    ELSE '统计对象：' || btrim("statistical_object")
  END,
  CASE
    WHEN NULLIF(btrim(COALESCE("completion_standard", '')), '') IS NULL THEN NULL
    ELSE '完成标准：' || btrim("completion_standard")
  END,
  CASE
    WHEN NULLIF(btrim(COALESCE("sample_set", '')), '') IS NULL THEN NULL
    ELSE '样本集：' || btrim("sample_set")
  END,
  CASE
    WHEN NULLIF(btrim(COALESCE("measurement_scope", '')), '') IS NULL THEN NULL
    ELSE '测量范围：' || btrim("measurement_scope")
  END
)), '');
--> statement-breakpoint
UPDATE "results" SET "detail" = COALESCE("detail", '');
--> statement-breakpoint
ALTER TABLE "results" ALTER COLUMN "detail" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "results" DROP COLUMN IF EXISTS "description";
--> statement-breakpoint
ALTER TABLE "results" DROP COLUMN IF EXISTS "metric_name";
--> statement-breakpoint
ALTER TABLE "results" DROP COLUMN IF EXISTS "metric_requirement";
--> statement-breakpoint
ALTER TABLE "results" DROP COLUMN IF EXISTS "statistical_object";
--> statement-breakpoint
ALTER TABLE "results" DROP COLUMN IF EXISTS "completion_standard";
--> statement-breakpoint
ALTER TABLE "results" DROP COLUMN IF EXISTS "sample_set";
--> statement-breakpoint
ALTER TABLE "results" DROP COLUMN IF EXISTS "measurement_scope";
