import { createReadStream } from "node:fs";
import { mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const backgroundScenes = ["login_background", "sidebar_background"] as const;
const backgroundScopes = ["default", "user"] as const;
const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"]);
const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);
const maxUploadSize = 10 * 1024 * 1024;

export const backgroundSceneSchema = z.enum(backgroundScenes);
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
export type BackgroundScope = (typeof backgroundScopes)[number];

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
    backgrounds: Record<BackgroundScene, BackgroundSceneConfig>;
  };
};

type LegacyBackgroundConfig = Partial<BackgroundSceneConfig> & {
  defaultBackgroundId?: unknown;
};

type RawSettingsFile = {
  visual?: {
    backgrounds?: Partial<Record<BackgroundScene, LegacyBackgroundConfig>>;
  };
};

type ParsedBackgroundId = {
  scene: BackgroundScene;
  scope: BackgroundScope;
  fileName: string;
  filePath: string;
};

const settingsRoot = path.join(process.cwd(), "public", "settings");
const backgroundsRoot = path.join(settingsRoot, "backgrounds");
const userSettingsDir = path.join(settingsRoot, "user");
const userSettingsPath = path.join(userSettingsDir, "settings.json");
const userSettingsExamplePath = path.join(userSettingsDir, "settings.json.example");

const emptySettings = (): SettingsFile => ({
  visual: {
    backgrounds: {
      login_background: defaultBackgroundConfig(),
      sidebar_background: defaultBackgroundConfig(),
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

function sceneDir(scene: BackgroundScene, scope: BackgroundScope) {
  return path.join(backgroundsRoot, scene, scope);
}

function sceneUrl(scene: BackgroundScene, scope: BackgroundScope, fileName: string) {
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

async function pathExists(filePath: string) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function uniqueFileName(directory: string, fileName: string) {
  const parsed = path.parse(fileName);
  let candidate = fileName;
  let index = 0;

  while (await pathExists(path.join(directory, candidate))) {
    index += 1;
    candidate = `${parsed.name}-${Date.now().toString(36)}-${index}${parsed.ext}`;
  }

  return candidate;
}

async function ensureBackgroundDirectories() {
  await Promise.all([
    mkdir(userSettingsDir, { recursive: true }),
    ...backgroundScenes.flatMap((scene) => backgroundScopes.map((scope) => mkdir(sceneDir(scene, scope), { recursive: true }))),
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
  for (const scene of backgroundScenes) {
    settings.visual.backgrounds[scene] = normalizeBackgroundConfig(input?.visual?.backgrounds?.[scene]);
  }
  return settings;
}

async function readUserSettings() {
  await ensureBackgroundDirectories();

  try {
    return normalizeSettings(await readSettingsJson(userSettingsPath));
  } catch {
    try {
      return normalizeSettings(await readSettingsJson(userSettingsExamplePath));
    } catch {
      return emptySettings();
    }
  }
}

async function writeUserSettings(settings: SettingsFile) {
  await mkdir(userSettingsDir, { recursive: true });
  const tempPath = `${userSettingsPath}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  await rename(tempPath, userSettingsPath);
}

async function scanBackgroundScope(scene: BackgroundScene, scope: BackgroundScope) {
  const directory = sceneDir(scene, scope);
  await mkdir(directory, { recursive: true });

  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const images = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && imageExtensions.has(path.extname(entry.name).toLowerCase()))
      .sort((first, second) => first.name.localeCompare(second.name))
      .map(async (entry) => {
        const filePath = path.join(directory, entry.name);
        const fileStat = await stat(filePath);
        const fileKey = `${scene}/${scope}/${entry.name}`;
        return {
          id: fileKey,
          scene,
          fileName: entry.name,
          url: sceneUrl(scene, scope, entry.name),
          fileKey,
          mimeType: mimeTypeFromFileName(entry.name),
          fileSize: fileStat.size,
          isDefault: false,
          createdAt: fileStat.birthtime.toISOString(),
        } satisfies VisualBackgroundImage;
      }),
  );

  return images;
}

export async function listVisualBackgrounds(scene: BackgroundScene) {
  const settings = await readUserSettings();
  const defaultImages = await scanBackgroundScope(scene, "default");
  const userImages = await scanBackgroundScope(scene, "user");
  const list = [...defaultImages, ...userImages];
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
  const decodedId = decodeURIComponent(id);
  const [sceneRaw, scopeRaw, ...fileNameParts] = decodedId.split("/");
  const scene = backgroundSceneSchema.parse(sceneRaw);
  const scope = z.enum(backgroundScopes).parse(scopeRaw);
  const fileName = fileNameParts.join("/");

  if (!fileName || fileName.includes("/") || fileName.includes("\\") || path.basename(fileName) !== fileName) {
    throw new Error("background not found");
  }

  return {
    scene,
    scope,
    fileName,
    filePath: path.join(sceneDir(scene, scope), fileName),
  };
}

export async function getVisualBackgroundFile(scene: BackgroundScene, scope: BackgroundScope, fileName: string) {
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
  if (!allowedMimeTypes.has(input.mimeType)) {
    throw new Error("invalid file type");
  }

  if (input.buffer.length > maxUploadSize) {
    throw new Error("file too large");
  }

  const directory = sceneDir(input.scene, "user");
  await mkdir(directory, { recursive: true });
  const fileName = await uniqueFileName(directory, sanitizeFileName(input.fileName, input.mimeType));
  const filePath = path.join(directory, fileName);

  await writeFile(filePath, input.buffer);

  const fileStat = await stat(filePath);
  const fileKey = `${input.scene}/user/${fileName}`;
  return {
    id: fileKey,
    scene: input.scene,
    fileName,
    url: sceneUrl(input.scene, "user", fileName),
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
    if (fixedBackground.scene !== scene) {
      throw new Error("background not found");
    }
    fixedBackgroundId = `${fixedBackground.scene}/${fixedBackground.scope}/${fixedBackground.fileName}`;
  }

  const settings = await readUserSettings();
  settings.visual.backgrounds[scene] = {
    ...config,
    fixedBackgroundId,
  };
  await writeUserSettings(settings);

  return {
    scene,
    config: settings.visual.backgrounds[scene],
  };
}

export async function setDefaultVisualBackground(id: string) {
  const parsed = await assertBackgroundExists(id);

  const settings = await readUserSettings();
  settings.visual.backgrounds[parsed.scene] = {
    ...settings.visual.backgrounds[parsed.scene],
    mode: "fixed",
    fixedBackgroundId: `${parsed.scene}/${parsed.scope}/${parsed.fileName}`,
  };
  await writeUserSettings(settings);

  return {
    id: settings.visual.backgrounds[parsed.scene].fixedBackgroundId,
    scene: parsed.scene,
    config: settings.visual.backgrounds[parsed.scene],
    isDefault: true,
  };
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
