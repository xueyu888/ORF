CREATE TABLE "chat_message_deliveries" (
  "id" text PRIMARY KEY NOT NULL,
  "message_id" text NOT NULL,
  "team_id" text NOT NULL,
  "channel_id" text NOT NULL,
  "recipient_user_id" uuid NOT NULL,
  "transport" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "last_error" text,
  "next_attempt_at" timestamp with time zone,
  "lease_expires_at" timestamp with time zone,
  "delivered_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "chat_message_deliveries_transport_check" CHECK ("transport" IN ('realtime', 'push')),
  CONSTRAINT "chat_message_deliveries_status_check" CHECK ("status" IN ('pending', 'processing', 'delivered', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "chat_message_deliveries" ADD CONSTRAINT "chat_message_deliveries_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "chat_messages"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "chat_message_deliveries" ADD CONSTRAINT "chat_message_deliveries_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "chat_message_deliveries" ADD CONSTRAINT "chat_message_deliveries_channel_id_chat_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "chat_channels"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "chat_message_deliveries" ADD CONSTRAINT "chat_message_deliveries_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "chat_message_deliveries_message_recipient_transport_unique" ON "chat_message_deliveries" USING btree ("message_id", "recipient_user_id", "transport");
--> statement-breakpoint
CREATE INDEX "chat_message_deliveries_retry_idx" ON "chat_message_deliveries" USING btree ("status", "next_attempt_at", "lease_expires_at", "created_at");
