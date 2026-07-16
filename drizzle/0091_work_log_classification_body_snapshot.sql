ALTER TABLE "work_log_classification_decisions"
ADD COLUMN "body_markdown_snapshot" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "work_log_classification_decisions"
ALTER COLUMN "body_markdown_snapshot" DROP DEFAULT;
