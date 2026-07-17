CREATE OR REPLACE FUNCTION orf_append_chat_sync_event(
  event_team_id text,
  event_type_name text,
  event_object_type text,
  event_object_id text,
  event_channel_id text,
  event_actor_user_id uuid,
  event_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS void AS $$
BEGIN
  INSERT INTO chat_sync_events (
    team_id, protocol_version, event_type, object_type, object_id,
    channel_id, actor_user_id, occurred_at, metadata_json
  ) VALUES (
    event_team_id, 1, event_type_name, event_object_type, event_object_id,
    event_channel_id,
    CASE
      WHEN event_actor_user_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM users WHERE id = event_actor_user_id)
        THEN event_actor_user_id
      ELSE NULL
    END,
    now(), COALESCE(event_metadata, '{}'::jsonb)
  );
END;
$$ LANGUAGE plpgsql;
