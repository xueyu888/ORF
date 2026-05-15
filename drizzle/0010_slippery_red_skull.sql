ALTER TABLE "objectives" ADD COLUMN "final_due_at" date DEFAULT (CURRENT_DATE + INTERVAL '14 day') NOT NULL;--> statement-breakpoint
ALTER TABLE "objectives" ADD COLUMN "challengers" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "objectives" ADD COLUMN "assigned_challengers" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "objectives" ADD COLUMN "challenge_applications" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "objectives" ADD COLUMN "accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "objectives" ADD COLUMN "confirmation_due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "objectives" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "objectives" ADD COLUMN "loot_submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "objectives" ADD COLUMN "accepted_result" text;--> statement-breakpoint
ALTER TABLE "objectives" ADD COLUMN "completion_multiplier" real;--> statement-breakpoint
ALTER TABLE "objectives" ADD COLUMN "objective_base_points" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "objectives" ADD COLUMN "objective_settlement_points" real;--> statement-breakpoint
ALTER TABLE "results" ADD COLUMN "uncertainty_score" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "results" ADD COLUMN "accepted_result" text DEFAULT 'unreviewed' NOT NULL;
