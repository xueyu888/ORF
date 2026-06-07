CREATE TABLE IF NOT EXISTS "push_vendor_devices" (
  "id" text PRIMARY KEY NOT NULL,
  "team_id" text NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "platform" text NOT NULL,
  "vendor" text NOT NULL,
  "token_hash" text NOT NULL,
  "token" text NOT NULL,
  "app_version" text,
  "app_build" text,
  "device_label" text,
  "device_manufacturer" text,
  "device_model" text,
  "os_version" text,
  "sdk_int" integer,
  "notification_permission" text,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "last_seen_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "push_vendor_devices_team_vendor_platform_token_unique"
  ON "push_vendor_devices" USING btree ("team_id", "vendor", "platform", "token_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "push_vendor_devices_team_user_idx"
  ON "push_vendor_devices" USING btree ("team_id", "user_id", "vendor", "enabled");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "push_vendor_devices_updated_idx"
  ON "push_vendor_devices" USING btree ("updated_at");
