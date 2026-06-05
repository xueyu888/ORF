CREATE TABLE IF NOT EXISTS "chat_message_pins" (
  "message_id" text NOT NULL REFERENCES "chat_messages"("id") ON DELETE cascade,
  "channel_id" text NOT NULL REFERENCES "chat_channels"("id") ON DELETE cascade,
  "pinned_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "pinned_at" timestamp with time zone NOT NULL,
  CONSTRAINT "chat_message_pins_pkey" PRIMARY KEY ("message_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_message_pins_channel_pinned_at_idx" ON "chat_message_pins" USING btree ("channel_id", "pinned_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_message_pins_pinned_by_idx" ON "chat_message_pins" USING btree ("pinned_by");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_message_saves" (
  "message_id" text NOT NULL REFERENCES "chat_messages"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "saved_at" timestamp with time zone NOT NULL,
  CONSTRAINT "chat_message_saves_pkey" PRIMARY KEY ("message_id", "user_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_message_saves_user_saved_at_idx" ON "chat_message_saves" USING btree ("user_id", "saved_at");
