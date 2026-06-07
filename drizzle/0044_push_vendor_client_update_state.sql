ALTER TABLE "push_vendor_devices"
  ADD COLUMN IF NOT EXISTS "last_client_update_version" text,
  ADD COLUMN IF NOT EXISTS "last_client_update_pushed_at" timestamp with time zone;
