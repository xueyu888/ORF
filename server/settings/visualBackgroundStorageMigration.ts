import { constants } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, rename, rm, rmdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { visualBackgroundScenes } from "../../src/domain/settings/visualBackgrounds";

const migrationName = "visual-background-v4";
const legacyScene = "app_background";
const canonicalLegacyScene = "sidebar_background";

type JsonRecord = Record<string, unknown>;

type MigratedImage = {
  digest: string;
  newId: string;
  oldId: string;
  sourcePath: string;
};

export type VisualBackgroundStorageMigrationResult = {
  migratedImages: number;
  migratedPreferences: number;
  migratedSystemSettings: boolean;
};

function isNodeError(error: unknown, code: string) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === code;
}

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as JsonRecord : null;
}

async function fileDigest(filePath: string) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

async function fileExists(filePath: string) {
  return Boolean(await stat(filePath).catch((error) => {
    if (isNodeError(error, "ENOENT")) return null;
    throw error;
  }));
}

async function sameFile(firstPath: string, secondPath: string) {
  const [firstStat, secondStat] = await Promise.all([stat(firstPath), stat(secondPath)]);
  return firstStat.size === secondStat.size && await fileDigest(firstPath) === await fileDigest(secondPath);
}

function conflictFileName(fileName: string, digest: string) {
  const parsed = path.parse(fileName);
  return `${parsed.name}-legacy-${digest.slice(0, 12)}${parsed.ext}`;
}

async function canonicalTarget(sourcePath: string, targetDirectory: string, fileName: string, digest: string) {
  const preferredPath = path.join(targetDirectory, fileName);
  if (!await fileExists(preferredPath) || await sameFile(sourcePath, preferredPath)) {
    return { fileName, filePath: preferredPath };
  }

  const resolvedName = conflictFileName(fileName, digest);
  const resolvedPath = path.join(targetDirectory, resolvedName);
  if (await fileExists(resolvedPath) && !await sameFile(sourcePath, resolvedPath)) {
    throw new Error(`Visual background migration conflict: ${resolvedPath}`);
  }
  return { fileName: resolvedName, filePath: resolvedPath };
}

async function copyLegacyImage(input: {
  fileName: string;
  newId: (fileName: string) => string;
  oldId: string;
  sourcePath: string;
  targetDirectory: string;
}) {
  const digest = await fileDigest(input.sourcePath);
  await mkdir(input.targetDirectory, { recursive: true, mode: 0o700 });
  const target = await canonicalTarget(input.sourcePath, input.targetDirectory, input.fileName, digest);
  if (!await fileExists(target.filePath)) {
    await copyFile(input.sourcePath, target.filePath, constants.COPYFILE_EXCL);
  }
  if (!await sameFile(input.sourcePath, target.filePath)) {
    throw new Error(`Visual background migration copy mismatch: ${input.sourcePath}`);
  }
  return {
    digest,
    newId: input.newId(target.fileName),
    oldId: input.oldId,
    sourcePath: input.sourcePath,
  } satisfies MigratedImage;
}

async function imageFiles(directory: string) {
  return (await readdir(directory, { withFileTypes: true }).catch((error) => {
    if (isNodeError(error, "ENOENT")) return [];
    throw error;
  })).filter((entry) => entry.isFile());
}

async function collectSharedLegacyImages(settingsRoot: string) {
  const migrated: MigratedImage[] = [];
  const backgroundsRoot = path.join(settingsRoot, "backgrounds");
  const sources = [
    ...["system", "user"].map((scope) => ({
      sourceDirectory: path.join(backgroundsRoot, legacyScene, scope),
      oldId: (fileName: string) => `${legacyScene}/${scope}/${fileName}`,
      targetDirectory: path.join(backgroundsRoot, canonicalLegacyScene, "system"),
      newId: (fileName: string) => `${canonicalLegacyScene}/system/${fileName}`,
    })),
    ...visualBackgroundScenes.map((scene) => ({
      sourceDirectory: path.join(backgroundsRoot, scene, "user"),
      oldId: (fileName: string) => `${scene}/user/${fileName}`,
      targetDirectory: path.join(backgroundsRoot, scene, "system"),
      newId: (fileName: string) => `${scene}/system/${fileName}`,
    })),
  ];

  for (const source of sources) {
    for (const entry of await imageFiles(source.sourceDirectory)) {
      migrated.push(await copyLegacyImage({
        fileName: entry.name,
        newId: source.newId,
        oldId: source.oldId(entry.name),
        sourcePath: path.join(source.sourceDirectory, entry.name),
        targetDirectory: source.targetDirectory,
      }));
    }
  }
  return migrated;
}

