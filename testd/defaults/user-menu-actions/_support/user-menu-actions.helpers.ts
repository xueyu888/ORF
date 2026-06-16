import { eq, sql } from "drizzle-orm";
import { users } from "../../../../server/db/schema";
import { objectStorage } from "../../../../server/storage/objectStorage";
import { saveUserPreferences } from "../../../../server/settings/personalSettings";
import { db } from "../../../_operators/testd-db-client";

const avatarPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
);

export async function setDefaultLandingPathByEmail(email: string, path: string | null) {
  const rows = await readUserAvatarRowsByEmail(email);
  for (const row of rows) {
    await saveUserPreferences(row.id, { defaultLandingPath: path });
  }
}

export async function uploadAvatarByEmail(email: string) {
  const rows = await readUserAvatarRowsByEmail(email);
  const updatedAt = new Date().toISOString();

  for (const row of rows) {
    if (row.avatarObjectKey) {
      await objectStorage.deleteObject(row.avatarObjectKey).catch(() => undefined);
    }

    const key = `testd/defaults/user-menu-actions/${row.id}/avatar.png`;
    await objectStorage.putObject({
      body: avatarPng,
      contentLength: avatarPng.byteLength,
      contentType: "image/png",
      key,
    });

    await db
      .update(users)
      .set({
        avatarMimeType: "image/png",
        avatarObjectKey: key,
        avatarUpdatedAt: updatedAt,
      })
      .where(eq(users.id, row.id));
  }
}

export async function deleteAvatarByEmail(email: string) {
  const rows = await readUserAvatarRowsByEmail(email);
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

async function readUserAvatarRowsByEmail(email: string) {
  return db
    .select({
      avatarObjectKey: users.avatarObjectKey,
      id: users.id,
    })
    .from(users)
    .where(sql`lower(${users.email}) = ${email.toLowerCase()}`);
}
