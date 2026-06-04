CREATE TEMP TABLE "__orf_user_id_migration" (
  old_id text PRIMARY KEY,
  new_id uuid NOT NULL UNIQUE
) ON COMMIT DROP;
--> statement-breakpoint
INSERT INTO "__orf_user_id_migration" (old_id, new_id)
SELECT id, gen_random_uuid()
FROM "users";
--> statement-breakpoint
ALTER TABLE "team_members" DROP CONSTRAINT IF EXISTS "team_members_user_id_users_id_fk";
ALTER TABLE "objectives" DROP CONSTRAINT IF EXISTS "objectives_created_by_users_id_fk";
ALTER TABLE "objectives" DROP CONSTRAINT IF EXISTS "objectives_updated_by_users_id_fk";
ALTER TABLE "point_ledger" DROP CONSTRAINT IF EXISTS "point_ledger_user_id_users_id_fk";
ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_recipient_user_id_fkey";
ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_actor_user_id_fkey";
ALTER TABLE "results" DROP CONSTRAINT IF EXISTS "results_created_by_users_id_fk";
ALTER TABLE "results" DROP CONSTRAINT IF EXISTS "results_updated_by_users_id_fk";
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_created_by_users_id_fk";
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_updated_by_users_id_fk";
ALTER TABLE "feedback" DROP CONSTRAINT IF EXISTS "feedback_created_by_users_id_fk";
ALTER TABLE "feedback" DROP CONSTRAINT IF EXISTS "feedback_updated_by_users_id_fk";
ALTER TABLE "evidence" DROP CONSTRAINT IF EXISTS "evidence_created_by_users_id_fk";
ALTER TABLE "evidence" DROP CONSTRAINT IF EXISTS "evidence_updated_by_users_id_fk";
ALTER TABLE "comment_threads" DROP CONSTRAINT IF EXISTS "comment_threads_created_by_users_id_fk";
ALTER TABLE "comment_messages" DROP CONSTRAINT IF EXISTS "comment_messages_author_user_id_users_id_fk";
ALTER TABLE "comment_attachments" DROP CONSTRAINT IF EXISTS "comment_attachments_created_by_fkey";
ALTER TABLE "team_members" DROP CONSTRAINT IF EXISTS "team_members_pkey";
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_pkey";
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "id_uuid" uuid;
ALTER TABLE "team_members" ADD COLUMN "user_id_uuid" uuid;
ALTER TABLE "objectives" ADD COLUMN "created_by_uuid" uuid;
ALTER TABLE "objectives" ADD COLUMN "updated_by_uuid" uuid;
ALTER TABLE "point_ledger" ADD COLUMN "user_id_uuid" uuid;
ALTER TABLE "notifications" ADD COLUMN "recipient_user_id_uuid" uuid;
ALTER TABLE "notifications" ADD COLUMN "actor_user_id_uuid" uuid;
ALTER TABLE "results" ADD COLUMN "created_by_uuid" uuid;
ALTER TABLE "results" ADD COLUMN "updated_by_uuid" uuid;
ALTER TABLE "tasks" ADD COLUMN "created_by_uuid" uuid;
ALTER TABLE "tasks" ADD COLUMN "updated_by_uuid" uuid;
ALTER TABLE "feedback" ADD COLUMN "created_by_uuid" uuid;
ALTER TABLE "feedback" ADD COLUMN "updated_by_uuid" uuid;
ALTER TABLE "evidence" ADD COLUMN "created_by_uuid" uuid;
ALTER TABLE "evidence" ADD COLUMN "updated_by_uuid" uuid;
ALTER TABLE "comment_threads" ADD COLUMN "created_by_uuid" uuid;
ALTER TABLE "comment_messages" ADD COLUMN "author_user_id_uuid" uuid;
ALTER TABLE "comment_attachments" ADD COLUMN "created_by_uuid" uuid;
--> statement-breakpoint
UPDATE "users" AS target
SET "id_uuid" = migration.new_id
FROM "__orf_user_id_migration" AS migration
WHERE target.id = migration.old_id;
UPDATE "team_members" AS target
SET "user_id_uuid" = migration.new_id
FROM "__orf_user_id_migration" AS migration
WHERE target.user_id = migration.old_id;
UPDATE "objectives" AS target
SET "created_by_uuid" = migration.new_id
FROM "__orf_user_id_migration" AS migration
WHERE target.created_by = migration.old_id;
UPDATE "objectives" AS target
SET "updated_by_uuid" = migration.new_id
FROM "__orf_user_id_migration" AS migration
WHERE target.updated_by = migration.old_id;
UPDATE "point_ledger" AS target
SET "user_id_uuid" = migration.new_id
FROM "__orf_user_id_migration" AS migration
WHERE target.user_id = migration.old_id;
UPDATE "notifications" AS target
SET "recipient_user_id_uuid" = migration.new_id
FROM "__orf_user_id_migration" AS migration
WHERE target.recipient_user_id = migration.old_id;
UPDATE "notifications" AS target
SET "actor_user_id_uuid" = migration.new_id
FROM "__orf_user_id_migration" AS migration
WHERE target.actor_user_id = migration.old_id;
UPDATE "results" AS target
SET "created_by_uuid" = migration.new_id
FROM "__orf_user_id_migration" AS migration
WHERE target.created_by = migration.old_id;
UPDATE "results" AS target
SET "updated_by_uuid" = migration.new_id
FROM "__orf_user_id_migration" AS migration
WHERE target.updated_by = migration.old_id;
UPDATE "tasks" AS target
SET "created_by_uuid" = migration.new_id
FROM "__orf_user_id_migration" AS migration
WHERE target.created_by = migration.old_id;
UPDATE "tasks" AS target
SET "updated_by_uuid" = migration.new_id
FROM "__orf_user_id_migration" AS migration
WHERE target.updated_by = migration.old_id;
UPDATE "feedback" AS target
SET "created_by_uuid" = migration.new_id
FROM "__orf_user_id_migration" AS migration
WHERE target.created_by = migration.old_id;
UPDATE "feedback" AS target
SET "updated_by_uuid" = migration.new_id
FROM "__orf_user_id_migration" AS migration
WHERE target.updated_by = migration.old_id;
UPDATE "evidence" AS target
SET "created_by_uuid" = migration.new_id
FROM "__orf_user_id_migration" AS migration
WHERE target.created_by = migration.old_id;
UPDATE "evidence" AS target
SET "updated_by_uuid" = migration.new_id
FROM "__orf_user_id_migration" AS migration
WHERE target.updated_by = migration.old_id;
UPDATE "comment_threads" AS target
SET "created_by_uuid" = migration.new_id
FROM "__orf_user_id_migration" AS migration
WHERE target.created_by = migration.old_id;
UPDATE "comment_messages" AS target
SET "author_user_id_uuid" = migration.new_id
FROM "__orf_user_id_migration" AS migration
WHERE target.author_user_id = migration.old_id;
UPDATE "comment_attachments" AS target
SET "created_by_uuid" = migration.new_id
FROM "__orf_user_id_migration" AS migration
WHERE target.created_by = migration.old_id;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "users" WHERE "id_uuid" IS NULL) THEN
    RAISE EXCEPTION 'User UUID migration left users.id_uuid empty';
  END IF;
  IF EXISTS (SELECT 1 FROM "team_members" WHERE "user_id_uuid" IS NULL) THEN
    RAISE EXCEPTION 'User UUID migration left team_members.user_id_uuid empty';
  END IF;
  IF EXISTS (SELECT 1 FROM "notifications" WHERE "recipient_user_id_uuid" IS NULL) THEN
    RAISE EXCEPTION 'User UUID migration left notifications.recipient_user_id_uuid empty';
  END IF;
  IF EXISTS (SELECT 1 FROM "comment_threads" WHERE "created_by_uuid" IS NULL) THEN
    RAISE EXCEPTION 'User UUID migration left comment_threads.created_by_uuid empty';
  END IF;
  IF EXISTS (SELECT 1 FROM "comment_messages" WHERE "author_user_id_uuid" IS NULL) THEN
    RAISE EXCEPTION 'User UUID migration left comment_messages.author_user_id_uuid empty';
  END IF;
  IF EXISTS (SELECT 1 FROM "comment_attachments" WHERE "created_by_uuid" IS NULL) THEN
    RAISE EXCEPTION 'User UUID migration left comment_attachments.created_by_uuid empty';
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "id_uuid" SET NOT NULL;
ALTER TABLE "team_members" ALTER COLUMN "user_id_uuid" SET NOT NULL;
ALTER TABLE "notifications" ALTER COLUMN "recipient_user_id_uuid" SET NOT NULL;
ALTER TABLE "comment_threads" ALTER COLUMN "created_by_uuid" SET NOT NULL;
ALTER TABLE "comment_messages" ALTER COLUMN "author_user_id_uuid" SET NOT NULL;
ALTER TABLE "comment_attachments" ALTER COLUMN "created_by_uuid" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "id";
ALTER TABLE "users" RENAME COLUMN "id_uuid" TO "id";
ALTER TABLE "team_members" DROP COLUMN "user_id";
ALTER TABLE "team_members" RENAME COLUMN "user_id_uuid" TO "user_id";
ALTER TABLE "objectives" DROP COLUMN "created_by";
ALTER TABLE "objectives" RENAME COLUMN "created_by_uuid" TO "created_by";
ALTER TABLE "objectives" DROP COLUMN "updated_by";
ALTER TABLE "objectives" RENAME COLUMN "updated_by_uuid" TO "updated_by";
ALTER TABLE "point_ledger" DROP COLUMN "user_id";
ALTER TABLE "point_ledger" RENAME COLUMN "user_id_uuid" TO "user_id";
ALTER TABLE "notifications" DROP COLUMN "recipient_user_id";
ALTER TABLE "notifications" RENAME COLUMN "recipient_user_id_uuid" TO "recipient_user_id";
ALTER TABLE "notifications" DROP COLUMN "actor_user_id";
ALTER TABLE "notifications" RENAME COLUMN "actor_user_id_uuid" TO "actor_user_id";
ALTER TABLE "results" DROP COLUMN "created_by";
ALTER TABLE "results" RENAME COLUMN "created_by_uuid" TO "created_by";
ALTER TABLE "results" DROP COLUMN "updated_by";
ALTER TABLE "results" RENAME COLUMN "updated_by_uuid" TO "updated_by";
ALTER TABLE "tasks" DROP COLUMN "created_by";
ALTER TABLE "tasks" RENAME COLUMN "created_by_uuid" TO "created_by";
ALTER TABLE "tasks" DROP COLUMN "updated_by";
ALTER TABLE "tasks" RENAME COLUMN "updated_by_uuid" TO "updated_by";
ALTER TABLE "feedback" DROP COLUMN "created_by";
ALTER TABLE "feedback" RENAME COLUMN "created_by_uuid" TO "created_by";
ALTER TABLE "feedback" DROP COLUMN "updated_by";
ALTER TABLE "feedback" RENAME COLUMN "updated_by_uuid" TO "updated_by";
ALTER TABLE "evidence" DROP COLUMN "created_by";
ALTER TABLE "evidence" RENAME COLUMN "created_by_uuid" TO "created_by";
ALTER TABLE "evidence" DROP COLUMN "updated_by";
ALTER TABLE "evidence" RENAME COLUMN "updated_by_uuid" TO "updated_by";
ALTER TABLE "comment_threads" DROP COLUMN "created_by";
ALTER TABLE "comment_threads" RENAME COLUMN "created_by_uuid" TO "created_by";
ALTER TABLE "comment_messages" DROP COLUMN "author_user_id";
ALTER TABLE "comment_messages" RENAME COLUMN "author_user_id_uuid" TO "author_user_id";
ALTER TABLE "comment_attachments" DROP COLUMN "created_by";
ALTER TABLE "comment_attachments" RENAME COLUMN "created_by_uuid" TO "created_by";
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_pkey" PRIMARY KEY ("team_id", "user_id");
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "objectives" ADD CONSTRAINT "objectives_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id");
ALTER TABLE "objectives" ADD CONSTRAINT "objectives_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "users"("id");
ALTER TABLE "point_ledger" ADD CONSTRAINT "point_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id");
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "results" ADD CONSTRAINT "results_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id");
ALTER TABLE "results" ADD CONSTRAINT "results_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "users"("id");
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id");
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "users"("id");
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id");
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "users"("id");
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id");
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "users"("id");
ALTER TABLE "comment_threads" ADD CONSTRAINT "comment_threads_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id");
ALTER TABLE "comment_messages" ADD CONSTRAINT "comment_messages_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "users"("id");
ALTER TABLE "comment_attachments" ADD CONSTRAINT "comment_attachments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_recipient_created_at_idx" ON "notifications" ("recipient_user_id", "created_at");
CREATE INDEX IF NOT EXISTS "notifications_recipient_unread_idx" ON "notifications" ("recipient_user_id", "read_at");
CREATE INDEX IF NOT EXISTS "comment_attachments_pending_creator_idx" ON "comment_attachments" ("created_by", "target_type", "target_id", "expires_at");
