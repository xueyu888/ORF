import { sql } from "drizzle-orm";
import { users } from "../../../../server/db/schema";
import { readUserPreferences, saveUserPreferences } from "../../../../server/settings/personalSettings";
import type { ChatTheme } from "../../../../src/domain/settings/personalPreferences";
import { db } from "../../../_operators/testd-db-client";

export type ChatThemePreference = ChatTheme;

export async function setDefaultLandingPathByEmail(email: string, path: string | null) {
  const rows = await readUserIdsByEmail(email);
  for (const row of rows) {
    await saveUserPreferences(row.id, { defaultLandingPath: path });
  }
}

export async function setChatThemeByEmail(email: string, theme: ChatThemePreference) {
  const rows = await readUserIdsByEmail(email);
  for (const row of rows) {
    await saveUserPreferences(row.id, { chatTheme: theme });
  }
}

export async function readChatThemeByEmail(email: string): Promise<ChatThemePreference | null> {
  const [row] = await readUserIdsByEmail(email);
  if (!row) {
    return null;
  }
  return (await readUserPreferences(row.id)).chatTheme;
}

async function readUserIdsByEmail(email: string) {
  return db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email.toLowerCase()}`);
}
