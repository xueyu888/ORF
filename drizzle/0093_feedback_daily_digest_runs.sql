CREATE TABLE IF NOT EXISTS "feedback_daily_digest_runs" (
  "team_id" text NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
  "assignee_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "local_date" date NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "feedback_count" integer NOT NULL DEFAULT 0,
  "notification_event_id" text REFERENCES "notification_events"("id") ON DELETE set null,
  "last_error" text,
  "attempts" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "feedback_daily_digest_runs_pk" PRIMARY KEY ("team_id", "assignee_user_id", "local_date"),
  CONSTRAINT "feedback_daily_digest_runs_status_check" CHECK ("status" IN ('pending', 'sent', 'failed')),
  CONSTRAINT "feedback_daily_digest_runs_feedback_count_check" CHECK ("feedback_count" >= 0),
  CONSTRAINT "feedback_daily_digest_runs_attempts_check" CHECK ("attempts" >= 0)
);

CREATE INDEX IF NOT EXISTS "feedback_daily_digest_runs_notification_event_idx"
  ON "feedback_daily_digest_runs" ("notification_event_id");

CREATE INDEX IF NOT EXISTS "feedback_daily_digest_runs_team_date_idx"
  ON "feedback_daily_digest_runs" ("team_id", "local_date");
