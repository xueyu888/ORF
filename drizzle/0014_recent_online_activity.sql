ALTER TABLE "users" DROP COLUMN IF EXISTS "last_login_at";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_online_at" timestamp with time zone;
