ALTER TABLE "drive_files" ADD COLUMN IF NOT EXISTS "preview_object_key" text;
--> statement-breakpoint
ALTER TABLE "drive_files" ADD COLUMN IF NOT EXISTS "preview_mime_type" text;
--> statement-breakpoint
ALTER TABLE "drive_files" ADD COLUMN IF NOT EXISTS "preview_file_size" bigint;
--> statement-breakpoint
ALTER TABLE "drive_files" ADD COLUMN IF NOT EXISTS "preview_generated_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "drive_files" ADD COLUMN IF NOT EXISTS "preview_error" text;
--> statement-breakpoint
ALTER TABLE "drive_file_versions" ADD COLUMN IF NOT EXISTS "preview_object_key" text;
--> statement-breakpoint
ALTER TABLE "drive_file_versions" ADD COLUMN IF NOT EXISTS "preview_mime_type" text;
--> statement-breakpoint
ALTER TABLE "drive_file_versions" ADD COLUMN IF NOT EXISTS "preview_file_size" bigint;
--> statement-breakpoint
ALTER TABLE "drive_file_versions" ADD COLUMN IF NOT EXISTS "preview_generated_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "drive_file_versions" ADD COLUMN IF NOT EXISTS "preview_error" text;
