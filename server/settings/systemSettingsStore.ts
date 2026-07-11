import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import {
  ensurePrivateSettingsStorage,
  privateLegacySystemSettingsPath,
  privateSystemSettingsDirectory,
  privateSystemSettingsPath,
  publicLegacySystemSettingsExamplePath,
  publicSystemSettingsExamplePath,
} from "./settingsStorage";

export type RawSystemSettingsFile = {
  chat?: Record<string, unknown>;
  visual?: {
    backgrounds?: Record<string, unknown>;
  };
};

let settingsMutationQueue: Promise<void> = Promise.resolve();

function emptySystemSettings(): RawSystemSettingsFile {
  return {
    chat: {},
    visual: {
      backgrounds: {},
    },
  };
}

async function readSettingsJson(filePath: string) {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as RawSystemSettingsFile;
}

function normalizeRawSettings(input: RawSystemSettingsFile | null | undefined): RawSystemSettingsFile {
  return {
    ...input,
    chat: input?.chat ?? {},
    visual: {
      ...input?.visual,
      backgrounds: input?.visual?.backgrounds ?? {},
    },
  };
}

export async function ensureSystemSettingsDirectory() {
  await ensurePrivateSettingsStorage();
  await mkdir(privateSystemSettingsDirectory, { recursive: true, mode: 0o700 });
}

export async function readSystemSettingsFile(): Promise<RawSystemSettingsFile> {
  await ensureSystemSettingsDirectory();

  try {
    return normalizeRawSettings(await readSettingsJson(privateSystemSettingsPath));
  } catch {
    try {
      return normalizeRawSettings(await readSettingsJson(privateLegacySystemSettingsPath));
    } catch {
      try {
        return normalizeRawSettings(await readSettingsJson(publicSystemSettingsExamplePath));
      } catch {
        try {
          return normalizeRawSettings(await readSettingsJson(publicLegacySystemSettingsExamplePath));
        } catch {
          return emptySystemSettings();
        }
      }
    }
  }
}

async function writeSystemSettingsFile(settings: RawSystemSettingsFile) {
  await ensureSystemSettingsDirectory();
  const normalized = normalizeRawSettings(settings);
  const tempPath = `${privateSystemSettingsPath}.${process.pid}.${Date.now().toString(36)}.${randomUUID()}.tmp`;

  try {
    await writeFile(tempPath, `${JSON.stringify(normalized, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(tempPath, privateSystemSettingsPath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function updateSystemSettingsFile<T>(mutator: (settings: RawSystemSettingsFile) => T | Promise<T>) {
  const mutation = settingsMutationQueue.then(async () => {
    const settings = await readSystemSettingsFile();
    const result = await mutator(settings);
    await writeSystemSettingsFile(settings);
    return result;
  });
  settingsMutationQueue = mutation.then(() => undefined, () => undefined);
  return mutation;
}
