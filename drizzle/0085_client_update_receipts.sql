CREATE TABLE "client_update_receipts" (
  "team_id" text NOT NULL,
  "user_id" uuid NOT NULL,
  "release_version" text NOT NULL,
  "platform" text NOT NULL,
  "current_version" text NOT NULL,
  "checked_at" timestamp with time zone NOT NULL,
  "prompted_at" timestamp with time zone,
  "install_started_at" timestamp with time zone,
  "activated_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "client_update_receipts_team_user_release_platform_pk" PRIMARY KEY("team_id", "user_id", "release_version", "platform"),
  CONSTRAINT "client_update_receipts_platform_check" CHECK ("platform" IN ('android', 'desktop-windows'))
);
--> statement-breakpoint
ALTER TABLE "client_update_receipts" ADD CONSTRAINT "client_update_receipts_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "client_update_receipts" ADD CONSTRAINT "client_update_receipts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "client_update_receipts_team_release_idx" ON "client_update_receipts" USING btree ("team_id", "release_version");
--> statement-breakpoint
CREATE INDEX "client_update_receipts_team_updated_idx" ON "client_update_receipts" USING btree ("team_id", "updated_at");
