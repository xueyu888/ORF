import { eq, sql } from "drizzle-orm";
import { users } from "../../../../server/db/schema";
import { saveUserPreferences } from "../../../../server/settings/personalSettings";
import { objectStorage } from "../../../../server/storage/objectStorage";
import { db } from "../../../_operators/testd-db-client";

export async function setDefaultLandingPathByEmail(email: string, path: string | null) {
  const rows = await readUserRowsByEmail(email);
  for (const row of rows) {
    await saveUserPreferences(row.id, { defaultLandingPath: path });
  }
}

export async function deleteAvatarByEmail(email: string) {
  const rows = await readUserRowsByEmail(email);
  for (const row of rows) {
    if (row.avatarObjectKey) {
      await objectStorage.deleteObject(row.avatarObjectKey).catch(() => undefined);
    }

    await db
      .update(users)
      .set({
        avatarMimeType: null,
        avatarObjectKey: null,
        avatarUpdatedAt: null,
      })
      .where(eq(users.id, row.id));
  }
}

export async function readAvatarObjectKeyByEmail(email: string) {
  const [row] = await readUserRowsByEmail(email);
  return row?.avatarObjectKey ?? null;
}

async function readUserRowsByEmail(email: string) {
  return db
    .select({
      avatarObjectKey: users.avatarObjectKey,
      id: users.id,
    })
    .from(users)
    .where(sql`lower(${users.email}) = ${email.toLowerCase()}`);
}
