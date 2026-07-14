CREATE TABLE "work_log_classification_decisions" (
  "id" text PRIMARY KEY NOT NULL,
  "team_id" text NOT NULL,
  "entry_id" text NOT NULL,
  "operation" text NOT NULL,
  "suggested_kind" text NOT NULL,
  "suggested_target_id" text,
  "suggested_target_name" text NOT NULL,
  "suggested_confidence" real NOT NULL,
  "suggested_reason" text,
  "selected_kind" text NOT NULL,
  "selected_target_id" text,
  "selected_target_name" text NOT NULL,
  "is_match" boolean NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  CONSTRAINT "work_log_classification_decisions_team_id_teams_id_fk"
    FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE,
  CONSTRAINT "work_log_classification_decisions_entry_id_work_log_entries_id_fk"
    FOREIGN KEY ("entry_id") REFERENCES "work_log_entries"("id") ON DELETE CASCADE,
  CONSTRAINT "work_log_classification_decisions_operation_check"
    CHECK ("operation" IN ('create', 'update')),
  CONSTRAINT "work_log_classification_decisions_suggested_kind_check"
    CHECK ("suggested_kind" IN ('objective', 'category', 'newCategory', 'uncategorized')),
  CONSTRAINT "work_log_classification_decisions_confidence_check"
    CHECK ("suggested_confidence" >= 0 AND "suggested_confidence" <= 1),
  CONSTRAINT "work_log_classification_decisions_selected_kind_check"
    CHECK ("selected_kind" IN ('objective', 'category', 'uncategorized')
  )
);
--> statement-breakpoint
CREATE INDEX "work_log_classification_decisions_team_created_idx"
ON "work_log_classification_decisions" USING btree ("team_id", "created_at");
--> statement-breakpoint
CREATE INDEX "work_log_classification_decisions_entry_created_idx"
ON "work_log_classification_decisions" USING btree ("entry_id", "created_at");
