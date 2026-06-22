import { sql } from "drizzle-orm";
import { users } from "../../../../server/db/schema";
import { readUserPreferences, saveUserPreferences } from "../../../../server/settings/personalSettings";
import { db } from "../../../_operators/testd-db-client";

export async function setDefaultLandingPathByEmail(email: string, path: string | null) {
  const rows = await readUserIdsByEmail(email);
  for (const row of rows) {
    await saveUserPreferences(row.id, {
      defaultLandingPath: path,
      sidebarCollapsed: path === null ? null : false,
    });
  }
}

export async function setSidebarCollapsedByEmail(email: string, collapsed: boolean | null) {
  const rows = await readUserIdsByEmail(email);
  for (const row of rows) {
    await saveUserPreferences(row.id, { sidebarCollapsed: collapsed });
  }
}

export async function readSidebarCollapsedByEmail(email: string) {
  const [row] = await readUserIdsByEmail(email);
  if (!row) {
    return null;
  }
  return (await readUserPreferences(row.id)).sidebarCollapsed;
}

async function readUserIdsByEmail(email: string) {
  return db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email.toLowerCase()}`);
}
