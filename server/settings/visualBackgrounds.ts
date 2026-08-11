import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  defaultVisualBackgroundConfig,
  defaultLegacyVisualBackgroundOverlayOpacity,
  normalizeVisualBackgroundCrop,
  normalizeVisualBackgroundMigration,
  normalizeVisualMaterialPreferences,
  visualBackgroundCropLimits,
  legacyVisualBackgroundOverlayLimits,
  visualMaterialExposureLimits,
  visualMaterialStrengthLimits,
  visualMaterialTones,
  visualMaterialPreferencesNeedMigration,
  visualBackgroundScenes,
  visualBackgroundScopes,
  type VisualBackgroundScene as CanonicalBackgroundScene,
  type VisualBackgroundScope as CanonicalBackgroundScope,
} from "../../src/domain/settings/visualBackgrounds";
import { ensureSystemSettingsDirectory, readSystemSettingsFile, updateSystemSettingsFile, type RawSystemSettingsFile } from "./systemSettingsStore";
import { ensurePrivateSettingsStorage, visualBackgroundDirectory } from "./settingsStorage";

const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"]);
const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);
const maxUploadSize = 10 * 1024 * 1024;

export const backgroundSceneSchema = z.enum(visualBackgroundScenes);
export const backgroundScenePathSchema = z.enum(visualBackgroundScenes);
export const backgroundStorageScenePathSchema = z.enum(visualBackgroundScenes);
const backgroundScopeSchema = z.enum(visualBackgroundScopes);
export const backgroundScopePathSchema = z.enum(visualBackgroundScopes);
export const backgroundModeSchema = z.enum(["fixed", "switchable"]);
export const backgroundSwitchTriggerSchema = z.enum(["on_open", "interval"]);
export const backgroundSwitchOrderSchema = z.enum(["sequential", "random"]);
export const backgroundFitModeSchema = z.enum(["cover-crop"]);
export const backgroundCropSchema = z
  .object({
    centerX: z.coerce.number().min(visualBackgroundCropLimits.centerMin).max(visualBackgroundCropLimits.centerMax).optional(),
    centerY: z.coerce.number().min(visualBackgroundCropLimits.centerMin).max(visualBackgroundCropLimits.centerMax).optional(),
    zoom: z.coerce.number().min(visualBackgroundCropLimits.zoomMin).max(visualBackgroundCropLimits.zoomMax).optional(),
    offsetX: z.coerce.number().min(-100).max(100).optional(),
    offsetY: z.coerce.number().min(-100).max(100).optional(),
    scale: z.coerce.number().min(0.5).max(visualBackgroundCropLimits.zoomMax).optional(),
  })
  .transform((crop) => normalizeVisualBackgroundCrop(crop));
const legacyBackgroundOverlayOpacitySchema = z.coerce.number().min(legacyVisualBackgroundOverlayLimits.opacityMin).max(legacyVisualBackgroundOverlayLimits.opacityMax);
const backgroundMaterialPreferencesSchema = z
  .object({
    tone: z.enum(visualMaterialTones).optional(),
    exposure: z.coerce.number().min(visualMaterialExposureLimits.min).max(visualMaterialExposureLimits.max).optional(),
    overlayStrength: z.coerce.number().min(visualMaterialStrengthLimits.min).max(visualMaterialStrengthLimits.max).optional(),
    blurStrength: z.coerce.number().min(visualMaterialStrengthLimits.min).max(visualMaterialStrengthLimits.max).optional(),
    reduceTransparency: z.boolean().optional(),
  })
  .optional();
const backgroundMigrationSchema = z
  .object({
    overlayOpacityV2: legacyBackgroundOverlayOpacitySchema.nullable().optional(),
  })
  .optional();
