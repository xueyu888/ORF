ALTER TABLE "notification_events"
  ADD COLUMN IF NOT EXISTS "source_event_key" text;

CREATE UNIQUE INDEX IF NOT EXISTS "notification_events_team_source_event_key_unique"
  ON "notification_events" ("team_id", "source_event_key")
  WHERE "source_event_key" IS NOT NULL;

ALTER TABLE "notification_receipts"
  ADD COLUMN IF NOT EXISTS "recipient_reasons" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "delivery_class" text NOT NULL DEFAULT 'ordinary',
  ADD COLUMN IF NOT EXISTS "attention_level" text NOT NULL DEFAULT 'normal';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'notification_receipts_delivery_class_check'
  ) THEN
    ALTER TABLE "notification_receipts"
      ADD CONSTRAINT "notification_receipts_delivery_class_check"
      CHECK ("delivery_class" IN ('mandatory', 'direct', 'ordinary'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'notification_receipts_attention_level_check'
  ) THEN
    ALTER TABLE "notification_receipts"
      ADD CONSTRAINT "notification_receipts_attention_level_check"
      CHECK ("attention_level" IN ('normal', 'action_required'));
  END IF;
END $$;
