CREATE TABLE "chat_polls" (
  "message_id" text PRIMARY KEY NOT NULL,
  "selection_mode" text NOT NULL,
  "visibility" text NOT NULL,
  "closed_at" timestamp with time zone,
  "closed_by_user_id" uuid,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "chat_polls_selection_mode_check" CHECK ("selection_mode" IN ('single', 'multiple')),
  CONSTRAINT "chat_polls_visibility_check" CHECK ("visibility" IN ('named', 'anonymous'))
);
--> statement-breakpoint
ALTER TABLE "chat_polls" ADD CONSTRAINT "chat_polls_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "chat_messages"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "chat_polls" ADD CONSTRAINT "chat_polls_closed_by_user_id_users_id_fk" FOREIGN KEY ("closed_by_user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "chat_poll_options" (
  "id" text PRIMARY KEY NOT NULL,
  "poll_message_id" text NOT NULL,
  "label" text NOT NULL,
  "position" integer NOT NULL,
  CONSTRAINT "chat_poll_options_position_check" CHECK ("position" >= 0),
  CONSTRAINT "chat_poll_options_label_check" CHECK (char_length(btrim("label")) BETWEEN 1 AND 80)
);
--> statement-breakpoint
ALTER TABLE "chat_poll_options" ADD CONSTRAINT "chat_poll_options_poll_message_id_chat_polls_message_id_fk" FOREIGN KEY ("poll_message_id") REFERENCES "chat_polls"("message_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "chat_poll_options_poll_position_unique" ON "chat_poll_options" USING btree ("poll_message_id", "position");
--> statement-breakpoint
CREATE UNIQUE INDEX "chat_poll_options_poll_option_unique" ON "chat_poll_options" USING btree ("poll_message_id", "id");
--> statement-breakpoint
CREATE TABLE "chat_poll_votes" (
  "poll_message_id" text NOT NULL,
  "option_id" text NOT NULL,
  "voter_user_id" uuid NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "chat_poll_votes_pk" PRIMARY KEY("poll_message_id", "voter_user_id", "option_id")
);
--> statement-breakpoint
ALTER TABLE "chat_poll_votes" ADD CONSTRAINT "chat_poll_votes_poll_option_fk" FOREIGN KEY ("poll_message_id", "option_id") REFERENCES "chat_poll_options"("poll_message_id", "id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "chat_poll_votes" ADD CONSTRAINT "chat_poll_votes_voter_user_id_users_id_fk" FOREIGN KEY ("voter_user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "chat_poll_votes_option_idx" ON "chat_poll_votes" USING btree ("poll_message_id", "option_id");
--> statement-breakpoint
CREATE INDEX "chat_poll_votes_voter_idx" ON "chat_poll_votes" USING btree ("voter_user_id");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION orf_validate_chat_poll_vote_selection() RETURNS trigger AS $$
DECLARE
  target_selection_mode text;
  conflicting_vote_exists boolean;
BEGIN
  SELECT selection_mode INTO target_selection_mode
  FROM chat_polls
  WHERE message_id = NEW.poll_message_id
  FOR SHARE;

  IF target_selection_mode IS NULL THEN
    RAISE EXCEPTION 'chat poll does not exist';
  END IF;

  IF target_selection_mode = 'single' THEN
    IF TG_OP = 'UPDATE' THEN
      SELECT EXISTS (
        SELECT 1
        FROM chat_poll_votes vote
        WHERE vote.poll_message_id = NEW.poll_message_id
          AND vote.voter_user_id = NEW.voter_user_id
          AND ROW(vote.poll_message_id, vote.voter_user_id, vote.option_id)
            IS DISTINCT FROM ROW(OLD.poll_message_id, OLD.voter_user_id, OLD.option_id)
      ) INTO conflicting_vote_exists;
    ELSE
      SELECT EXISTS (
        SELECT 1
        FROM chat_poll_votes vote
        WHERE vote.poll_message_id = NEW.poll_message_id
          AND vote.voter_user_id = NEW.voter_user_id
      ) INTO conflicting_vote_exists;
    END IF;

    IF conflicting_vote_exists THEN
      RAISE EXCEPTION 'single-choice poll accepts one option per voter';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER chat_poll_votes_selection_guard
BEFORE INSERT OR UPDATE ON chat_poll_votes
FOR EACH ROW EXECUTE FUNCTION orf_validate_chat_poll_vote_selection();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION orf_capture_chat_poll_sync_event() RETURNS trigger AS $$
DECLARE
  message_row chat_messages%ROWTYPE;
  target_message_id text;
  target_actor_user_id uuid;
  target_version timestamp with time zone;
BEGIN
  target_message_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.message_id ELSE NEW.message_id END;
  target_version := CASE WHEN TG_OP = 'DELETE' THEN OLD.updated_at ELSE NEW.updated_at END;
  target_actor_user_id := CASE
    WHEN TG_OP = 'UPDATE' AND OLD.closed_at IS NULL AND NEW.closed_at IS NOT NULL
      THEN NEW.closed_by_user_id
    ELSE NULL
  END;

  SELECT * INTO message_row FROM chat_messages WHERE id = target_message_id;
  IF message_row.id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  PERFORM orf_append_chat_sync_event(
    message_row.team_id, 'message.updated', 'message', message_row.id,
    message_row.channel_id, target_actor_user_id,
    jsonb_strip_nulls(jsonb_build_object(
      'rootMessageId', message_row.root_message_id,
      'parentMessageId', message_row.parent_message_id,
      'version', target_version
    ))
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER chat_polls_sync_event
AFTER INSERT OR UPDATE OR DELETE ON chat_polls
FOR EACH ROW EXECUTE FUNCTION orf_capture_chat_poll_sync_event();
