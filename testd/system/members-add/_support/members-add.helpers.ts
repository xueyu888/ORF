import { sql } from "drizzle-orm";
import { users } from "../../../../server/db/schema";
import { saveUserPreferences } from "../../../../server/settings/personalSettings";
import { db } from "../../../_operators/testd-db-client";

export async function setDefaultLandingPathByEmail(email: string, path: string | null) {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email.toLowerCase()}`);

  for (const row of rows) {
    await saveUserPreferences(row.id, { defaultLandingPath: path });
  }
}

export async function userCountByEmail(email: string) {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email.toLowerCase()}`);
  return rows.length;
}

export async function userExistsByName(name: string) {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.name}) = ${name.toLowerCase()}`)
    .limit(1);
  return rows.length > 0;
}
