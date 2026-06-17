import { sql } from "drizzle-orm";
import { users } from "../../../../server/db/schema";
import { readUserPreferences, saveUserPreferences } from "../../../../server/settings/personalSettings";
import { db } from "../../../_operators/testd-db-client";

export type SidebarPreferenceState = "system" | "expanded" | "collapsed";

export async function setDefaultLandingPathByEmail(email: string, path: string | null) {
  const rows = await readUserIdsByEmail(email);
  for (const row of rows) {
    await saveUserPreferences(row.id, { defaultLandingPath: path });
  }
}

export async function setSidebarStateByEmail(email: string, state: SidebarPreferenceState) {
  const rows = await readUserIdsByEmail(email);
  const sidebarCollapsed = state === "system" ? null : state === "collapsed";
  for (const row of rows) {
    await saveUserPreferences(row.id, { sidebarCollapsed });
  }
}

export async function readDefaultLandingPathByEmail(email: string) {
  const [row] = await readUserIdsByEmail(email);
  if (!row) {
    return null;
  }
  return (await readUserPreferences(row.id)).defaultLandingPath;
}

export async function readSidebarStateByEmail(email: string): Promise<SidebarPreferenceState> {
  const [row] = await readUserIdsByEmail(email);
  if (!row) {
    return "system";
  }
  const value = (await readUserPreferences(row.id)).sidebarCollapsed;
  return value === null ? "system" : value ? "collapsed" : "expanded";
}

async function readUserIdsByEmail(email: string) {
  return db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email.toLowerCase()}`);
}
