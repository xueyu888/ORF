ALTER TABLE "push_devices"
  ADD COLUMN IF NOT EXISTS "device_manufacturer" text,
  ADD COLUMN IF NOT EXISTS "device_model" text,
  ADD COLUMN IF NOT EXISTS "os_version" text,
  ADD COLUMN IF NOT EXISTS "sdk_int" integer,
  ADD COLUMN IF NOT EXISTS "google_play_services_available" boolean,
  ADD COLUMN IF NOT EXISTS "notification_permission" text;
