ALTER TABLE "chat_sync_events"
ADD CONSTRAINT "chat_sync_events_metadata_keys_check" CHECK (
  pg_column_size("metadata_json") <= 4096
  AND CASE
    WHEN "event_type" IN ('channel.created', 'channel.updated', 'channel.archived')
      THEN "metadata_json" - ARRAY['version']::text[] = '{}'::jsonb
    WHEN "event_type" = 'channel.member.changed'
      THEN "metadata_json" - ARRAY['membership', 'role']::text[] = '{}'::jsonb
    WHEN "event_type" = 'channel.preference.changed'
      THEN "metadata_json" - ARRAY['favorite', 'muted']::text[] = '{}'::jsonb
    WHEN "event_type" = 'channel.read.changed'
      THEN "metadata_json" - ARRAY['lastReadAt', 'lastReadMessageId', 'manuallyUnread']::text[] = '{}'::jsonb
    WHEN "event_type" IN ('message.created', 'message.updated', 'message.deleted')
      THEN "metadata_json" - ARRAY['parentMessageId', 'rootMessageId', 'version']::text[] = '{}'::jsonb
    WHEN "event_type" = 'reaction.changed'
      THEN "metadata_json" - ARRAY['emojiName', 'reacting']::text[] = '{}'::jsonb
    WHEN "event_type" = 'message.pin.changed'
      THEN "metadata_json" - ARRAY['pinned']::text[] = '{}'::jsonb
    WHEN "event_type" = 'message.save.changed'
      THEN "metadata_json" - ARRAY['saved']::text[] = '{}'::jsonb
    WHEN "event_type" = 'thread.follow.changed'
      THEN "metadata_json" - ARRAY['following']::text[] = '{}'::jsonb
    WHEN "event_type" = 'thread.read.changed'
      THEN "metadata_json" - ARRAY['lastViewedAt']::text[] = '{}'::jsonb
    ELSE false
  END
);
