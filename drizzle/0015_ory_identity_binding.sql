ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "ory_identity_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_ory_identity_id_unique" ON "users" ("ory_identity_id");
