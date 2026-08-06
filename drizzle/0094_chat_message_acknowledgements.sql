CREATE TABLE "chat_message_ack_requests" (
  "message_id" text PRIMARY KEY NOT NULL,
  "team_id" text NOT NULL,
  "channel_id" text NOT NULL,
  "requested_by_user_id" uuid NOT NULL,
  "requested_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_message_ack_requests" ADD CONSTRAINT "chat_message_ack_requests_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "chat_messages"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "chat_message_ack_requests" ADD CONSTRAINT "chat_message_ack_requests_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "chat_message_ack_requests" ADD CONSTRAINT "chat_message_ack_requests_channel_id_chat_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "chat_channels"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "chat_message_ack_requests" ADD CONSTRAINT "chat_message_ack_requests_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "chat_message_ack_requests_team_channel_idx" ON "chat_message_ack_requests" USING btree ("team_id", "channel_id", "requested_at");
--> statement-breakpoint
CREATE TABLE "chat_message_ack_recipients" (
  "message_id" text NOT NULL,
  "user_id" uuid NOT NULL,
  "assigned_at" timestamp with time zone NOT NULL,
  CONSTRAINT "chat_message_ack_recipients_pk" PRIMARY KEY("message_id", "user_id")
);
--> statement-breakpoint
ALTER TABLE "chat_message_ack_recipients" ADD CONSTRAINT "chat_message_ack_recipients_message_id_chat_message_ack_requests_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "chat_message_ack_requests"("message_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "chat_message_ack_recipients" ADD CONSTRAINT "chat_message_ack_recipients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "chat_message_ack_recipients_user_idx" ON "chat_message_ack_recipients" USING btree ("user_id");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION orf_capture_chat_message_ack_request_sync_event() RETURNS trigger AS $$
DECLARE
  message_row chat_messages%ROWTYPE;
  target_actor uuid;
  target_message_id text;
  target_version timestamp with time zone;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_message_id := OLD.message_id;
    target_actor := OLD.requested_by_user_id;
    target_version := OLD.updated_at;
  ELSE
    target_message_id := NEW.message_id;
    target_actor := NEW.requested_by_user_id;
    target_version := NEW.updated_at;
  END IF;

  SELECT * INTO message_row FROM chat_messages WHERE id = target_message_id;
  IF message_row.id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  PERFORM orf_append_chat_sync_event(
    message_row.team_id, 'message.updated', 'message', message_row.id,
    message_row.channel_id, target_actor,
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
CREATE TRIGGER chat_message_ack_requests_sync_event
AFTER INSERT OR UPDATE OR DELETE ON chat_message_ack_requests
FOR EACH ROW EXECUTE FUNCTION orf_capture_chat_message_ack_request_sync_event();
