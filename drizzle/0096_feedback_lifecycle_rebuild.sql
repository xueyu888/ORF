DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'feedback_stage') THEN
    CREATE TYPE "feedback_stage" AS ENUM ('open', 'in_progress', 'pending_verification', 'closed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'feedback_resolution') THEN
    CREATE TYPE "feedback_resolution" AS ENUM ('resolved', 'not_needed', 'cannot_resolve', 'duplicate', 'unspecified');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'feedback_impact') THEN
    CREATE TYPE "feedback_impact" AS ENUM ('low', 'medium', 'high', 'critical');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'feedback_priority') THEN
    CREATE TYPE "feedback_priority" AS ENUM ('p0', 'p1', 'p2', 'p3');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'feedback_relation_type') THEN
    CREATE TYPE "feedback_relation_type" AS ENUM ('related', 'duplicates', 'blocks');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'feedback_activity_type') THEN
    CREATE TYPE "feedback_activity_type" AS ENUM (
      'feedback.created',
      'feedback.metadata.changed',
      'feedback.assignee.changed',
      'feedback.lifecycle.changed',
      'feedback.relation.added',
      'feedback.relation.removed',
      'feedback.comment.created',
      'feedback.comment.edited',
      'feedback.report.changed',
      'feedback.imported'
    );
  END IF;
END $$;

ALTER TABLE "feedback" DROP CONSTRAINT IF EXISTS "feedback_owner_user_id_users_id_fk";
ALTER TABLE "feedback" DROP CONSTRAINT IF EXISTS "feedback_created_by_users_id_fk";
ALTER TABLE "feedback" DROP CONSTRAINT IF EXISTS "feedback_updated_by_users_id_fk";

ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "title" text;
ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "description" text;
ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "stage" "feedback_stage";
ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "resolution" "feedback_resolution";
ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "priority" "feedback_priority";
ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "assignee_user_id" uuid;
ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "version" integer;
ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "closed_at" timestamptz;
ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "closed_by_user_id" uuid;

CREATE TEMP TABLE "_feedback_report_source_messages" ON COMMIT DROP AS
SELECT DISTINCT ON (ct.target_id)
  ct.target_id AS feedback_id,
  cm.id AS message_id,
  cm.body,
  cm.created_at
FROM "comment_threads" ct
JOIN "comment_messages" cm ON cm.thread_id = ct.id
WHERE ct.target_type = 'feedback'
ORDER BY ct.target_id, cm.sort_order, cm.created_at, cm.id;

UPDATE "feedback" f
SET
  "title" = COALESCE(NULLIF(f."title", ''), NULLIF(f."phenomenon", ''), f."id"),
  "description" = COALESCE(NULLIF(f."description", ''), NULLIF(src.body, ''), NULLIF(f."suggested_adjustment", ''), NULLIF(f."phenomenon", ''), f."id"),
  "stage" = COALESCE(
    f."stage",
    CASE WHEN f."status"::text = 'Closed' THEN 'closed'::"feedback_stage" ELSE 'open'::"feedback_stage" END
  ),
  "resolution" = COALESCE(
    f."resolution",
    CASE WHEN f."status"::text = 'Closed' THEN 'unspecified'::"feedback_resolution" ELSE NULL END
  ),
  "assignee_user_id" = COALESCE(f."assignee_user_id", f."owner_user_id"),
  "version" = COALESCE(f."version", 0),
  "closed_at" = CASE
    WHEN COALESCE(f."stage", CASE WHEN f."status"::text = 'Closed' THEN 'closed'::"feedback_stage" ELSE 'open'::"feedback_stage" END) = 'closed'
      THEN COALESCE(f."closed_at", f."updated_at"::timestamptz)
    ELSE NULL
  END,
  "closed_by_user_id" = CASE
    WHEN COALESCE(f."stage", CASE WHEN f."status"::text = 'Closed' THEN 'closed'::"feedback_stage" ELSE 'open'::"feedback_stage" END) = 'closed'
      THEN COALESCE(f."closed_by_user_id", f."updated_by", f."created_by", f."owner_user_id")
    ELSE NULL
  END,
  "created_by" = COALESCE(f."created_by", f."owner_user_id"),
  "updated_by" = COALESCE(f."updated_by", f."created_by", f."owner_user_id")