async function collectPersonalLegacyImages(settingsRoot: string, userStorageId: string) {
  const sourceDirectory = path.join(settingsRoot, "users", userStorageId, "backgrounds", legacyScene);
  const targetDirectory = path.join(settingsRoot, "users", userStorageId, "backgrounds", canonicalLegacyScene);
  const migrated: MigratedImage[] = [];
  for (const entry of await imageFiles(sourceDirectory)) {
    migrated.push(await copyLegacyImage({
      fileName: entry.name,
      newId: (fileName) => `${canonicalLegacyScene}/personal/${fileName}`,
      oldId: `${legacyScene}/personal/${entry.name}`,
      sourcePath: path.join(sourceDirectory, entry.name),
      targetDirectory,
    }));
  }
  return migrated;
}

function rewriteBackgroundIds(value: unknown, idMap: ReadonlyMap<string, string>): unknown {
  if (typeof value === "string") return idMap.get(value) ?? value;
  if (Array.isArray(value)) return value.map((item) => rewriteBackgroundIds(item, idMap));
  const record = asRecord(value);
  if (!record) return value;
  return Object.fromEntries(
    Object.entries(record).map(([key, item]) => [idMap.get(key) ?? key, rewriteBackgroundIds(item, idMap)]),
  );
}

function canonicalizeSystemSettings(value: unknown, idMap: ReadonlyMap<string, string>) {
  const settings = asRecord(rewriteBackgroundIds(value, idMap));
  const visual = asRecord(settings?.visual);
  const backgrounds = asRecord(visual?.backgrounds);
  if (!settings || !visual || !backgrounds || !Object.prototype.hasOwnProperty.call(backgrounds, legacyScene)) {
    return settings;
  }
  const legacyConfig = backgrounds[legacyScene];
  if (backgrounds.topbar_background === undefined) backgrounds.topbar_background = legacyConfig;
  if (backgrounds.sidebar_background === undefined) backgrounds.sidebar_background = legacyConfig;
  delete backgrounds[legacyScene];
  return settings;
}

function canonicalizeUserPreferences(value: unknown, idMap: ReadonlyMap<string, string>) {
  const preferences = asRecord(rewriteBackgroundIds(value, idMap));
  if (!preferences) return null;
  const backgrounds = asRecord(preferences.backgrounds) ?? {};
  preferences.backgrounds = backgrounds;

  const legacyConfig = preferences.appBackground ?? backgrounds[legacyScene];
  if (legacyConfig !== undefined && legacyConfig !== null) {
    if (backgrounds.topbar_background === undefined) backgrounds.topbar_background = legacyConfig;
    if (backgrounds.sidebar_background === undefined) backgrounds.sidebar_background = legacyConfig;
  }
  delete preferences.appBackground;
  delete backgrounds[legacyScene];

  const migration = asRecord(preferences.migration);
  if (migration && Object.prototype.hasOwnProperty.call(migration, "appBackgroundV2")) {
    delete migration.appBackgroundV2;
    if (Object.keys(migration).length === 0) delete preferences.migration;
  }
  return preferences;
}

async function archiveOriginal(sourcePath: string, archivePath: string) {
  await mkdir(path.dirname(archivePath), { recursive: true, mode: 0o700 });
  try {
    await copyFile(sourcePath, archivePath, constants.COPYFILE_EXCL);
  } catch (error) {
    if (!isNodeError(error, "EEXIST") || !await sameFile(sourcePath, archivePath)) throw error;
  }
}

