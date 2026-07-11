CREATE OR REPLACE FUNCTION "orf_initialize_team_permission_rules"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO "role_permissions" ("team_id", "role", "stage", "resource", "actions")
  VALUES (NEW."id", 'member', 'global', 'permissionKeys', '[]'::jsonb)
  ON CONFLICT ("team_id", "role", "stage", "resource") DO NOTHING;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "teams_initialize_permission_rules" ON "teams";
--> statement-breakpoint
CREATE TRIGGER "teams_initialize_permission_rules"
AFTER INSERT ON "teams"
FOR EACH ROW
EXECUTE FUNCTION "orf_initialize_team_permission_rules"();
--> statement-breakpoint
INSERT INTO "role_permissions" ("team_id", "role", "stage", "resource", "actions")
SELECT "id", 'member', 'global', 'permissionKeys', '[]'::jsonb
FROM "teams"
ON CONFLICT ("team_id", "role", "stage", "resource") DO NOTHING;
