ALTER TABLE "feedback" ALTER COLUMN "status" TYPE text USING CASE WHEN "status"::text = 'Closed' THEN 'Closed' ELSE 'Open' END;
DROP TYPE IF EXISTS "feedback_status";
CREATE TYPE "feedback_status" AS ENUM('Open', 'Closed');
ALTER TABLE "feedback" ALTER COLUMN "status" TYPE "feedback_status" USING "status"::"feedback_status";

ALTER TABLE "feedback" DROP CONSTRAINT IF EXISTS "feedback_linked_objective_id_objectives_id_fk";
ALTER TABLE "feedback" DROP CONSTRAINT IF EXISTS "feedback_linked_result_id_results_id_fk";
ALTER TABLE "feedback" DROP COLUMN IF EXISTS "linked_objective_id";
ALTER TABLE "feedback" DROP COLUMN IF EXISTS "linked_result_id";
ALTER TABLE "feedback" DROP COLUMN IF EXISTS "source";
DROP TYPE IF EXISTS "feedback_source";

ALTER TABLE "tasks" DROP COLUMN IF EXISTS "feedback_origin_id";

ALTER TABLE "evidence" DROP CONSTRAINT IF EXISTS "evidence_linked_feedback_id_feedback_id_fk";
ALTER TABLE "evidence" DROP COLUMN IF EXISTS "linked_feedback_id";