export const backgroundSceneConfigSchema = z
  .object({
    version: z.union([z.literal(2), z.literal(3), z.literal(4)]).optional(),
    fitMode: backgroundFitModeSchema.optional(),
    mode: backgroundModeSchema,
    fixedBackgroundId: z.string().nullable(),
    overlayOpacity: legacyBackgroundOverlayOpacitySchema.optional(),
    material: backgroundMaterialPreferencesSchema,
    migration: backgroundMigrationSchema,
    switchTrigger: backgroundSwitchTriggerSchema,
    switchOrder: backgroundSwitchOrderSchema,
    switchIntervalMinutes: z.coerce.number().int().min(1).max(1440),
    crops: z.record(z.string(), backgroundCropSchema).optional(),
    placements: z.record(z.string(), backgroundCropSchema).optional(),
  })
  .transform((config) => {
    const legacyOverlayOpacity = config.migration?.overlayOpacityV2
      ?? (config.version === 3 || config.version === 4 || config.material ? undefined : config.overlayOpacity ?? defaultLegacyVisualBackgroundOverlayOpacity);
    return {
      version: 4 as const,
      fitMode: "cover-crop" as const,
      mode: config.mode,
      fixedBackgroundId: config.fixedBackgroundId,
      material: normalizeVisualMaterialPreferences(config.material, legacyOverlayOpacity),
      migration: normalizeVisualBackgroundMigration(config.migration, legacyOverlayOpacity),
      switchTrigger: config.switchTrigger,
      switchOrder: config.switchOrder,
      switchIntervalMinutes: config.switchIntervalMinutes,
      crops: Object.fromEntries(
        Object.entries(config.crops ?? config.placements ?? {}).map(([backgroundId, crop]) => [backgroundId, normalizeVisualBackgroundCrop(crop)]),
      ),
    };
  });
export type BackgroundScene = z.infer<typeof backgroundSceneSchema>;
export type BackgroundSceneConfig = z.infer<typeof backgroundSceneConfigSchema>;
export type BackgroundScope = CanonicalBackgroundScope;

export type VisualBackgroundImage = {
  id: string;
  scene: BackgroundScene;
  fileName: string;
  url: string;
  fileKey: string;
  mimeType: string;
  fileSize: number;
  isDefault: boolean;
  createdAt?: string;
};

type VisualSettings = {
  visual: {
    backgrounds: Record<CanonicalBackgroundScene, BackgroundSceneConfig>;
  };
};

type LegacyBackgroundConfig = {
  version?: unknown;
  fitMode?: unknown;
  mode?: BackgroundSceneConfig["mode"];
  fixedBackgroundId?: unknown;
  overlayOpacity?: unknown;
  material?: BackgroundSceneConfig["material"];
  migration?: BackgroundSceneConfig["migration"];
  switchTrigger?: BackgroundSceneConfig["switchTrigger"];
  switchOrder?: BackgroundSceneConfig["switchOrder"];
  switchIntervalMinutes?: unknown;
  crops?: unknown;
  defaultBackgroundId?: unknown;
  placements?: unknown;
};

type ParsedBackgroundId = {
  scene: CanonicalBackgroundScene;
  scope: CanonicalBackgroundScope;
  storageScene: CanonicalBackgroundScene;
  storageScope: CanonicalBackgroundScope;
  fileName: string;
  filePath: string;
};

const emptyVisualSettings = (): VisualSettings => ({
  visual: {
    backgrounds: Object.fromEntries(visualBackgroundScenes.map((scene) => [scene, defaultVisualBackgroundConfig()])) as Record<
      CanonicalBackgroundScene,
      BackgroundSceneConfig
    >,
  },
});

function sceneDir(scene: CanonicalBackgroundScene, scope: CanonicalBackgroundScope) {
  return visualBackgroundDirectory(scene, scope);
}

function sceneUrl(scene: CanonicalBackgroundScene, scope: CanonicalBackgroundScope, fileName: string) {
  return `/settings/backgrounds/${scene}/${scope}/${encodeURIComponent(fileName)}`;
}

function mimeTypeFromFileName(fileName: string) {
  const extension = path.extname(fileName).toLowerCase();
  switch (extension) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".avif":
      return "image/avif";
    default:
      return "application/octet-stream";
  }
}

function extensionFromMimeType(mimeType: string) {
  switch (mimeType) {
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    case "image/avif":
      return ".avif";
    default:
      return "";
  }
}