FROM "_feedback_report_source_messages" src
WHERE src.feedback_id = f.id;

UPDATE "feedback" f
SET
  "title" = COALESCE(NULLIF(f."title", ''), NULLIF(f."phenomenon", ''), f."id"),
  "description" = COALESCE(NULLIF(f."description", ''), NULLIF(f."suggested_adjustment", ''), NULLIF(f."phenomenon", ''), f."id"),
  "stage" = COALESCE(
    f."stage",
    CASE WHEN f."status"::text = 'Closed' THEN 'closed'::"feedback_stage" ELSE 'open'::"feedback_stage" END
  ),
  "resolution" = COALESCE(
    f."resolution",
    CASE WHEN f."status"::text = 'Closed' THEN 'unspecified'::"feedback_resolution" ELSE NULL END
  ),
  "assignee_user_id" = COALESCE(f."assignee_user_id", f."owner_user_id"),
  "version" = COALESCE(f."version", 0),
  "closed_at" = CASE
    WHEN COALESCE(f."stage", CASE WHEN f."status"::text = 'Closed' THEN 'closed'::"feedback_stage" ELSE 'open'::"feedback_stage" END) = 'closed'
      THEN COALESCE(f."closed_at", f."updated_at"::timestamptz)
    ELSE NULL
  END,
  "closed_by_user_id" = CASE
    WHEN COALESCE(f."stage", CASE WHEN f."status"::text = 'Closed' THEN 'closed'::"feedback_stage" ELSE 'open'::"feedback_stage" END) = 'closed'
      THEN COALESCE(f."closed_by_user_id", f."updated_by", f."created_by", f."owner_user_id")
    ELSE NULL
  END,
  "created_by" = COALESCE(f."created_by", f."owner_user_id"),
  "updated_by" = COALESCE(f."updated_by", f."created_by", f."owner_user_id")
WHERE f.id NOT IN (SELECT feedback_id FROM "_feedback_report_source_messages");

ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "impact_next" "feedback_impact";
UPDATE "feedback"
SET "impact_next" = CASE "impact"::text
  WHEN 'Critical' THEN 'critical'::"feedback_impact"
  WHEN 'High' THEN 'high'::"feedback_impact"
  WHEN 'Medium' THEN 'medium'::"feedback_impact"
  WHEN 'Low' THEN 'low'::"feedback_impact"
  ELSE 'medium'::"feedback_impact"
END
WHERE "impact_next" IS NULL;

ALTER TABLE "feedback" DROP COLUMN IF EXISTS "impact";
ALTER TABLE "feedback" RENAME COLUMN "impact_next" TO "impact";

ALTER TABLE "feedback" ALTER COLUMN "created_at" TYPE timestamptz USING "created_at"::timestamptz;
ALTER TABLE "feedback" ALTER COLUMN "updated_at" TYPE timestamptz USING "updated_at"::timestamptz;

ALTER TABLE "feedback" ALTER COLUMN "title" SET NOT NULL;
ALTER TABLE "feedback" ALTER COLUMN "description" SET NOT NULL;
ALTER TABLE "feedback" ALTER COLUMN "stage" SET DEFAULT 'open';
ALTER TABLE "feedback" ALTER COLUMN "stage" SET NOT NULL;
ALTER TABLE "feedback" ALTER COLUMN "impact" SET DEFAULT 'medium';
ALTER TABLE "feedback" ALTER COLUMN "impact" SET NOT NULL;
ALTER TABLE "feedback" ALTER COLUMN "created_by" SET NOT NULL;
ALTER TABLE "feedback" ALTER COLUMN "version" SET DEFAULT 0;
ALTER TABLE "feedback" ALTER COLUMN "version" SET NOT NULL;
ALTER TABLE "feedback" ALTER COLUMN "created_at" SET NOT NULL;
ALTER TABLE "feedback" ALTER COLUMN "updated_at" SET NOT NULL;

