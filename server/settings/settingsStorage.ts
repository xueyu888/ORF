import { chmod, cp, lstat, mkdir, readFile, readdir, rename, rm, rmdir, unlink } from "node:fs/promises";
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
export const privateLegacySystemSettingsPath = path.join(privateSettingsRoot, "legacy", "system", "settings.json");
export const publicSystemSettingsExamplePath = path.join(publicSettingsRoot, "system", "settings.json.example");
export const publicLegacySystemSettingsExamplePath = path.join(publicSettingsRoot, "user", "settings.json.example");

const publicUsersRoot = path.join(publicSettingsRoot, "users");
const privateUsersRoot = path.join(privateSettingsRoot, "users");
const publicBackgroundsRoot = path.join(publicSettingsRoot, "backgrounds");
const privateBackgroundsRoot = path.join(privateSettingsRoot, "backgrounds");
const mutableBackgroundScopes = ["system", "user", "personal"] as const;

let storageInitialization: Promise<void> | null = null;

function isNodeError(error: unknown, code: string) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === code;
}

async function pathStat(filePath: string) {
  return lstat(filePath).catch((error) => {
    if (isNodeError(error, "ENOENT")) {
      return null;
    }
    throw error;
  });
}

async function filesEqual(firstPath: string, secondPath: string) {
  const [firstStat, secondStat] = await Promise.all([lstat(firstPath), lstat(secondPath)]);
  if (firstStat.size !== secondStat.size) {
    return false;
  }
  const [first, second] = await Promise.all([readFile(firstPath), readFile(secondPath)]);
  return first.equals(second);
}

async function moveAcrossDevices(sourcePath: string, targetPath: string, sourceIsDirectory: boolean) {
  await cp(sourcePath, targetPath, {
    recursive: sourceIsDirectory,
    errorOnExist: true,
    force: false,
    preserveTimestamps: true,
  });
  await rm(sourcePath, { recursive: sourceIsDirectory, force: false });
}

async function moveWithoutOverwrite(sourcePath: string, targetPath: string): Promise<void> {
  const sourceStat = await pathStat(sourcePath);
  if (!sourceStat) {
    return;
  }
  if (sourceStat.isSymbolicLink()) {
    throw new Error(`Refusing to migrate symbolic link from public settings storage: ${sourcePath}`);
  }

  const targetStat = await pathStat(targetPath);
  if (!targetStat) {
    await mkdir(path.dirname(targetPath), { recursive: true, mode: 0o700 });
    try {
      await rename(sourcePath, targetPath);
    } catch (error) {
      if (!isNodeError(error, "EXDEV")) {
        throw error;
      }
      await moveAcrossDevices(sourcePath, targetPath, sourceStat.isDirectory());
    }
    return;
  }

  if (sourceStat.isDirectory() && targetStat.isDirectory()) {
    for (const entry of await readdir(sourcePath)) {
      await moveWithoutOverwrite(path.join(sourcePath, entry), path.join(targetPath, entry));
    }
    await rmdir(sourcePath);
    return;
  }

  if (sourceStat.isFile() && targetStat.isFile() && await filesEqual(sourcePath, targetPath)) {
    await unlink(sourcePath);
    return;
  }

  throw new Error(`Settings migration conflict: ${sourcePath} cannot overwrite ${targetPath}`);
}

async function migrateMutableBackgrounds() {
  const sceneEntries = await readdir(publicBackgroundsRoot, { withFileTypes: true }).catch((error) => {
    if (isNodeError(error, "ENOENT")) {
      return [];
    }
    throw error;
  });

  for (const sceneEntry of sceneEntries) {
    if (!sceneEntry.isDirectory()) {
      continue;
    }
    for (const scope of mutableBackgroundScopes) {
      await moveWithoutOverwrite(
        path.join(publicBackgroundsRoot, sceneEntry.name, scope),
        path.join(privateBackgroundsRoot, sceneEntry.name, scope),
      );
    }
  }
}

async function initializePrivateSettingsStorage() {
  await mkdir(privateSettingsRoot, { recursive: true, mode: 0o700 });
  await chmod(privateSettingsRoot, 0o700);
  await Promise.all([
    moveWithoutOverwrite(publicUsersRoot, privateUsersRoot),
    moveWithoutOverwrite(path.join(publicSettingsRoot, "system", "settings.json"), privateSystemSettingsPath),
    moveWithoutOverwrite(path.join(publicSettingsRoot, "user", "settings.json"), privateLegacySystemSettingsPath),
  ]);
  await migrateMutableBackgrounds();
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
