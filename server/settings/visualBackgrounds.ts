import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { objectStorage } from "../storage/objectStorage";
import {
  appShellBackgroundSlots,
  canonicalVisualBackgroundScene,
  canonicalVisualBackgroundScope,
  legacyVisualBackgroundScenes,
  legacyVisualBackgroundScopes,
  visualBackgroundScenes,
  visualBackgroundScopes,
  type AppShellBackgroundSlot,
  type AnyVisualBackgroundScene,
  type AnyVisualBackgroundScope,
  type VisualBackgroundScene as CanonicalBackgroundScene,
  type VisualBackgroundScope as CanonicalBackgroundScope,
} from "../../src/domain/settings/visualBackgrounds";

const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"]);
const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);
const maxUploadSize = 10 * 1024 * 1024;

const anyBackgroundScenes = [...visualBackgroundScenes, ...legacyVisualBackgroundScenes] as [AnyVisualBackgroundScene, ...AnyVisualBackgroundScene[]];
const anyBackgroundScopes = [...visualBackgroundScopes, ...legacyVisualBackgroundScopes] as [AnyVisualBackgroundScope, ...AnyVisualBackgroundScope[]];

export const backgroundSceneSchema = z.enum(anyBackgroundScenes).transform(canonicalVisualBackgroundScene);
export const backgroundScenePathSchema = z.enum(anyBackgroundScenes);
const backgroundScopeSchema = z.enum(anyBackgroundScopes).transform(canonicalVisualBackgroundScope);
export const backgroundScopePathSchema = z.enum(anyBackgroundScopes);
export const appShellBackgroundSlotSchema = z.enum(appShellBackgroundSlots);
export const backgroundModeSchema = z.enum(["fixed", "switchable"]);
export const backgroundSwitchTriggerSchema = z.enum(["on_open", "interval"]);
export const backgroundSwitchOrderSchema = z.enum(["sequential", "random"]);
export const backgroundPlacementSchema = z.object({
  positionX: z.coerce.number().min(0).max(100),
  positionY: z.coerce.number().min(0).max(100),
  scale: z.coerce.number().min(1).max(3),
});
export const backgroundSceneConfigSchema = z.object({
  mode: backgroundModeSchema,
  fixedBackgroundId: z.string().nullable(),
  switchTrigger: backgroundSwitchTriggerSchema,
  switchOrder: backgroundSwitchOrderSchema,
  switchIntervalMinutes: z.coerce.number().int().min(1).max(1440),
  placement: backgroundPlacementSchema.optional(),
}).transform((config) => ({
  ...config,
  placement: config.placement ?? defaultBackgroundPlacement(),
}));
export type BackgroundScene = z.infer<typeof backgroundSceneSchema>;
export type BackgroundSceneConfig = z.infer<typeof backgroundSceneConfigSchema>;
export type BackgroundPlacement = z.infer<typeof backgroundPlacementSchema>;
export type AppShellBackgroundSlotData = {
  slot: AppShellBackgroundSlot;
  scene: "app_background";
  config: BackgroundSceneConfig;
  list: VisualBackgroundImage[];
};
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
  ownerId?: string;
  ownerName?: string;
  shared?: boolean;
  ownedByCurrentUser?: boolean;
};

type SettingsFile = {
  visual: {
    backgrounds: Record<CanonicalBackgroundScene, BackgroundSceneConfig>;
    appShellBackgrounds: Record<AppShellBackgroundSlot, BackgroundSceneConfig>;
    backgroundResources: Record<CanonicalBackgroundScene, StoredVisualBackgroundResource[]>;
  };
};

type StoredVisualBackgroundResource = {
  createdAt: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  objectKey: string;
  scope: Exclude<CanonicalBackgroundScope, "personal">;
};

type LegacyBackgroundConfig = Partial<BackgroundSceneConfig> & {
  defaultBackgroundId?: unknown;
};

