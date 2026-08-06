ALTER TABLE "results"
  ADD COLUMN IF NOT EXISTS "execution_completed" boolean NOT NULL DEFAULT false;
