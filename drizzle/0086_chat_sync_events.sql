CREATE TABLE "chat_sync_events" (
  "seq" bigserial PRIMARY KEY NOT NULL,
  "team_id" text NOT NULL,
  "protocol_version" integer DEFAULT 1 NOT NULL,
  "event_type" text NOT NULL,
  "object_type" text NOT NULL,
  "object_id" text NOT NULL,
  "channel_id" text NOT NULL,
  "actor_user_id" uuid,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
  "metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  CONSTRAINT "chat_sync_events_protocol_version_check" CHECK ("protocol_version" = 1),
  CONSTRAINT "chat_sync_events_event_type_check" CHECK ("event_type" IN (
    'channel.created', 'channel.updated', 'channel.archived', 'channel.member.changed',
    'channel.preference.changed', 'channel.read.changed', 'message.created', 'message.updated',
    'message.deleted', 'reaction.changed', 'message.pin.changed', 'message.save.changed',
    'thread.follow.changed', 'thread.read.changed'
  )),
  CONSTRAINT "chat_sync_events_object_type_check" CHECK ("object_type" IN ('channel', 'message', 'thread', 'user')),
  CONSTRAINT "chat_sync_events_metadata_object_check" CHECK (jsonb_typeof("metadata_json") = 'object')
);
--> statement-breakpoint
ALTER TABLE "chat_sync_events" ADD CONSTRAINT "chat_sync_events_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "chat_sync_events" ADD CONSTRAINT "chat_sync_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "chat_sync_events_team_seq_idx" ON "chat_sync_events" USING btree ("team_id", "seq");
--> statement-breakpoint
CREATE INDEX "chat_sync_events_team_occurred_idx" ON "chat_sync_events" USING btree ("team_id", "occurred_at");
--> statement-breakpoint
CREATE INDEX "chat_sync_events_channel_seq_idx" ON "chat_sync_events" USING btree ("channel_id", "seq");
--> statement-breakpoint
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
    event_channel_id, event_actor_user_id, now(), COALESCE(event_metadata, '{}'::jsonb)
  );
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION orf_capture_chat_channel_sync_event() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM orf_append_chat_sync_event(
      NEW.team_id, 'channel.created', 'channel', NEW.id, NEW.id, NEW.created_by,
      jsonb_build_object('version', NEW.updated_at)
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL THEN
      PERFORM orf_append_chat_sync_event(
        NEW.team_id, 'channel.archived', 'channel', NEW.id, NEW.id, NEW.archived_by,
        jsonb_build_object('version', NEW.updated_at)
      );
    ELSIF ROW(OLD.type, OLD.name, OLD.project_id, OLD.display_name, OLD.purpose, OLD.header, OLD.archived_at)
      IS DISTINCT FROM ROW(NEW.type, NEW.name, NEW.project_id, NEW.display_name, NEW.purpose, NEW.header, NEW.archived_at) THEN
      PERFORM orf_append_chat_sync_event(
        NEW.team_id, 'channel.updated', 'channel', NEW.id, NEW.id, NULL,
        jsonb_build_object('version', NEW.updated_at)
      );
    END IF;
    RETURN NEW;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER chat_channels_sync_event
AFTER INSERT OR UPDATE ON chat_channels
FOR EACH ROW EXECUTE FUNCTION orf_capture_chat_channel_sync_event();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION orf_capture_chat_member_sync_event() RETURNS trigger AS $$
DECLARE
  target_channel_id text;
  target_user_id uuid;
  target_team_id text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_channel_id := OLD.channel_id;
    target_user_id := OLD.user_id;
  ELSE
    target_channel_id := NEW.channel_id;
    target_user_id := NEW.user_id;
  END IF;
  SELECT team_id INTO target_team_id FROM chat_channels WHERE id = target_channel_id;
  IF target_team_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF TG_OP = 'INSERT' OR TG_OP = 'DELETE' OR OLD.role IS DISTINCT FROM NEW.role THEN
    PERFORM orf_append_chat_sync_event(
      target_team_id, 'channel.member.changed', 'user', target_user_id::text,
      target_channel_id, target_user_id,
      jsonb_build_object(
        'membership', CASE WHEN TG_OP = 'DELETE' THEN 'removed' ELSE 'joined' END,
        'role', CASE WHEN TG_OP = 'DELETE' THEN OLD.role::text ELSE NEW.role::text END
      )
    );
  END IF;

  IF TG_OP = 'UPDATE' AND ROW(OLD.favorite, OLD.muted) IS DISTINCT FROM ROW(NEW.favorite, NEW.muted) THEN
    PERFORM orf_append_chat_sync_event(
      target_team_id, 'channel.preference.changed', 'user', target_user_id::text,
      target_channel_id, target_user_id,
      jsonb_build_object('favorite', NEW.favorite, 'muted', NEW.muted)
    );
  END IF;

  IF TG_OP = 'UPDATE' AND ROW(OLD.manually_unread, OLD.last_read_at, OLD.last_read_message_id)
    IS DISTINCT FROM ROW(NEW.manually_unread, NEW.last_read_at, NEW.last_read_message_id) THEN
    PERFORM orf_append_chat_sync_event(
      target_team_id, 'channel.read.changed', 'user', target_user_id::text,
      target_channel_id, target_user_id,
      jsonb_strip_nulls(jsonb_build_object(
        'manuallyUnread', NEW.manually_unread,
        'lastReadAt', NEW.last_read_at,
        'lastReadMessageId', NEW.last_read_message_id
      ))
    );
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER chat_channel_members_sync_event
AFTER INSERT OR UPDATE OR DELETE ON chat_channel_members
FOR EACH ROW EXECUTE FUNCTION orf_capture_chat_member_sync_event();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION orf_capture_chat_message_sync_event() RETURNS trigger AS $$
DECLARE
  event_name text;
  event_actor uuid;
  event_row chat_messages%ROWTYPE;
BEGIN
  event_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  IF TG_OP = 'INSERT' THEN
    event_name := 'message.created';
    event_actor := NEW.author_user_id;
  ELSIF TG_OP = 'DELETE' THEN
    event_name := 'message.deleted';
    event_actor := COALESCE(OLD.deleted_by, OLD.author_user_id);
  ELSIF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    event_name := 'message.deleted';
    event_actor := COALESCE(NEW.deleted_by, NEW.author_user_id);
  ELSIF ROW(OLD.body, OLD.root_message_id, OLD.parent_message_id, OLD.edited_at, OLD.system_metadata)
    IS DISTINCT FROM ROW(NEW.body, NEW.root_message_id, NEW.parent_message_id, NEW.edited_at, NEW.system_metadata) THEN
    event_name := 'message.updated';
    event_actor := NEW.author_user_id;
  ELSE
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  PERFORM orf_append_chat_sync_event(
    event_row.team_id, event_name, 'message', event_row.id, event_row.channel_id, event_actor,
    jsonb_strip_nulls(jsonb_build_object(
      'rootMessageId', event_row.root_message_id,
      'parentMessageId', event_row.parent_message_id,
      'version', event_row.updated_at
    ))
  );
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER chat_messages_sync_event
AFTER INSERT OR UPDATE OR DELETE ON chat_messages
FOR EACH ROW EXECUTE FUNCTION orf_capture_chat_message_sync_event();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION orf_capture_chat_message_child_sync_event() RETURNS trigger AS $$
DECLARE
  target_message_id text;
  target_user_id uuid;
  message_row chat_messages%ROWTYPE;
  event_name text;
  event_metadata jsonb := '{}'::jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN target_message_id := OLD.message_id; ELSE target_message_id := NEW.message_id; END IF;
  SELECT * INTO message_row FROM chat_messages WHERE id = target_message_id;
  IF message_row.id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF TG_TABLE_NAME = 'chat_message_reactions' THEN
    IF TG_OP = 'DELETE' THEN target_user_id := OLD.user_id; ELSE target_user_id := NEW.user_id; END IF;
    event_name := 'reaction.changed';
    event_metadata := jsonb_build_object(
      'emojiName', COALESCE(NEW.emoji_name, OLD.emoji_name),
      'reacting', TG_OP <> 'DELETE'
    );
  ELSIF TG_TABLE_NAME = 'chat_message_pins' THEN
    IF TG_OP = 'DELETE' THEN target_user_id := OLD.pinned_by; ELSE target_user_id := NEW.pinned_by; END IF;
    event_name := 'message.pin.changed';
    event_metadata := jsonb_build_object('pinned', TG_OP <> 'DELETE');
  ELSE
    IF TG_OP = 'DELETE' THEN target_user_id := OLD.user_id; ELSE target_user_id := NEW.user_id; END IF;
    event_name := 'message.save.changed';
    event_metadata := jsonb_build_object('saved', TG_OP <> 'DELETE');
  END IF;

  PERFORM orf_append_chat_sync_event(
    message_row.team_id, event_name, 'message', message_row.id,
    message_row.channel_id, target_user_id, event_metadata
  );
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER chat_message_reactions_sync_event
AFTER INSERT OR UPDATE OR DELETE ON chat_message_reactions
FOR EACH ROW EXECUTE FUNCTION orf_capture_chat_message_child_sync_event();
--> statement-breakpoint
CREATE TRIGGER chat_message_pins_sync_event
AFTER INSERT OR UPDATE OR DELETE ON chat_message_pins
FOR EACH ROW EXECUTE FUNCTION orf_capture_chat_message_child_sync_event();
--> statement-breakpoint
CREATE TRIGGER chat_message_saves_sync_event
AFTER INSERT OR UPDATE OR DELETE ON chat_message_saves
FOR EACH ROW EXECUTE FUNCTION orf_capture_chat_message_child_sync_event();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION orf_capture_chat_thread_follow_sync_event() RETURNS trigger AS $$
DECLARE
  target_root_id text;
  target_user_id uuid;
  message_row chat_messages%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_root_id := OLD.root_message_id;
    target_user_id := OLD.user_id;
  ELSE
    target_root_id := NEW.root_message_id;
    target_user_id := NEW.user_id;
  END IF;
  SELECT * INTO message_row FROM chat_messages WHERE id = target_root_id;
  IF message_row.id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF TG_OP = 'INSERT' OR TG_OP = 'DELETE' OR OLD.following IS DISTINCT FROM NEW.following THEN
    PERFORM orf_append_chat_sync_event(
      message_row.team_id, 'thread.follow.changed', 'thread', target_root_id,
      message_row.channel_id, target_user_id,
      jsonb_build_object('following', CASE WHEN TG_OP = 'DELETE' THEN false ELSE NEW.following END)
    );
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.last_viewed_at IS DISTINCT FROM NEW.last_viewed_at THEN
    PERFORM orf_append_chat_sync_event(
      message_row.team_id, 'thread.read.changed', 'thread', target_root_id,
      message_row.channel_id, target_user_id,
      jsonb_strip_nulls(jsonb_build_object('lastViewedAt', NEW.last_viewed_at))
    );
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER chat_thread_follows_sync_event
AFTER INSERT OR UPDATE OR DELETE ON chat_thread_follows
FOR EACH ROW EXECUTE FUNCTION orf_capture_chat_thread_follow_sync_event();