type RawSettingsFile = {
  visual?: {
    backgrounds?: Partial<Record<AnyVisualBackgroundScene, LegacyBackgroundConfig>>;
    appShellBackgrounds?: Partial<Record<AppShellBackgroundSlot, LegacyBackgroundConfig>>;
    backgroundResources?: Partial<Record<AnyVisualBackgroundScene, StoredVisualBackgroundResource[]>>;
  };
};

type ParsedBackgroundId = {
  scene: CanonicalBackgroundScene;
  scope: CanonicalBackgroundScope;
  storageScene: AnyVisualBackgroundScene;
  storageScope: AnyVisualBackgroundScope;
  fileName: string;
};

const settingsRoot = path.join(process.cwd(), "public", "settings");
const systemSettingsDir = path.join(settingsRoot, "system");
const systemSettingsPath = path.join(systemSettingsDir, "settings.json");
const systemSettingsExamplePath = path.join(systemSettingsDir, "settings.json.example");
const legacySystemSettingsDir = path.join(settingsRoot, "user");
const legacySystemSettingsPath = path.join(legacySystemSettingsDir, "settings.json");
const legacySystemSettingsExamplePath = path.join(legacySystemSettingsDir, "settings.json.example");
let settingsMutationQueue: Promise<void> = Promise.resolve();

const emptySettings = (): SettingsFile => ({
  visual: {
    backgrounds: {
      login_background: defaultBackgroundConfig(),
      app_background: defaultBackgroundConfig(),
    },
    appShellBackgrounds: emptyAppShellBackgrounds(),
    backgroundResources: {
      login_background: [],
      app_background: [],
    },
  },
});

export function defaultBackgroundPlacement(): BackgroundPlacement {
  return {
    positionX: 50,
    positionY: 50,
    scale: 1,
  };
}

function defaultBackgroundConfig(): BackgroundSceneConfig {
  return {
    mode: "fixed",
    fixedBackgroundId: null,
    switchTrigger: "on_open",
    switchOrder: "random",
    switchIntervalMinutes: 10,
    placement: defaultBackgroundPlacement(),
  };
}

function emptyAppShellBackgrounds() {
  return Object.fromEntries(appShellBackgroundSlots.map((slot) => [slot, defaultBackgroundConfig()])) as Record<AppShellBackgroundSlot, BackgroundSceneConfig>;
}

