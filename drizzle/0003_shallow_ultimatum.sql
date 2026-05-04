ALTER TYPE "public"."delivery_rating" RENAME TO "uncertainty_level";--> statement-breakpoint
ALTER TABLE "results" RENAME COLUMN "delivery_rating" TO "uncertainty_level";--> statement-breakpoint
ALTER TABLE "results" ALTER COLUMN "uncertainty_level" SET DATA TYPE text;--> statement-breakpoint
UPDATE "results"
SET "uncertainty_level" = CASE "uncertainty_level"
	WHEN '普通' THEN '入门'
	WHEN '复杂' THEN '进阶'
	WHEN '攻坚' THEN '破局'
	WHEN '挑战' THEN '渡劫'
	ELSE "uncertainty_level"
END;--> statement-breakpoint
DROP TYPE "public"."uncertainty_level";--> statement-breakpoint
CREATE TYPE "public"."uncertainty_level" AS ENUM('入门', '进阶', '破局', '渡劫', '飞升');--> statement-breakpoint
ALTER TABLE "results" ALTER COLUMN "uncertainty_level" SET DATA TYPE "public"."uncertainty_level" USING "uncertainty_level"::"public"."uncertainty_level";
