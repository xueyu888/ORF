import { rm, stat } from "node:fs/promises";
import { eq, sql } from "drizzle-orm";
import { users } from "../../../../server/db/schema";
import { deletePersonalBackground, listPersonalBackgrounds } from "../../../../server/settings/personalSettings";
import { readUserPreferences, saveUserPreferences } from "../../../../server/settings/personalSettings";
import { listVisualBackgrounds } from "../../../../server/settings/visualBackgrounds";
import type { VisualBackgroundConfig, VisualBackgroundImage } from "../../../../src/state/apiClient";
import { db } from "../../../_operators/testd-db-client";

export async function setDefaultLandingPathByEmail(email: string, path: string | null) {
  const rows = await readUserRowsByEmail(email);
  for (const row of rows) {
    await saveUserPreferences(row.id, { defaultLandingPath: path });
  }
}

export async function setAppBackgroundByEmail(email: string, config: VisualBackgroundConfig | null) {
  const rows = await readUserRowsByEmail(email);
  for (const row of rows) {
    await saveUserPreferences(row.id, { appBackground: config });
  }
}

export async function readAppBackgroundByEmail(email: string): Promise<VisualBackgroundConfig | null> {
  const [row] = await readUserRowsByEmail(email);
  if (!row) {
    return null;
  }
  return (await readUserPreferences(row.id)).appBackground;
}

export async function listPersonalBackgroundsByEmail(email: string): Promise<VisualBackgroundImage[]> {
  const [row] = await readUserRowsByEmail(email);
  if (!row) {
    return [];
  }
  const data = await listPersonalBackgrounds(row.id);
  return data.list.filter((background) => background.id.includes("/personal/"));
}

export async function deletePersonalBackgroundsByEmail(email: string) {
  const rows = await readUserRowsByEmail(email);
  for (const row of rows) {
    const backgrounds = await listPersonalBackgrounds(row.id).catch(() => null);
    if (!backgrounds) {
      continue;
    }
    for (const background of backgrounds.list.filter((item) => item.id.includes("/personal/"))) {
      await deletePersonalBackground(row.id, background.id).catch(async () => {
        if (background.fileKey) {
          await rm(background.fileKey, { force: true }).catch(() => undefined);
        }
      });
    }
  }
}

export async function personalBackgroundFileExists(email: string, backgroundId: string) {
  const backgrounds = await listPersonalBackgroundsByEmail(email);
  const background = backgrounds.find((item) => item.id === backgroundId);
  if (!background) {
    return false;
  }
  const fileStat = await stat(background.fileKey).catch(() => null);
  return Boolean(fileStat?.isFile());
}

export async function readDefaultAppBackground(): Promise<VisualBackgroundImage> {
  const data = await listVisualBackgrounds("app_background");
  const background = data.list.find((item) => item.isDefault) ?? data.list[0];
  if (!background) {
    throw new Error("缺少系统默认 AppShell 皮肤");
  }
  return background;
}

async function readUserRowsByEmail(email: string) {
  return db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email.toLowerCase()}`);
}

export async function deleteTestUserPreferencesByEmail(email: string) {
  const rows = await readUserRowsByEmail(email);
  for (const row of rows) {
    await saveUserPreferences(row.id, { appBackground: null, defaultLandingPath: null });
  }
}

export async function readUserIdByEmail(email: string) {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  return row?.id ?? null;
}