function sceneUrl(scene: AnyVisualBackgroundScene, scope: AnyVisualBackgroundScope, fileName: string) {
  return `/settings/backgrounds/${scene}/${scope}/${encodeURIComponent(fileName)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function safeObjectSegment(value: string) {
  return value.trim().replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "") || "background";
}

function systemBackgroundObjectKey(input: { scene: BackgroundScene; fileName: string; timestamp: string }) {
  const parsed = path.parse(input.fileName);
  const stamp = input.timestamp.replace(/[^0-9A-Za-z]+/g, "");
  return `settings/backgrounds/${input.scene}/system/${stamp}-${randomUUID().slice(0, 8)}-${safeObjectSegment(parsed.name)}${parsed.ext}`;
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

async function ensureBackgroundDirectories() {
  await mkdir(systemSettingsDir, { recursive: true });
}

async function readSettingsJson(filePath: string) {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as RawSettingsFile;
}

function normalizeBackgroundConfig(input: LegacyBackgroundConfig | null | undefined): BackgroundSceneConfig {
  const fallback = defaultBackgroundConfig();
  const legacyFixedBackgroundId = typeof input?.defaultBackgroundId === "string" ? input.defaultBackgroundId : null;
  const fixedBackgroundId = typeof input?.fixedBackgroundId === "string" ? input.fixedBackgroundId : legacyFixedBackgroundId;

  return backgroundSceneConfigSchema.parse({
    mode: input?.mode ?? fallback.mode,
    fixedBackgroundId,
    switchTrigger: input?.switchTrigger ?? fallback.switchTrigger,
    switchOrder: input?.switchOrder ?? fallback.switchOrder,
    switchIntervalMinutes: input?.switchIntervalMinutes ?? fallback.switchIntervalMinutes,
  });
}

function normalizeBackgroundResources(input: StoredVisualBackgroundResource[] | null | undefined) {
  return Array.isArray(input)
    ? input
      .filter((resource) =>
        resource &&
        (resource.scope === "default" || resource.scope === "system") &&
        typeof resource.fileName === "string" &&
        typeof resource.objectKey === "string" &&
        typeof resource.mimeType === "string" &&
        typeof resource.fileSize === "number")
      .map((resource) => ({
        createdAt: typeof resource.createdAt === "string" ? resource.createdAt : nowIso(),
        fileName: path.basename(resource.fileName),
        fileSize: resource.fileSize,
        mimeType: resource.mimeType,
        objectKey: resource.objectKey,
        scope: resource.scope,
      }))
    : [];
}

function normalizeSettings(input: RawSettingsFile | null | undefined): SettingsFile {
  const settings = emptySettings();
  for (const scene of visualBackgroundScenes) {
    const legacyScene = scene === "app_background" ? "sidebar_background" : scene;
    settings.visual.backgrounds[scene] = normalizeBackgroundConfig(input?.visual?.backgrounds?.[scene] ?? input?.visual?.backgrounds?.[legacyScene]);
  }
  const legacyAppBackground = settings.visual.backgrounds.app_background;
  for (const slot of appShellBackgroundSlots) {
    settings.visual.appShellBackgrounds[slot] = normalizeBackgroundConfig(input?.visual?.appShellBackgrounds?.[slot] ?? legacyAppBackground);
  }
  for (const scene of visualBackgroundScenes) {
    const legacyScene = scene === "app_background" ? "sidebar_background" : scene;
    settings.visual.backgroundResources[scene] = normalizeBackgroundResources(
      input?.visual?.backgroundResources?.[scene] ?? input?.visual?.backgroundResources?.[legacyScene],
    );
  }
  return settings;
}

async function readUserSettings() {
  await ensureBackgroundDirectories();

  try {
    return normalizeSettings(await readSettingsJson(systemSettingsPath));
  } catch {
    try {
      return normalizeSettings(await readSettingsJson(systemSettingsExamplePath));
    } catch {
      try {
        return normalizeSettings(await readSettingsJson(legacySystemSettingsPath));
      } catch {
        try {
          return normalizeSettings(await readSettingsJson(legacySystemSettingsExamplePath));
        } catch {
          return emptySettings();
        }
      }
    }
  }
}

async function writeUserSettings(settings: SettingsFile) {
  await mkdir(systemSettingsDir, { recursive: true });
  const tempPath = `${systemSettingsPath}.${process.pid}.${Date.now().toString(36)}.${randomUUID()}.tmp`;

  try {
    await writeFile(tempPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
    await rename(tempPath, systemSettingsPath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function updateUserSettings<T>(mutator: (settings: SettingsFile) => T | Promise<T>) {
  const mutation = settingsMutationQueue.then(async () => {
    const settings = await readUserSettings();
    const result = await mutator(settings);
    await writeUserSettings(settings);
    return result;
  });
  settingsMutationQueue = mutation.then(() => undefined, () => undefined);
  return mutation;
}

function storageSceneNames(scene: CanonicalBackgroundScene): AnyVisualBackgroundScene[] {
  return scene === "app_background" ? ["app_background", "sidebar_background"] : [scene];
}

function storageScopeNames(scope: CanonicalBackgroundScope): AnyVisualBackgroundScope[] {
  return scope === "system" ? ["system", "user"] : [scope];
}

function scanBackgroundScope(settings: SettingsFile, scene: CanonicalBackgroundScene, scope: Exclude<CanonicalBackgroundScope, "personal">) {
  const images: VisualBackgroundImage[] = [];

  for (const storageScene of storageSceneNames(scene)) {
    const canonicalScene = canonicalVisualBackgroundScene(storageScene);
    const resources = settings.visual.backgroundResources[canonicalScene] ?? [];
    for (const storageScope of storageScopeNames(scope)) {
      for (const resource of resources.filter((entry) => entry.scope === canonicalVisualBackgroundScope(storageScope))) {
        const fileKey = `${storageScene}/${storageScope}/${resource.fileName}`;
        images.push({
          id: fileKey,
          scene,
          fileName: resource.fileName,
          url: sceneUrl(storageScene, storageScope, resource.fileName),
          fileKey,
          mimeType: resource.mimeType,
          fileSize: resource.fileSize,
          isDefault: false,
          createdAt: resource.createdAt,
        });
      }
    }
  }

  return images;
}

export async function listVisualBackgrounds(scene: BackgroundScene) {
  const settings = await readUserSettings();
  const defaultImages = scanBackgroundScope(settings, scene, "default");
  const systemImages = scanBackgroundScope(settings, scene, "system");
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

export async function listAppShellBackgrounds(slot: AppShellBackgroundSlot): Promise<AppShellBackgroundSlotData> {
  const settings = await readUserSettings();
  const defaultImages = scanBackgroundScope(settings, "app_background", "default");
  const systemImages = scanBackgroundScope(settings, "app_background", "system");
  const list = [...defaultImages, ...systemImages];
  const config = settings.visual.appShellBackgrounds[slot];
  const configuredFixedExists = config.fixedBackgroundId ? list.some((image) => image.id === config.fixedBackgroundId) : false;
  const legacyFixedExists = settings.visual.backgrounds.app_background.fixedBackgroundId
    ? list.some((image) => image.id === settings.visual.backgrounds.app_background.fixedBackgroundId)
    : false;
  const fixedBackgroundId = configuredFixedExists
    ? config.fixedBackgroundId
    : legacyFixedExists
      ? settings.visual.backgrounds.app_background.fixedBackgroundId
      : defaultImages[0]?.id ?? list[0]?.id ?? null;
  const normalizedConfig = {
    ...config,
    fixedBackgroundId,
  } satisfies BackgroundSceneConfig;

  return {
    slot,
    scene: "app_background",
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
  const storageScene = z.enum(anyBackgroundScenes).parse(sceneRaw);
  const storageScope = z.enum(anyBackgroundScopes).parse(scopeRaw);
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
  };
}

export async function getVisualBackgroundFile(scene: AnyVisualBackgroundScene, scope: AnyVisualBackgroundScope, fileName: string) {
  const parsed = parseBackgroundId(`${scene}/${scope}/${fileName}`);
  if (parsed.scope === "personal") {
    throw new Error("background not found");
  }
  const settings = await readUserSettings();
  const resource = settings.visual.backgroundResources[parsed.scene].find(
    (entry) => entry.scope === parsed.scope && entry.fileName === parsed.fileName,
  );
  if (!resource) {
    throw new Error("background not found");
  }
  const stored = await objectStorage.getObject(resource.objectKey);
  if (!stored) {
    throw new Error("background not found");
  }

  return {
    stream: stored.body,
    mimeType: resource.mimeType,
  };
}

export async function saveUploadedVisualBackground(input: { scene: BackgroundScene; fileName: string; mimeType: string; buffer: Buffer }) {
  if (!isSupportedVisualBackgroundImage(input.mimeType, input.buffer)) {
    throw new Error("invalid file type");
  }

  if (input.buffer.length > maxUploadSize) {
    throw new Error("file too large");
  }

  const timestamp = nowIso();
  const baseFileName = sanitizeFileName(input.fileName, input.mimeType);
  const fileName = `${path.parse(baseFileName).name}-${randomUUID().slice(0, 8)}${path.parse(baseFileName).ext}`;
  const objectKey = systemBackgroundObjectKey({ scene: input.scene, fileName, timestamp });
  const fileKey = `${input.scene}/system/${fileName}`;
  const resource: StoredVisualBackgroundResource = {
    createdAt: timestamp,
    fileName,
    fileSize: input.buffer.byteLength,
    mimeType: input.mimeType,
    objectKey,
    scope: "system",
  };

  await objectStorage.putObject({
    body: input.buffer,
    contentLength: input.buffer.byteLength,
    contentType: input.mimeType,
    key: objectKey,
  });

  try {
    await updateUserSettings((settings) => {
      settings.visual.backgroundResources[input.scene] = [...settings.visual.backgroundResources[input.scene], resource];
    });
  } catch (error) {
    await objectStorage.deleteObject(objectKey).catch(() => undefined);
    throw error;
  }

  return {
    id: fileKey,
    scene: input.scene,
    fileName,
    url: sceneUrl(input.scene, "system", fileName),
    fileKey,
    mimeType: resource.mimeType,
    fileSize: resource.fileSize,
    isDefault: false,
    createdAt: resource.createdAt,
  } satisfies VisualBackgroundImage;
}

async function assertBackgroundExists(id: string) {
  const parsed = parseBackgroundId(id);
  if (parsed.scope === "personal") {
    throw new Error("background not found");
  }
  const settings = await readUserSettings();
  const exists = settings.visual.backgroundResources[parsed.scene].some(
    (resource) => resource.scope === parsed.scope && resource.fileName === parsed.fileName,
  );
  if (!exists) {
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
    if (fixedBackground.scene !== scene) {
      throw new Error("background not found");
    }
    fixedBackgroundId = `${fixedBackground.storageScene}/${fixedBackground.storageScope}/${fixedBackground.fileName}`;
  }

  return updateUserSettings((settings) => {
    settings.visual.backgrounds[scene] = {
      ...config,
      fixedBackgroundId,
    };
    if (scene === "app_background") {
      for (const slot of appShellBackgroundSlots) {
        settings.visual.appShellBackgrounds[slot] = {
          ...config,
          fixedBackgroundId,
        };
      }
    }

    return {
      scene,
      config: settings.visual.backgrounds[scene],
    };
  });
}

export async function saveAppShellBackgroundConfig(slot: AppShellBackgroundSlot, input: BackgroundSceneConfig) {
  const config = backgroundSceneConfigSchema.parse(input);
  if (config.mode === "fixed" && !config.fixedBackgroundId) {
    throw new Error("invalid background config");
  }

  let fixedBackgroundId: string | null = null;
  if (config.fixedBackgroundId) {
    const fixedBackground = await assertBackgroundExists(config.fixedBackgroundId);
    if (fixedBackground.scope === "personal" || fixedBackground.scene !== "app_background") {
      throw new Error("background not found");
    }
    fixedBackgroundId = `${fixedBackground.storageScene}/${fixedBackground.storageScope}/${fixedBackground.fileName}`;
  }

  return updateUserSettings((settings) => {
    settings.visual.appShellBackgrounds[slot] = {
      ...config,
      fixedBackgroundId,
    };

    return {
      slot,
      scene: "app_background" as const,
      config: settings.visual.appShellBackgrounds[slot],
    };
  });
}

export async function setDefaultVisualBackground(id: string) {
  const parsed = await assertBackgroundExists(id);
  if (parsed.scope === "personal") {
    throw new Error("background not found");
  }

  return updateUserSettings((settings) => {
    settings.visual.backgrounds[parsed.scene] = {
      ...settings.visual.backgrounds[parsed.scene],
      mode: "fixed",
      fixedBackgroundId: `${parsed.storageScene}/${parsed.storageScope}/${parsed.fileName}`,
    };
    if (parsed.scene === "app_background") {
      for (const slot of appShellBackgroundSlots) {
        settings.visual.appShellBackgrounds[slot] = {
          ...settings.visual.appShellBackgrounds[slot],
          mode: "fixed",
          fixedBackgroundId: `${parsed.storageScene}/${parsed.storageScope}/${parsed.fileName}`,
        };
      }
    }

    return {
      id: settings.visual.backgrounds[parsed.scene].fixedBackgroundId,
      scene: parsed.scene,
      config: settings.visual.backgrounds[parsed.scene],
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
