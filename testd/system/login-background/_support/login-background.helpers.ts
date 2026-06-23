import { unlink } from "node:fs/promises";
import { users } from "../../../../server/db/schema";
import {
  listVisualBackgrounds,
  parseBackgroundId,
  saveUploadedVisualBackground,
  saveVisualBackgroundConfig,
} from "../../../../server/settings/visualBackgrounds";
import { saveUserPreferences } from "../../../../server/settings/personalSettings";
import {
  defaultVisualBackgroundCrop,
  type VisualBackgroundConfig,
} from "../../../../src/domain/settings/visualBackgrounds";
import { db } from "../../../_operators/testd-db-client";
import { sql } from "drizzle-orm";

const ONE_PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

export async function setDefaultLandingPathByEmail(email: string, path: string | null) {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email.toLowerCase()}`);

  for (const row of rows) {
    await saveUserPreferences(row.id, { defaultLandingPath: path });
  }
}

export async function readLoginBackgroundConfig() {
  const data = await listVisualBackgrounds("login_background");
  return {
    config: data.config,
  };
}

export async function restoreLoginBackgroundConfig(config: VisualBackgroundConfig | null | undefined) {
  if (!config) {
    return;
  }

  await saveVisualBackgroundConfig("login_background", config);
}

export async function uploadLoginBackgroundFixture(fileName: string) {
  return saveUploadedVisualBackground({
    scene: "login_background",
    fileName,
    mimeType: "image/png",
    buffer: Buffer.from(ONE_PIXEL_PNG_BASE64, "base64"),
  });
}

export async function assertObjectStorageCanUploadAndRead() {
  const uploaded = await uploadLoginBackgroundFixture(`zzzz-testd-object-storage-ready-${Date.now()}.png`);
  const listed = await listVisualBackgrounds("login_background");
  const found = listed.list.some((background) => background.id === uploaded.id);
  await deleteUploadedBackground(uploaded.id);

  if (!found) {
    throw new Error("对象存储服务无法读取刚上传的系统背景图片");
  }
}

export async function deleteUploadedBackground(id: string | null | undefined) {
  if (!id) {
    return;
  }

  const parsed = parseBackgroundId(id);
  if (parsed.storageScope !== "system") {
    return;
  }

  await unlink(parsed.filePath).catch((error: unknown) => {
    if (typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "ENOENT") {
      return;
    }
    throw error;
  });
}

export async function saveLoginBackgroundConfig(input: {
  backgroundId: string;
  mode: "switchable";
  switchTrigger: "interval";
  switchOrder: "random";
  switchIntervalMinutes: number;
}) {
  await saveVisualBackgroundConfig("login_background", {
    version: 2,
    fitMode: "cover-crop",
    fixedBackgroundId: input.backgroundId,
    mode: input.mode,
    overlayOpacity: 0.58,
    switchTrigger: input.switchTrigger,
    switchOrder: input.switchOrder,
    switchIntervalMinutes: input.switchIntervalMinutes,
    crops: {
      [input.backgroundId]: defaultVisualBackgroundCrop,
    },
  });
}

export async function loginBackgroundListContains(id: string) {
  const data = await listVisualBackgrounds("login_background");
  return data.list.some((background) => background.id === id);
}