export function isSupportedVisualBackgroundImage(mimeType: string, buffer: Buffer) {
  if (!allowedMimeTypes.has(mimeType)) {
    return false;
  }

  if (mimeType === "image/jpeg") {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }

  if (mimeType === "image/png") {
    return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }

  if (mimeType === "image/gif") {
    const signature = buffer.subarray(0, 6).toString("ascii");
    return signature === "GIF87a" || signature === "GIF89a";
  }

  if (mimeType === "image/webp") {
    return buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  }

  if (mimeType === "image/avif") {
    const brands = buffer.subarray(8, Math.min(buffer.length, 64)).toString("ascii");
    return buffer.length >= 16 && buffer.subarray(4, 8).toString("ascii") === "ftyp" && (brands.includes("avif") || brands.includes("avis"));
  }

  return false;
}

function sanitizeFileName(fileName: string, mimeType: string) {
  const parsed = path.parse(fileName);
  const fallbackExtension = extensionFromMimeType(mimeType);
  const extension = imageExtensions.has(parsed.ext.toLowerCase()) ? parsed.ext.toLowerCase() : fallbackExtension;
  const safeBase = parsed.name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72);

  return `${safeBase || "background"}${extension || ".png"}`;
}

function uploadFileNameCandidate(fileName: string, attempt: number) {
  if (attempt === 0) {
    return fileName;
  }

  const parsed = path.parse(fileName);
  return `${parsed.name}-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}${parsed.ext}`;
}

function isFileExistsError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "EEXIST";
}

async function writeUniqueUploadFile(directory: string, fileName: string, buffer: Buffer) {
  const maxAttempts = 20;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = uploadFileNameCandidate(fileName, attempt);
    const filePath = path.join(directory, candidate);

    try {
      await writeFile(filePath, buffer, { flag: "wx" });
      return { fileName: candidate, filePath };
    } catch (error) {
      if (isFileExistsError(error)) {
        continue;
      }

      throw error;
    }
  }

  throw new Error("file already exists");
}

async function ensureBackgroundDirectories() {
  await Promise.all([
    ensurePrivateSettingsStorage(),
    ensureSystemSettingsDirectory(),
    ...visualBackgroundScenes.map((scene) => mkdir(sceneDir(scene, "system"), { recursive: true })),
  ]);
}

function normalizeBackgroundConfig(input: LegacyBackgroundConfig | null | undefined): BackgroundSceneConfig {
  const fallback = defaultVisualBackgroundConfig();
  const legacyFixedBackgroundId = typeof input?.defaultBackgroundId === "string" ? input.defaultBackgroundId : null;
  const fixedBackgroundId = typeof input?.fixedBackgroundId === "string" ? input.fixedBackgroundId : legacyFixedBackgroundId;

  return backgroundSceneConfigSchema.parse({
    version: input?.version,
    mode: input?.mode ?? fallback.mode,
    fixedBackgroundId,
    overlayOpacity: input?.overlayOpacity,
    material: input?.material,
    migration: input?.migration,
    switchTrigger: input?.switchTrigger ?? fallback.switchTrigger,
    switchOrder: input?.switchOrder ?? fallback.switchOrder,
    switchIntervalMinutes: input?.switchIntervalMinutes ?? fallback.switchIntervalMinutes,
    crops: input?.crops ?? input?.placements ?? fallback.crops,
  });
}

function normalizeVisualSettings(input: RawSystemSettingsFile | null | undefined): VisualSettings {
  const settings = emptyVisualSettings();
  for (const scene of visualBackgroundScenes) {
    settings.visual.backgrounds[scene] = normalizeBackgroundConfig(
      input?.visual?.backgrounds?.[scene] as LegacyBackgroundConfig | undefined,
    );
  }
  return settings;
}

function visualSettingsNeedMigration(input: RawSystemSettingsFile | null | undefined) {
  const backgrounds = input?.visual?.backgrounds;
  if (!backgrounds) return true;
  return visualBackgroundScenes.some((scene) => {
    const config = backgrounds[scene];
    if (!config || typeof config !== "object") return true;
    const candidate = config as { material?: unknown; migration?: unknown; version?: unknown };
    return candidate.version !== 4
      || visualMaterialPreferencesNeedMigration(candidate.material)
      || !candidate.migration;
  });
}

