import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export type RawSystemSettingsFile = {
  chat?: Record<string, unknown>;
  visual?: {
    backgrounds?: Record<string, unknown>;
  };
};

const settingsRoot = path.join(process.cwd(), "public", "settings");
const systemSettingsDir = path.join(settingsRoot, "system");
const systemSettingsPath = path.join(systemSettingsDir, "settings.json");
const systemSettingsExamplePath = path.join(systemSettingsDir, "settings.json.example");
const legacySystemSettingsDir = path.join(settingsRoot, "user");
const legacySystemSettingsPath = path.join(legacySystemSettingsDir, "settings.json");
const legacySystemSettingsExamplePath = path.join(legacySystemSettingsDir, "settings.json.example");

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
  await mkdir(systemSettingsDir, { recursive: true });
}

export async function readSystemSettingsFile(): Promise<RawSystemSettingsFile> {
  await ensureSystemSettingsDirectory();

  try {
    return normalizeRawSettings(await readSettingsJson(systemSettingsPath));
  } catch {
    try {
      return normalizeRawSettings(await readSettingsJson(systemSettingsExamplePath));
    } catch {
      try {
        return normalizeRawSettings(await readSettingsJson(legacySystemSettingsPath));
      } catch {
        try {
          return normalizeRawSettings(await readSettingsJson(legacySystemSettingsExamplePath));
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
  const tempPath = `${systemSettingsPath}.${process.pid}.${Date.now().toString(36)}.${randomUUID()}.tmp`;

  try {
    await writeFile(tempPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
    await rename(tempPath, systemSettingsPath);
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
