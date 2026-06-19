CREATE TABLE IF NOT EXISTS "chat_import_mappings" (
  "team_id" text NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
  "source_system" text NOT NULL,
  "source_kind" text NOT NULL,
  "source_id" text NOT NULL,
  "target_table" text NOT NULL,
  "target_id" text NOT NULL,
  "target_secondary_id" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "imported_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "chat_import_mappings_pkey" PRIMARY KEY ("team_id", "source_system", "source_kind", "source_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_import_mappings_target_idx" ON "chat_import_mappings" USING btree ("team_id", "target_table", "target_id");
