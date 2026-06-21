CREATE TABLE IF NOT EXISTS "work_log_reminder_states" (
  "team_id" text NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "status" text NOT NULL,
  "window_start_date" date NOT NULL,
  "window_end_date" date NOT NULL,
  "required_dates" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "missing_dates" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "last_reminded_at" timestamp with time zone,
  "next_remind_at" timestamp with time zone,
  "snooze_count" integer NOT NULL DEFAULT 0,
  "notification_event_id" text REFERENCES "notification_events"("id") ON DELETE set null,
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "work_log_reminder_states_pk" PRIMARY KEY ("team_id", "user_id"),
  CONSTRAINT "work_log_reminder_states_status_check" CHECK ("status" IN ('active', 'resolved')),
  CONSTRAINT "work_log_reminder_states_required_dates_array_check" CHECK (jsonb_typeof("required_dates") = 'array'),
  CONSTRAINT "work_log_reminder_states_missing_dates_array_check" CHECK (jsonb_typeof("missing_dates") = 'array'),
  CONSTRAINT "work_log_reminder_states_snooze_count_check" CHECK ("snooze_count" >= 0)
);

CREATE INDEX IF NOT EXISTS "work_log_reminder_states_status_next_remind_at_idx"
  ON "work_log_reminder_states" ("status", "next_remind_at");

CREATE INDEX IF NOT EXISTS "work_log_reminder_states_notification_event_idx"
  ON "work_log_reminder_states" ("notification_event_id");