async function readVisualSettings() {
  await ensureBackgroundDirectories();
  const rawSettings = await readSystemSettingsFile();
  const settings = normalizeVisualSettings(rawSettings);
  if (visualSettingsNeedMigration(rawSettings)) {
    await updateSystemSettingsFile((storedSettings) => {
      const migrated = normalizeVisualSettings(storedSettings);
      storedSettings.visual = storedSettings.visual ?? {};
      storedSettings.visual.backgrounds = storedSettings.visual.backgrounds ?? {};
      for (const scene of visualBackgroundScenes) {
        storedSettings.visual.backgrounds[scene] = migrated.visual.backgrounds[scene];
      }
    });
  }
  return settings;
}

function storageSceneNames(scene: CanonicalBackgroundScene): CanonicalBackgroundScene[] {
  return [scene, ...visualBackgroundScenes.filter((candidate) => candidate !== scene)];
}

async function scanBackgroundScope(scene: CanonicalBackgroundScene, scope: CanonicalBackgroundScope) {
  const images: VisualBackgroundImage[] = [];

  for (const storageScene of storageSceneNames(scene)) {
    const directory = sceneDir(storageScene, scope);
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    images.push(
      ...(await Promise.all(
        entries
          .filter((entry) => entry.isFile() && imageExtensions.has(path.extname(entry.name).toLowerCase()))
          .sort((first, second) => first.name.localeCompare(second.name))
          .map(async (entry) => {
            const filePath = path.join(directory, entry.name);
            const fileStat = await stat(filePath);
            const fileKey = `${storageScene}/${scope}/${entry.name}`;
            return {
              id: fileKey,
              scene,
              fileName: entry.name,
              url: sceneUrl(storageScene, scope, entry.name),
              fileKey,
              mimeType: mimeTypeFromFileName(entry.name),
              fileSize: fileStat.size,
              isDefault: false,
              createdAt: fileStat.birthtime.toISOString(),
            } satisfies VisualBackgroundImage;
          }),
      )),
    );
  }

  return images;
}

export async function listVisualBackgrounds(scene: BackgroundScene) {
  const settings = await readVisualSettings();
  const defaultImages = await scanBackgroundScope(scene, "default");
  const systemImages = await scanBackgroundScope(scene, "system");
  const list = [...defaultImages, ...systemImages];
  const config = settings.visual.backgrounds[scene];
  const configuredFixedExists = config.fixedBackgroundId ? list.some((image) => image.id === config.fixedBackgroundId) : false;
  const fixedBackgroundId = configuredFixedExists ? config.fixedBackgroundId : defaultImages[0]?.id ?? list[0]?.id ?? null;
  const normalizedConfig = {
    ...config,
    fixedBackgroundId,
  } satisfies BackgroundSceneConfig;

  return {
    scene,
    config: normalizedConfig,
    list: list.map((image) => ({ ...image, isDefault: image.id === fixedBackgroundId })),
  };
}

export function parseBackgroundId(id: string): ParsedBackgroundId {
  let decodedId: string;
  try {
    decodedId = decodeURIComponent(id);
  } catch {
    throw new Error("background not found");
  }

  const [sceneRaw, scopeRaw, ...fileNameParts] = decodedId.split("/");
  const scene = backgroundSceneSchema.parse(sceneRaw);
  const scope = backgroundScopeSchema.parse(scopeRaw);
  const storageScene = backgroundStorageScenePathSchema.parse(sceneRaw);
  const storageScope = backgroundScopeSchema.parse(scopeRaw);
  const fileName = fileNameParts.join("/");

  if (!fileName || fileName.includes("/") || fileName.includes("\\") || path.basename(fileName) !== fileName) {
    throw new Error("background not found");
  }

  return {
    scene,
    scope,
    storageScene,
    storageScope,
    fileName,
    filePath: path.join(sceneDir(storageScene, storageScope), fileName),
  };
}

export async function getVisualBackgroundFile(scene: CanonicalBackgroundScene, scope: CanonicalBackgroundScope, fileName: string) {
  const parsed = parseBackgroundId(`${scene}/${scope}/${fileName}`);
  const fileStat = await stat(parsed.filePath);
  if (!fileStat.isFile()) {
    throw new Error("background not found");
  }

  return {
    stream: createReadStream(parsed.filePath),
    mimeType: mimeTypeFromFileName(parsed.fileName),
  };
}

