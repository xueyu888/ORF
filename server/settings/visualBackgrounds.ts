import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  canonicalVisualBackgroundScene,
  canonicalVisualBackgroundScope,
  legacyVisualBackgroundScenes,
  legacyVisualBackgroundScopes,
  visualBackgroundScenes,
  visualBackgroundScopes,
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
export const backgroundModeSchema = z.enum(["fixed", "switchable"]);
export const backgroundSwitchTriggerSchema = z.enum(["on_open", "interval"]);
export const backgroundSwitchOrderSchema = z.enum(["sequential", "random"]);
export const backgroundSceneConfigSchema = z.object({
  mode: backgroundModeSchema,
  fixedBackgroundId: z.string().nullable(),
  switchTrigger: backgroundSwitchTriggerSchema,
  switchOrder: backgroundSwitchOrderSchema,
  switchIntervalMinutes: z.coerce.number().int().min(1).max(1440),
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

type SettingsFile = {
  visual: {
    backgrounds: Record<CanonicalBackgroundScene, BackgroundSceneConfig>;
  };
};

type LegacyBackgroundConfig = Partial<BackgroundSceneConfig> & {
  defaultBackgroundId?: unknown;
};

type RawSettingsFile = {
  visual?: {
    backgrounds?: Partial<Record<AnyVisualBackgroundScene, LegacyBackgroundConfig>>;
  };
};

type ParsedBackgroundId = {
  scene: CanonicalBackgroundScene;
  scope: CanonicalBackgroundScope;
  storageScene: AnyVisualBackgroundScene;
  storageScope: AnyVisualBackgroundScope;
  fileName: string;
  filePath: string;
};

const settingsRoot = path.join(process.cwd(), "public", "settings");
const backgroundsRoot = path.join(settingsRoot, "backgrounds");
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
  },
});

function defaultBackgroundConfig(): BackgroundSceneConfig {
  return {
    mode: "fixed",
    fixedBackgroundId: null,
    switchTrigger: "on_open",
    switchOrder: "random",
    switchIntervalMinutes: 10,
  };
}

function sceneDir(scene: AnyVisualBackgroundScene, scope: AnyVisualBackgroundScope) {
  return path.join(backgroundsRoot, scene, scope);
}

function sceneUrl(scene: AnyVisualBackgroundScene, scope: AnyVisualBackgroundScope, fileName: string) {
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
  const systemScopes: CanonicalBackgroundScope[] = ["default", "system"];
  await Promise.all([
    mkdir(systemSettingsDir, { recursive: true }),
    ...visualBackgroundScenes.flatMap((scene) => systemScopes.map((scope) => mkdir(sceneDir(scene, scope), { recursive: true }))),
  ]);
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

function normalizeSettings(input: RawSettingsFile | null | undefined): SettingsFile {
  const settings = emptySettings();
  for (const scene of visualBackgroundScenes) {
    const legacyScene = scene === "app_background" ? "sidebar_background" : scene;
    settings.visual.backgrounds[scene] = normalizeBackgroundConfig(input?.visual?.backgrounds?.[scene] ?? input?.visual?.backgrounds?.[legacyScene]);
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

async function scanBackgroundScope(scene: CanonicalBackgroundScene, scope: CanonicalBackgroundScope) {
  const images: VisualBackgroundImage[] = [];

  for (const storageScene of storageSceneNames(scene)) {
    for (const storageScope of storageScopeNames(scope)) {
      const directory = sceneDir(storageScene, storageScope);
      await mkdir(directory, { recursive: true });

      const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
      images.push(
        ...(await Promise.all(
          entries
            .filter((entry) => entry.isFile() && imageExtensions.has(path.extname(entry.name).toLowerCase()))
            .sort((first, second) => first.name.localeCompare(second.name))
            .map(async (entry) => {
              const filePath = path.join(directory, entry.name);
              const fileStat = await stat(filePath);
              const fileKey = `${storageScene}/${storageScope}/${entry.name}`;
              return {
                id: fileKey,
                scene,
                fileName: entry.name,
                url: sceneUrl(storageScene, storageScope, entry.name),
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
  }

  return images;
}

export async function listVisualBackgrounds(scene: BackgroundScene) {
  const settings = await readUserSettings();
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
    filePath: path.join(sceneDir(storageScene, storageScope), fileName),
  };
}

export async function getVisualBackgroundFile(scene: AnyVisualBackgroundScene, scope: AnyVisualBackgroundScope, fileName: string) {
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

    return {
      scene,
      config: settings.visual.backgrounds[scene],
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
