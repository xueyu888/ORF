import { chmod, mkdir } from "node:fs/promises";
import path from "node:path";
import { env } from "../env";

const projectRoot = path.resolve(process.cwd());

export const publicSettingsRoot = path.join(projectRoot, "public", "settings");
export const privateSettingsRoot = path.resolve(env.ORF_SETTINGS_DATA_DIR);

function isSameOrDescendant(parentPath: string, candidatePath: string) {
  return candidatePath === parentPath || candidatePath.startsWith(`${parentPath}${path.sep}`);
}

if (isSameOrDescendant(privateSettingsRoot, projectRoot)) {
  throw new Error(`ORF_SETTINGS_DATA_DIR must not contain the project workspace: ${privateSettingsRoot}`);
}

for (const publishedRoot of [
  path.join(projectRoot, "public"),
  path.join(projectRoot, "dist"),
  path.join(projectRoot, ".artifacts"),
  path.join(projectRoot, "android", "app", "src", "main", "assets"),
]) {
  if (isSameOrDescendant(publishedRoot, privateSettingsRoot)) {
    throw new Error(`ORF_SETTINGS_DATA_DIR must not be inside a published artifact directory: ${privateSettingsRoot}`);
  }
}

export const privateSystemSettingsDirectory = path.join(privateSettingsRoot, "system");
export const privateSystemSettingsPath = path.join(privateSystemSettingsDirectory, "settings.json");

const privateUsersRoot = path.join(privateSettingsRoot, "users");
const publicBackgroundsRoot = path.join(publicSettingsRoot, "backgrounds");
const privateBackgroundsRoot = path.join(privateSettingsRoot, "backgrounds");

let storageInitialization: Promise<void> | null = null;

async function initializePrivateSettingsStorage() {
  await mkdir(privateSettingsRoot, { recursive: true, mode: 0o700 });
  await chmod(privateSettingsRoot, 0o700);
  await mkdir(privateSystemSettingsDirectory, { recursive: true, mode: 0o700 });
}

export function ensurePrivateSettingsStorage() {
  if (!storageInitialization) {
    storageInitialization = initializePrivateSettingsStorage().catch((error) => {
      storageInitialization = null;
      throw error;
    });
  }
  return storageInitialization;
}

export function privateUserSettingsDirectory(userStorageId: string) {
  return path.join(privateUsersRoot, userStorageId);
}

export function visualBackgroundDirectory(scene: string, scope: string) {
  const root = scope === "default" ? publicBackgroundsRoot : privateBackgroundsRoot;
  return path.join(root, scene, scope);
}
