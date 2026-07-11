ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "project_id" text;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'feedback_project_id_projects_id_fk'
  ) THEN
    ALTER TABLE "feedback"
      ADD CONSTRAINT "feedback_project_id_projects_id_fk"
      FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedback_project_idx" ON "feedback" ("team_id", "project_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "feedback_activity_events" (
  "id" text PRIMARY KEY NOT NULL,
  "team_id" text NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
  "feedback_id" text NOT NULL REFERENCES "feedback"("id") ON DELETE CASCADE,
  "actor_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "actor_name" text NOT NULL,
  "action" text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedback_activity_events_feedback_created_idx" ON "feedback_activity_events" ("feedback_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedback_activity_events_team_created_idx" ON "feedback_activity_events" ("team_id", "created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "feedback_subscriptions" (
  "team_id" text NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
  "feedback_id" text NOT NULL REFERENCES "feedback"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "mode" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "feedback_subscriptions_pkey" PRIMARY KEY ("team_id", "feedback_id", "user_id"),
  CONSTRAINT "feedback_subscriptions_mode_check" CHECK ("mode" IN ('subscribed', 'muted'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedback_subscriptions_feedback_mode_idx" ON "feedback_subscriptions" ("team_id", "feedback_id", "mode");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedback_subscriptions_user_mode_idx" ON "feedback_subscriptions" ("team_id", "user_id", "mode");
