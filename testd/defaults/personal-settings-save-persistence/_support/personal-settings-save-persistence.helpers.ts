import { sql } from "drizzle-orm";
import { users } from "../../../../server/db/schema";
import { readUserPreferences, saveUserPreferences } from "../../../../server/settings/personalSettings";
import type { ChatTheme } from "../../../../src/domain/settings/personalPreferences";
import { db } from "../../../_operators/testd-db-client";

export type SidebarPreferenceState = "system" | "expanded" | "collapsed";
export type ChatThemePreference = ChatTheme;

export type SavedPreferences = {
  chatTheme: ChatThemePreference;
  defaultLandingPath: string | null;
  sidebarState: SidebarPreferenceState;
  toastEnabled: boolean;
};

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

export async function setChatThemeByEmail(email: string, theme: ChatThemePreference) {
  const rows = await readUserIdsByEmail(email);
  for (const row of rows) {
    await saveUserPreferences(row.id, { chatTheme: theme });
  }
}

export async function setToastEnabledByEmail(email: string, enabled: boolean) {
  const rows = await readUserIdsByEmail(email);
  for (const row of rows) {
    await saveUserPreferences(row.id, { notificationDisplay: { toastEnabled: enabled } });
  }
}

export async function readSavedPreferencesByEmail(email: string): Promise<SavedPreferences | null> {
  const [row] = await readUserIdsByEmail(email);
  if (!row) {
    return null;
  }
  const preferences = await readUserPreferences(row.id);
  return {
    chatTheme: preferences.chatTheme,
    defaultLandingPath: preferences.defaultLandingPath,
    sidebarState: preferences.sidebarCollapsed === null ? "system" : preferences.sidebarCollapsed ? "collapsed" : "expanded",
    toastEnabled: preferences.notificationDisplay.toastEnabled,
  };
}

async function readUserIdsByEmail(email: string) {
  return db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email.toLowerCase()}`);
}