export async function saveUploadedVisualBackground(input: { scene: BackgroundScene; fileName: string; mimeType: string; buffer: Buffer }) {
  if (!isSupportedVisualBackgroundImage(input.mimeType, input.buffer)) {
    throw new Error("invalid file type");
  }

  if (input.buffer.length > maxUploadSize) {
    throw new Error("file too large");
  }

  const directory = sceneDir(input.scene, "system");
  await mkdir(directory, { recursive: true });
  const { fileName, filePath } = await writeUniqueUploadFile(directory, sanitizeFileName(input.fileName, input.mimeType), input.buffer);

  const fileStat = await stat(filePath);
  const fileKey = `${input.scene}/system/${fileName}`;
  return {
    id: fileKey,
    scene: input.scene,
    fileName,
    url: sceneUrl(input.scene, "system", fileName),
    fileKey,
    mimeType: input.mimeType,
    fileSize: fileStat.size,
    isDefault: false,
    createdAt: fileStat.birthtime.toISOString(),
  } satisfies VisualBackgroundImage;
}

async function assertBackgroundExists(id: string) {
  const parsed = parseBackgroundId(id);
  const fileStat = await stat(parsed.filePath).catch(() => null);
  if (!fileStat?.isFile()) {
    throw new Error("background not found");
  }
  return parsed;
}

export async function saveVisualBackgroundConfig(scene: BackgroundScene, input: BackgroundSceneConfig) {
  const config = backgroundSceneConfigSchema.parse(input);
  if (config.mode === "fixed" && !config.fixedBackgroundId) {
    throw new Error("invalid background config");
  }

  let fixedBackgroundId: string | null = null;
  if (config.fixedBackgroundId) {
    const fixedBackground = await assertBackgroundExists(config.fixedBackgroundId);
    if (fixedBackground.scope === "personal") {
      throw new Error("background not found");
    }
    fixedBackgroundId = `${fixedBackground.storageScene}/${fixedBackground.storageScope}/${fixedBackground.fileName}`;
  }

  return updateSystemSettingsFile((rawSettings) => {
    rawSettings.visual = rawSettings.visual ?? {};
    rawSettings.visual.backgrounds = rawSettings.visual.backgrounds ?? {};
    const savedConfig = {
      ...config,
      fixedBackgroundId,
    };
    rawSettings.visual.backgrounds[scene] = savedConfig;

    return {
      scene,
      config: savedConfig,
    };
  });
}

export async function setDefaultVisualBackground(id: string) {
  const parsed = await assertBackgroundExists(id);
  if (parsed.scope === "personal") {
    throw new Error("background not found");
  }
  const scene = parsed.scene;

  return updateSystemSettingsFile((rawSettings) => {
    const settings = normalizeVisualSettings(rawSettings);
    rawSettings.visual = rawSettings.visual ?? {};
    rawSettings.visual.backgrounds = rawSettings.visual.backgrounds ?? {};
    rawSettings.visual.backgrounds[scene] = {
      ...settings.visual.backgrounds[scene],
      mode: "fixed",
      fixedBackgroundId: `${parsed.storageScene}/${parsed.storageScope}/${parsed.fileName}`,
    };

    return {
      id: (rawSettings.visual.backgrounds[scene] as BackgroundSceneConfig).fixedBackgroundId,
      scene,
      config: rawSettings.visual.backgrounds[scene] as BackgroundSceneConfig,
      isDefault: true,
    };
  });
}

export function visualBackgroundError(error: unknown) {
  if (error instanceof z.ZodError) {
    return { status: 400, code: 40001, message: "invalid scene" };
  }

  const message = error instanceof Error ? error.message : String(error);
  if (message === "invalid file type") {
    return { status: 400, code: 40003, message };
  }
  if (message === "file too large") {
    return { status: 400, code: 40004, message };
  }
  if (message === "invalid background config") {
    return { status: 400, code: 40005, message };
  }
  if (/file too large|request body is too large|part exceeded/i.test(message)) {
    return { status: 400, code: 40004, message: "file too large" };
  }
  if (message === "background not found") {
    return { status: 404, code: 40401, message };
  }
  return { status: 500, code: 50001, message: "settings failed" };
}
