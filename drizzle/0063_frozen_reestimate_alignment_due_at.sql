ALTER TABLE "objective_alignment_requests"
  ADD COLUMN IF NOT EXISTS "confirmation_due_at" timestamp with time zone;
