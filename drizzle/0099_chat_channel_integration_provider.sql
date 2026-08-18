ALTER TABLE chat_channels
ADD COLUMN IF NOT EXISTS integration_provider text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chat_channels_integration_provider_check'
  ) THEN
    ALTER TABLE chat_channels
    ADD CONSTRAINT chat_channels_integration_provider_check
    CHECK (integration_provider IS NULL OR integration_provider IN ('github', 'gitlab'));
  END IF;
END $$;

UPDATE chat_channels
SET integration_provider = 'github'
WHERE integration_provider IS NULL
  AND system_kind IS NULL
  AND type IN ('public', 'private')
  AND (
    lower(regexp_replace(coalesce(name, ''), '[[:space:]_-]+', '', 'g')) = 'github'
    OR lower(regexp_replace(display_name, '[[:space:]_-]+', '', 'g')) = 'github'
  );

UPDATE chat_channels
SET integration_provider = 'gitlab'
WHERE integration_provider IS NULL
  AND system_kind IS NULL
  AND type IN ('public', 'private')
  AND (
    lower(regexp_replace(coalesce(name, ''), '[[:space:]_-]+', '', 'g')) = 'gitlab'
    OR lower(regexp_replace(display_name, '[[:space:]_-]+', '', 'g')) = 'gitlab'
  );
