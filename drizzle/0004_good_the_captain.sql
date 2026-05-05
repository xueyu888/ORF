CREATE TABLE "role_permissions" (
	"team_id" text NOT NULL,
	"role" "team_role" NOT NULL,
	"stage" text NOT NULL,
	"resource" text NOT NULL,
	"actions" jsonb NOT NULL,
	CONSTRAINT "role_permissions_team_id_role_stage_resource_pk" PRIMARY KEY("team_id","role","stage","resource")
);
--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "role_permissions" ("team_id", "role", "stage", "resource", "actions")
SELECT "id", 'member', "stage", "resource", "actions"::jsonb
FROM "teams"
CROSS JOIN (
	VALUES
		('goalSetting', 'objective', '["view"]'),
		('goalSetting', 'result', '["view"]'),
		('goalSetting', 'task', '[]'),
		('goalSetting', 'subtask', '[]'),
		('resultClaiming', 'objective', '["view"]'),
		('resultClaiming', 'result', '["view"]'),
		('resultClaiming', 'task', '[]'),
		('resultClaiming', 'subtask', '[]'),
		('orfReestimate', 'objective', '["view","edit"]'),
		('orfReestimate', 'result', '["view","edit"]'),
		('orfReestimate', 'task', '["view","create","edit"]'),
		('orfReestimate', 'subtask', '["view","create","edit"]'),
		('goalFrozen', 'objective', '["view"]'),
		('goalFrozen', 'result', '["view"]'),
		('goalFrozen', 'task', '["view","create","edit"]'),
		('goalFrozen', 'subtask', '["view","create","edit"]')
) AS default_permissions("stage", "resource", "actions");