ALTER TABLE "feedback" DROP COLUMN IF EXISTS "phenomenon";
ALTER TABLE "feedback" DROP COLUMN IF EXISTS "suggested_adjustment";
ALTER TABLE "feedback" DROP COLUMN IF EXISTS "status";
ALTER TABLE "feedback" DROP COLUMN IF EXISTS "owner";
ALTER TABLE "feedback" DROP COLUMN IF EXISTS "owner_user_id";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feedback_created_by_users_id_fk') THEN
    ALTER TABLE "feedback" ADD CONSTRAINT "feedback_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE restrict;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feedback_updated_by_users_id_fk') THEN
    ALTER TABLE "feedback" ADD CONSTRAINT "feedback_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE set null;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feedback_assignee_user_id_users_id_fk') THEN
    ALTER TABLE "feedback" ADD CONSTRAINT "feedback_assignee_user_id_users_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "users"("id") ON DELETE set null;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feedback_closed_by_user_id_users_id_fk') THEN
    ALTER TABLE "feedback" ADD CONSTRAINT "feedback_closed_by_user_id_users_id_fk" FOREIGN KEY ("closed_by_user_id") REFERENCES "users"("id") ON DELETE set null;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feedback_lifecycle_invariant_check') THEN
    ALTER TABLE "feedback" ADD CONSTRAINT "feedback_lifecycle_invariant_check" CHECK (
      (
        "stage" in ('open', 'in_progress')
        and "resolution" is null
        and "closed_at" is null
        and "closed_by_user_id" is null
      )
      or (
        "stage" = 'pending_verification'
        and "resolution" is not null
        and "closed_at" is null
        and "closed_by_user_id" is null
      )
      or (
        "stage" = 'closed'
        and "resolution" is not null
        and "closed_at" is not null
        and "closed_by_user_id" is not null
      )
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feedback_version_non_negative_check') THEN
    ALTER TABLE "feedback" ADD CONSTRAINT "feedback_version_non_negative_check" CHECK ("version" >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "feedback_assignee_stage_idx" ON "feedback" ("team_id", "assignee_user_id", "stage");
CREATE INDEX IF NOT EXISTS "feedback_created_by_stage_idx" ON "feedback" ("team_id", "created_by", "stage");
CREATE INDEX IF NOT EXISTS "feedback_project_idx" ON "feedback" ("team_id", "project_id");
CREATE INDEX IF NOT EXISTS "feedback_team_stage_updated_idx" ON "feedback" ("team_id", "stage", "updated_at");
CREATE INDEX IF NOT EXISTS "feedback_team_updated_idx" ON "feedback" ("team_id", "updated_at");

ALTER TABLE "feedback_cause_categories" ADD COLUMN IF NOT EXISTS "team_id" text;
UPDATE "feedback_cause_categories" c
SET "team_id" = f."team_id"
FROM "feedback" f
WHERE c."feedback_id" = f."id"
  AND c."team_id" IS NULL;
ALTER TABLE "feedback_cause_categories" ALTER COLUMN "team_id" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "feedback_cause_categories_team_category_idx" ON "feedback_cause_categories" ("team_id", "category");

CREATE TABLE IF NOT EXISTS "feedback_report_attachments" (
  "id" text PRIMARY KEY,
  "team_id" text NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
  "feedback_id" text NOT NULL REFERENCES "feedback"("id") ON DELETE cascade,
  "object_key" text NOT NULL,
  "file_name" text NOT NULL,
  "mime_type" text NOT NULL,
  "file_size" bigint NOT NULL,
  "width" integer,
  "height" integer,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamptz NOT NULL,
  "source_comment_attachment_id" text
);
CREATE INDEX IF NOT EXISTS "feedback_report_attachments_feedback_order_idx" ON "feedback_report_attachments" ("feedback_id", "sort_order");
CREATE UNIQUE INDEX IF NOT EXISTS "feedback_report_attachments_object_key_unique" ON "feedback_report_attachments" ("object_key");

INSERT INTO "feedback_report_attachments" (
  "id",
  "team_id",
  "feedback_id",
  "object_key",
  "file_name",
  "mime_type",
  "file_size",
  "width",
  "height",
  "sort_order",
  "created_by",
  "created_at",
  "source_comment_attachment_id"
)
SELECT
  ca."id",
  ca."team_id",
  ca."target_id",
  ca."object_key",
  ca."file_name",
  ca."mime_type",
  ca."file_size",
  ca."width",
  ca."height",
  row_number() OVER (PARTITION BY ca."target_id" ORDER BY ca."attached_at", ca."created_at", ca."id") - 1,
  ca."created_by",
  ca."created_at",
  ca."id"
FROM "comment_attachments" ca
JOIN "_feedback_report_source_messages" src ON src.message_id = ca.message_id
ON CONFLICT ("id") DO NOTHING;

UPDATE "comment_messages" cm
SET
  "parent_message_id" = NULL,
  "reply_to_message_id" = NULL,
  "reply_to_author" = NULL
WHERE cm."parent_message_id" IN (SELECT message_id FROM "_feedback_report_source_messages");

DELETE FROM "comment_attachments"
WHERE "message_id" IN (SELECT message_id FROM "_feedback_report_source_messages");

DELETE FROM "comment_messages"
WHERE "id" IN (SELECT message_id FROM "_feedback_report_source_messages");

DELETE FROM "comment_threads" ct
WHERE ct."target_type" = 'feedback'
  AND NOT EXISTS (
    SELECT 1 FROM "comment_messages" cm WHERE cm."thread_id" = ct."id"
  );

ALTER TABLE "feedback_activity_events" DROP COLUMN IF EXISTS "activity_type";
ALTER TABLE "feedback_activity_events" ADD COLUMN "activity_type" "feedback_activity_type";
ALTER TABLE "feedback_activity_events" ADD COLUMN IF NOT EXISTS "payload" jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "feedback_activity_events" ADD COLUMN IF NOT EXISTS "sequence" bigint;

UPDATE "feedback_activity_events"
SET
  "activity_type" = CASE
    WHEN "action" LIKE '%创建%' THEN 'feedback.created'::"feedback_activity_type"
    WHEN "action" LIKE '%处理人%' THEN 'feedback.assignee.changed'::"feedback_activity_type"
    WHEN "action" LIKE '%关闭%' OR "action" LIKE '%打开%' THEN 'feedback.lifecycle.changed'::"feedback_activity_type"
    ELSE 'feedback.metadata.changed'::"feedback_activity_type"
  END,
  "payload" = COALESCE("metadata", '{}'::jsonb) || jsonb_build_object('legacyAction', "action", 'legacyActorName', "actor_name")
WHERE "activity_type" IS NULL;

CREATE SEQUENCE IF NOT EXISTS "feedback_activity_events_sequence_seq";
UPDATE "feedback_activity_events"
SET "sequence" = nextval('"feedback_activity_events_sequence_seq"')
WHERE "sequence" IS NULL;
ALTER SEQUENCE "feedback_activity_events_sequence_seq" OWNED BY "feedback_activity_events"."sequence";
ALTER TABLE "feedback_activity_events" ALTER COLUMN "sequence" SET DEFAULT nextval('"feedback_activity_events_sequence_seq"');
ALTER TABLE "feedback_activity_events" ALTER COLUMN "sequence" SET NOT NULL;
ALTER TABLE "feedback_activity_events" ALTER COLUMN "activity_type" SET NOT NULL;
ALTER TABLE "feedback_activity_events" DROP COLUMN IF EXISTS "actor_name";
ALTER TABLE "feedback_activity_events" DROP COLUMN IF EXISTS "action";
ALTER TABLE "feedback_activity_events" DROP COLUMN IF EXISTS "metadata";
DROP INDEX IF EXISTS "feedback_activity_events_feedback_created_idx";
DROP INDEX IF EXISTS "feedback_activity_events_team_created_idx";
CREATE INDEX IF NOT EXISTS "feedback_activity_events_feedback_sequence_idx" ON "feedback_activity_events" ("feedback_id", "sequence");
CREATE UNIQUE INDEX IF NOT EXISTS "feedback_activity_events_sequence_unique" ON "feedback_activity_events" ("sequence");
CREATE INDEX IF NOT EXISTS "feedback_activity_events_team_sequence_idx" ON "feedback_activity_events" ("team_id", "sequence");

CREATE TABLE IF NOT EXISTS "feedback_relations" (
  "id" text PRIMARY KEY,
  "team_id" text NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
  "source_feedback_id" text NOT NULL REFERENCES "feedback"("id") ON DELETE cascade,
  "target_feedback_id" text NOT NULL REFERENCES "feedback"("id") ON DELETE cascade,
  "type" "feedback_relation_type" NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamptz NOT NULL,
  CONSTRAINT "feedback_relations_no_self_check" CHECK ("source_feedback_id" <> "target_feedback_id"),
  CONSTRAINT "feedback_relations_related_canonical_check" CHECK ("type" <> 'related' OR "source_feedback_id" < "target_feedback_id")
);
CREATE INDEX IF NOT EXISTS "feedback_relations_source_idx" ON "feedback_relations" ("team_id", "source_feedback_id", "type");
CREATE INDEX IF NOT EXISTS "feedback_relations_target_idx" ON "feedback_relations" ("team_id", "target_feedback_id", "type");
CREATE UNIQUE INDEX IF NOT EXISTS "feedback_relations_unique_idx" ON "feedback_relations" ("team_id", "type", "source_feedback_id", "target_feedback_id");

CREATE TABLE IF NOT EXISTS "feedback_user_views" (
  "team_id" text NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
  "feedback_id" text NOT NULL REFERENCES "feedback"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "last_seen_sequence" bigint NOT NULL DEFAULT 0,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "feedback_user_views_pk" PRIMARY KEY ("team_id", "feedback_id", "user_id")
);
CREATE INDEX IF NOT EXISTS "feedback_user_views_user_updated_idx" ON "feedback_user_views" ("team_id", "user_id", "updated_at");

CREATE TABLE IF NOT EXISTS "feedback_participants" (
  "team_id" text NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
  "feedback_id" text NOT NULL REFERENCES "feedback"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "first_participated_at" timestamptz NOT NULL,
  "last_participated_at" timestamptz NOT NULL,
  CONSTRAINT "feedback_participants_pk" PRIMARY KEY ("team_id", "feedback_id", "user_id")
);
CREATE INDEX IF NOT EXISTS "feedback_participants_user_last_idx" ON "feedback_participants" ("team_id", "user_id", "last_participated_at");

INSERT INTO "feedback_participants" ("team_id", "feedback_id", "user_id", "first_participated_at", "last_participated_at")
SELECT f."team_id", f."id", f."created_by", f."created_at", f."updated_at"
FROM "feedback" f
WHERE f."created_by" IS NOT NULL
ON CONFLICT ("team_id", "feedback_id", "user_id") DO UPDATE
SET "last_participated_at" = GREATEST("feedback_participants"."last_participated_at", EXCLUDED."last_participated_at");

INSERT INTO "feedback_participants" ("team_id", "feedback_id", "user_id", "first_participated_at", "last_participated_at")
SELECT f."team_id", f."id", f."assignee_user_id", f."created_at", f."updated_at"
FROM "feedback" f
WHERE f."assignee_user_id" IS NOT NULL
ON CONFLICT ("team_id", "feedback_id", "user_id") DO UPDATE
SET "last_participated_at" = GREATEST("feedback_participants"."last_participated_at", EXCLUDED."last_participated_at");

INSERT INTO "feedback_participants" ("team_id", "feedback_id", "user_id", "first_participated_at", "last_participated_at")
SELECT ct."team_id", ct."target_id", cm."author_user_id", min(cm."created_at"), max(cm."created_at")
FROM "comment_threads" ct
JOIN "comment_messages" cm ON cm."thread_id" = ct."id"
WHERE ct."target_type" = 'feedback'
  AND cm."author_user_id" IS NOT NULL
GROUP BY ct."team_id", ct."target_id", cm."author_user_id"
ON CONFLICT ("team_id", "feedback_id", "user_id") DO UPDATE
SET "last_participated_at" = GREATEST("feedback_participants"."last_participated_at", EXCLUDED."last_participated_at");

CREATE TABLE IF NOT EXISTS "feedback_event_dispatches" (
  "id" text PRIMARY KEY,
  "team_id" text NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
  "activity_event_id" text NOT NULL REFERENCES "feedback_activity_events"("id") ON DELETE cascade,
  "idempotency_key" text NOT NULL,
  "payload" jsonb NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "attempts" integer NOT NULL DEFAULT 0,
  "notification_event_id" text REFERENCES "notification_events"("id") ON DELETE set null,
  "last_error" text,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "feedback_event_dispatches_status_check" CHECK ("status" IN ('pending', 'published', 'failed'))
);
CREATE INDEX IF NOT EXISTS "feedback_event_dispatches_activity_idx" ON "feedback_event_dispatches" ("activity_event_id");
CREATE UNIQUE INDEX IF NOT EXISTS "feedback_event_dispatches_idempotency_unique" ON "feedback_event_dispatches" ("idempotency_key");
CREATE INDEX IF NOT EXISTS "feedback_event_dispatches_status_updated_idx" ON "feedback_event_dispatches" ("status", "updated_at");

CREATE TABLE IF NOT EXISTS "feedback_event_dispatch_recipients" (
  "dispatch_id" text NOT NULL REFERENCES "feedback_event_dispatches"("id") ON DELETE cascade,
  "recipient_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "reasons" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "delivery_class" text NOT NULL,
  "attention_level" text NOT NULL,
  "muted" boolean NOT NULL DEFAULT false,
  CONSTRAINT "feedback_event_dispatch_recipients_pk" PRIMARY KEY ("dispatch_id", "recipient_user_id"),
  CONSTRAINT "feedback_event_dispatch_recipients_delivery_class_check" CHECK ("delivery_class" IN ('mandatory', 'direct', 'ordinary')),
  CONSTRAINT "feedback_event_dispatch_recipients_attention_level_check" CHECK ("attention_level" IN ('normal', 'action_required'))
);

CREATE TABLE IF NOT EXISTS "feedback_import_batches" (
  "id" text PRIMARY KEY,
  "team_id" text NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
  "created_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "status" text NOT NULL,
  "source_kind" text NOT NULL,
  "file_name" text,
  "summary" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "error" text,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  "committed_at" timestamptz,
  CONSTRAINT "feedback_import_batches_status_check" CHECK ("status" IN ('uploaded', 'validated', 'committed', 'failed'))
);
CREATE INDEX IF NOT EXISTS "feedback_import_batches_team_created_idx" ON "feedback_import_batches" ("team_id", "created_at");

CREATE TABLE IF NOT EXISTS "feedback_import_origins" (
  "team_id" text NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
  "source_system" text NOT NULL,
  "external_id" text NOT NULL,
  "feedback_id" text NOT NULL REFERENCES "feedback"("id") ON DELETE cascade,
  "import_batch_id" text REFERENCES "feedback_import_batches"("id") ON DELETE set null,
  "created_at" timestamptz NOT NULL,
  CONSTRAINT "feedback_import_origins_pk" PRIMARY KEY ("team_id", "source_system", "external_id")
);
CREATE INDEX IF NOT EXISTS "feedback_import_origins_feedback_idx" ON "feedback_import_origins" ("feedback_id");

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'feedback_daily_digest_runs'
      AND column_name = 'owner_user_id'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'feedback_daily_digest_runs'
      AND column_name = 'assignee_user_id'
  ) THEN
    ALTER TABLE "feedback_daily_digest_runs" RENAME COLUMN "owner_user_id" TO "assignee_user_id";
  END IF;
END $$;
DROP TYPE IF EXISTS "feedback_status";
DROP TYPE IF EXISTS "impact";
