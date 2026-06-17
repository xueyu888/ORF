import { stat } from "node:fs/promises";
import { sql } from "drizzle-orm";
import { users } from "../../../../server/db/schema";
import { readUserPreferences, saveUserPreferences } from "../../../../server/settings/personalSettings";
import { listVisualBackgrounds, parseBackgroundId } from "../../../../server/settings/visualBackgrounds";
import type { VisualBackgroundConfig, VisualBackgroundImage } from "../../../../src/state/apiClient";
import { db } from "../../../_operators/testd-db-client";

export async function setDefaultLandingPathByEmail(email: string, path: string | null) {
  const rows = await readUserIdsByEmail(email);
  for (const row of rows) {
    await saveUserPreferences(row.id, { defaultLandingPath: path });
  }
}

export async function setAppBackgroundByEmail(email: string, config: VisualBackgroundConfig | null) {
  const rows = await readUserIdsByEmail(email);
  for (const row of rows) {
    await saveUserPreferences(row.id, { appBackground: config });
  }
}

export async function readAppBackgroundByEmail(email: string): Promise<VisualBackgroundConfig | null> {
  const [row] = await readUserIdsByEmail(email);
  if (!row) {
    return null;
  }
  return (await readUserPreferences(row.id)).appBackground;
}

export async function listAppSystemBackgrounds(): Promise<VisualBackgroundImage[]> {
  const data = await listVisualBackgrounds("app_background");
  return data.list.filter((background) => !background.id.includes("/personal/"));
}

export async function readDefaultAppBackground(): Promise<VisualBackgroundImage> {
  const data = await listVisualBackgrounds("app_background");
  const background = data.list.find((item) => item.isDefault) ?? data.list[0];
  if (!background) {
    throw new Error("缺少系统默认 AppShell 皮肤");
  }
  return background;
}

export async function systemBackgroundFileExists(id: string) {
  const parsed = parseBackgroundId(id);
  const fileStat = await stat(parsed.filePath).catch(() => null);
  return Boolean(fileStat?.isFile());
}

async function readUserIdsByEmail(email: string) {
  return db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email.toLowerCase()}`);
}
