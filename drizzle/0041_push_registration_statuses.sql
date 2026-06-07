CREATE TABLE IF NOT EXISTS "push_registration_statuses" (
  "team_id" text NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "platform" text NOT NULL,
  "status" text NOT NULL,
  "reason" text,
  "detail" text,
  "app_version" text,
  "app_build" text,
  "device_label" text,
  "device_manufacturer" text,
  "device_model" text,
  "os_version" text,
  "sdk_int" integer,
  "google_play_services_available" boolean,
  "notification_permission" text,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  PRIMARY KEY ("team_id", "user_id", "platform")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "push_registration_statuses_team_updated_idx"
  ON "push_registration_statuses" USING btree ("team_id", "updated_at");