async function writeJsonAtomic(filePath: string, value: unknown) {
  const tempPath = `${filePath}.${process.pid}.${Date.now().toString(36)}.${randomUUID()}.tmp`;
  try {
    await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(tempPath, filePath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function migrateJsonFile(input: {
  archivePath: string;
  filePath: string;
  transform: (value: unknown) => JsonRecord | null;
}) {
  const raw = await readFile(input.filePath, "utf8").catch((error) => {
    if (isNodeError(error, "ENOENT")) return null;
    throw error;
  });
  if (raw === null) return false;
  const current = JSON.parse(raw) as unknown;
  const migrated = input.transform(current);
  if (!migrated || JSON.stringify(migrated) === JSON.stringify(current)) return false;
  await archiveOriginal(input.filePath, input.archivePath);
  await writeJsonAtomic(input.filePath, migrated);
  return true;
}

async function moveLegacyImagesToAudit(settingsRoot: string, images: readonly MigratedImage[]) {
  const archiveRoot = path.join(settingsRoot, "migration-audit", migrationName, "files");
  for (const image of images) {
    if (!await fileExists(image.sourcePath)) continue;
    const relativePath = path.relative(settingsRoot, image.sourcePath);
    const parsed = path.parse(relativePath);
    const archivePath = path.join(archiveRoot, parsed.dir, `${parsed.name}-${image.digest.slice(0, 12)}${parsed.ext}`);
    await mkdir(path.dirname(archivePath), { recursive: true, mode: 0o700 });
    if (await fileExists(archivePath)) {
      if (!await sameFile(image.sourcePath, archivePath)) {
        throw new Error(`Visual background migration archive conflict: ${archivePath}`);
      }
      const duplicateArchivePath = path.join(
        path.dirname(archivePath),
        `${parsed.name}-${image.digest.slice(0, 12)}-duplicate-${randomUUID()}${parsed.ext}`,
      );
      await rename(image.sourcePath, duplicateArchivePath);
      continue;
    }
    await rename(image.sourcePath, archivePath);
  }
}

async function removeEmptyLegacyDirectories(settingsRoot: string, userStorageIds: readonly string[]) {
  const candidates = [
    path.join(settingsRoot, "backgrounds", legacyScene, "system"),
    path.join(settingsRoot, "backgrounds", legacyScene, "user"),
    path.join(settingsRoot, "backgrounds", legacyScene, "personal"),
    ...visualBackgroundScenes.map((scene) => path.join(settingsRoot, "backgrounds", scene, "user")),
    ...userStorageIds.map((userStorageId) => path.join(settingsRoot, "users", userStorageId, "backgrounds", legacyScene)),
    path.join(settingsRoot, "backgrounds", legacyScene),
  ];
  for (const directory of candidates) {
    await rmdir(directory).catch((error) => {
      if (!isNodeError(error, "ENOENT") && !isNodeError(error, "ENOTEMPTY")) throw error;
    });
  }
}

export async function migrateLegacyVisualBackgroundStorage(settingsRoot: string): Promise<VisualBackgroundStorageMigrationResult> {
  const auditRoot = path.join(settingsRoot, "migration-audit", migrationName);
  const usersRoot = path.join(settingsRoot, "users");
  const userStorageIds = (await readdir(usersRoot, { withFileTypes: true }).catch((error) => {
    if (isNodeError(error, "ENOENT")) return [];
    throw error;
  })).filter((entry) => entry.isDirectory()).map((entry) => entry.name);

  const sharedImages = await collectSharedLegacyImages(settingsRoot);
  const sharedIdMap = new Map(sharedImages.map((image) => [image.oldId, image.newId]));
  const personalImagesByUser = new Map<string, MigratedImage[]>();
  for (const userStorageId of userStorageIds) {
    personalImagesByUser.set(userStorageId, await collectPersonalLegacyImages(settingsRoot, userStorageId));
  }

  const migratedSystemSettings = await migrateJsonFile({
    archivePath: path.join(auditRoot, "system", "settings.json"),
    filePath: path.join(settingsRoot, "system", "settings.json"),
    transform: (value) => canonicalizeSystemSettings(value, sharedIdMap),
  });

  let migratedPreferences = 0;
  for (const userStorageId of userStorageIds) {
    const personalImages = personalImagesByUser.get(userStorageId) ?? [];
    const idMap = new Map([...sharedIdMap, ...personalImages.map((image) => [image.oldId, image.newId] as const)]);
    const changed = await migrateJsonFile({
      archivePath: path.join(auditRoot, "users", userStorageId, "preferences.json"),
      filePath: path.join(usersRoot, userStorageId, "preferences.json"),
      transform: (value) => canonicalizeUserPreferences(value, idMap),
    });
    if (changed) migratedPreferences += 1;
  }

  const migratedImages = [...sharedImages, ...personalImagesByUser.values()].flat();
  await moveLegacyImagesToAudit(settingsRoot, migratedImages);
  await removeEmptyLegacyDirectories(settingsRoot, userStorageIds);
  if (migratedImages.length > 0 || migratedPreferences > 0 || migratedSystemSettings) {
    const migratedAt = new Date().toISOString();
    const resultRecord = {
      migratedAt,
      migratedImages: migratedImages.map(({ digest, newId, oldId, sourcePath }) => ({
        digest,
        newId,
        oldId,
        source: path.relative(settingsRoot, sourcePath),
      })),
      migratedPreferences,
      migratedSystemSettings,
      version: 1,
    };
    await mkdir(auditRoot, { recursive: true, mode: 0o700 });
    const resultArchivePath = path.join(
      auditRoot,
      "results",
      `${migratedAt.replaceAll(":", "-")}-${randomUUID()}.json`,
    );
    await mkdir(path.dirname(resultArchivePath), { recursive: true, mode: 0o700 });
    await writeJsonAtomic(resultArchivePath, resultRecord);
    await writeJsonAtomic(path.join(auditRoot, "latest-result.json"), resultRecord);
  }

  return { migratedImages: migratedImages.length, migratedPreferences, migratedSystemSettings };
}
