ALTER TABLE "results" ADD COLUMN "source" text DEFAULT 'managerDefined' NOT NULL;--> statement-breakpoint
ALTER TABLE "results" ADD COLUMN "definer" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "results" ADD COLUMN "final_due_at" date;--> statement-breakpoint
ALTER TABLE "results" ADD COLUMN "assigned_challenger" text;--> statement-breakpoint
ALTER TABLE "results" ADD COLUMN "accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "results" ADD COLUMN "confirmation_due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "results" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "results" ADD COLUMN "priority_challenge_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "results" ADD COLUMN "priority_declined_by" jsonb;--> statement-breakpoint
ALTER TABLE "results" ADD COLUMN "challenge_applications" jsonb;