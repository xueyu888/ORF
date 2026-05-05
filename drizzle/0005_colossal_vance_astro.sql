ALTER TABLE "users" ADD COLUMN "last_login_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "users"
SET "email" = concat(coalesce(nullif(trim(both '-' from regexp_replace(lower("name"), '[^a-z0-9]+', '-', 'g')), ''), "id"), '@orf.local')
WHERE "email" IS NULL OR btrim("email") = '';
--> statement-breakpoint
UPDATE "users"
SET "last_login_at" = "created_at"::timestamp with time zone
WHERE "last_login_at" IS NULL;
