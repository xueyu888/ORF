ALTER TABLE "work_log_entries"
  ADD COLUMN "remaining_estimate_percent" integer;
--> statement-breakpoint
ALTER TABLE "work_log_entries"
  ADD CONSTRAINT "work_log_entries_remaining_estimate_percent_range"
  CHECK ("remaining_estimate_percent" IS NULL OR ("remaining_estimate_percent" >= 0 AND "remaining_estimate_percent" <= 100));
