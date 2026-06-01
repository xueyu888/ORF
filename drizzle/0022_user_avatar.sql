ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar_object_key" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar_mime_type" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar_updated_at" timestamp with time zone;
