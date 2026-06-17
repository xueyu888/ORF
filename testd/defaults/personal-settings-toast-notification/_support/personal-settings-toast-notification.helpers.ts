import { sql } from "drizzle-orm";
import { users } from "../../../../server/db/schema";
import { readUserPreferences, saveUserPreferences } from "../../../../server/settings/personalSettings";
import { db } from "../../../_operators/testd-db-client";

export async function setDefaultLandingPathByEmail(email: string, path: string | null) {
  const rows = await readUserIdsByEmail(email);
  for (const row of rows) {
    await saveUserPreferences(row.id, { defaultLandingPath: path });
  }
}

export async function setToastEnabledByEmail(email: string, enabled: boolean) {
  const rows = await readUserIdsByEmail(email);
  for (const row of rows) {
    await saveUserPreferences(row.id, { notificationDisplay: { toastEnabled: enabled } });
  }
}

export async function readToastEnabledByEmail(email: string): Promise<boolean | null> {
  const [row] = await readUserIdsByEmail(email);
  if (!row) {
    return null;
  }
  return (await readUserPreferences(row.id)).notificationDisplay.toastEnabled;
}

async function readUserIdsByEmail(email: string) {
  return db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email.toLowerCase()}`);
}
