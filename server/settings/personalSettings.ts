import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readdir, readFile, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  chatThemeSchema,
  defaultChatTheme,
  normalizeUserDisplayPreferences,
  normalizeWorkspaceLayoutPreferences,
  type ChatTheme,
  type UserDisplayPreferences,
  type WorkspaceLayoutPreferences,
  userDisplayPreferencesPatchSchema,
  workspaceLayoutPreferencesPatchSchema,
} from "../../src/domain/settings/personalPreferences";
import {
  acceptsLegacyAppBackgroundScene,
  legacyVisualBackgroundStorageScenes,
  visualBackgroundScenes,
  type AnyVisualBackgroundStorageScene,
  type VisualBackgroundScene as CanonicalBackgroundScene,
} from "../../src/domain/settings/visualBackgrounds";
import {
  backgroundStorageScenePathSchema,
  backgroundSceneSchema,
  backgroundSceneConfigSchema,
  isSupportedVisualBackgroundImage,
  listVisualBackgrounds,
  parseBackgroundId,
  type BackgroundSceneConfig,
  type VisualBackgroundImage,
} from "./visualBackgrounds";

const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"]);
const allowedLandingPaths = new Set(["/bounties", "/tasks", "/chat", "/feedback", "/reports"]);
const settingsRoot = path.join(process.cwd(), "public", "settings");
const maxUploadSize = 10 * 1024 * 1024;
const maxPersonalBackgroundsPerUser = 20;
let personalSettingsMutationQueue: Promise<void> = Promise.resolve();

export type UserPreferences = {
  userId: string;
  defaultLandingPath: string | null;
  sidebarCollapsed: boolean | null;
  chatTheme: ChatTheme;
  display: UserDisplayPreferences;
  workspaceLayout: WorkspaceLayoutPreferences;
  appBackground: BackgroundSceneConfig | null;
  backgrounds: Partial<Record<CanonicalBackgroundScene, BackgroundSceneConfig | null>>;
  notificationDisplay: {
    toastEnabled: boolean;
  };
};

export type PersonalBackgroundsData = Awaited<ReturnType<typeof listVisualBackgrounds>> & {
  preferences: UserPreferences;
};

type StoredUserPreferences = Omit<UserPreferences, "appBackground">;

export const userPreferencesPatchSchema = z.object({
  defaultLandingPath: z.string().nullable().optional(),
  sidebarCollapsed: z.boolean().nullable().optional(),
  chatTheme: chatThemeSchema.optional(),
  display: userDisplayPreferencesPatchSchema.optional(),
  workspaceLayout: workspaceLayoutPreferencesPatchSchema.optional(),
  appBackground: backgroundSceneConfigSchema.nullable().optional(),
  backgrounds: z.record(z.string(), backgroundSceneConfigSchema.nullable()).optional(),
  notificationDisplay: z.object({ toastEnabled: z.boolean().optional() }).optional(),
});

function safeUserSegment(userId: string) {
  return Buffer.from(userId, "utf8").toString("base64url");
}

function userSettingsDir(userId: string) {
  return path.join(settingsRoot, "users", safeUserSegment(userId));
}

function userPreferencesPath(userId: string) {
  return path.join(userSettingsDir(userId), "preferences.json");
}

function personalBackgroundDir(userId: string, scene: AnyVisualBackgroundStorageScene) {
  return path.join(userSettingsDir(userId), "backgrounds", scene);
}

function personalBackgroundUrl(scene: AnyVisualBackgroundStorageScene, fileName: string) {
  return `/settings/backgrounds/${scene}/personal/${encodeURIComponent(fileName)}`;
}

function personalBackgroundId(scene: AnyVisualBackgroundStorageScene, fileName: string) {
  return `${scene}/personal/${fileName}`;
}

function defaultUserPreferences(userId: string): UserPreferences {
  return {
    userId,
    defaultLandingPath: null,
    sidebarCollapsed: null,
    chatTheme: defaultChatTheme,
    display: normalizeUserDisplayPreferences(null),
    workspaceLayout: normalizeWorkspaceLayoutPreferences(null),
    appBackground: null,
    backgrounds: {},
    notificationDisplay: {
      toastEnabled: true,
    },
  };
}

function normalizeChatTheme(input: unknown): ChatTheme {
  const parsed = chatThemeSchema.safeParse(input);
  return parsed.success ? parsed.data : defaultChatTheme;
}

function normalizeBackgroundPreference(input: unknown) {
  const parsed = backgroundSceneConfigSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}

function normalizeUserBackgroundPreferences(input: Partial<UserPreferences> | null | undefined) {
  const backgrounds: Partial<Record<CanonicalBackgroundScene, BackgroundSceneConfig | null>> = {};
  const rawBackgrounds = input?.backgrounds && typeof input.backgrounds === "object" ? input.backgrounds : {};

  for (const scene of visualBackgroundScenes) {
    if (Object.prototype.hasOwnProperty.call(rawBackgrounds, scene)) {
      backgrounds[scene] = rawBackgrounds[scene] ? normalizeBackgroundPreference(rawBackgrounds[scene]) : null;
    }
  }

  const legacyAppBackground = normalizeBackgroundPreference(input?.appBackground);
  if (legacyAppBackground) {
    if (backgrounds.sidebar_background === undefined) {
      backgrounds.sidebar_background = legacyAppBackground;
    }
    if (backgrounds.topbar_background === undefined) {
      backgrounds.topbar_background = legacyAppBackground;
    }
  }

  return backgrounds;
}

function normalizeUserPreferences(userId: string, input: Partial<UserPreferences> | null | undefined): UserPreferences {
  const fallback = defaultUserPreferences(userId);
  const defaultLandingPath =
    typeof input?.defaultLandingPath === "string" && allowedLandingPaths.has(input.defaultLandingPath)
      ? input.defaultLandingPath
      : input?.defaultLandingPath === null
        ? null
        : fallback.defaultLandingPath;
  const backgrounds = normalizeUserBackgroundPreferences(input);

  return {
    userId,
    defaultLandingPath,
    sidebarCollapsed: typeof input?.sidebarCollapsed === "boolean" ? input.sidebarCollapsed : input?.sidebarCollapsed === null ? null : fallback.sidebarCollapsed,
    chatTheme: normalizeChatTheme(input?.chatTheme),
    display: normalizeUserDisplayPreferences(input?.display),
    workspaceLayout: normalizeWorkspaceLayoutPreferences(input?.workspaceLayout),
    appBackground: backgrounds.sidebar_background ?? null,
    backgrounds,
    notificationDisplay: {
      toastEnabled: input?.notificationDisplay?.toastEnabled ?? fallback.notificationDisplay.toastEnabled,
    },
  };
}

async function readPreferencesJson(userId: string) {
  const raw = await readFile(userPreferencesPath(userId), "utf8");
  return JSON.parse(raw) as Partial<UserPreferences>;
}

export async function readUserPreferences(userId: string) {
  try {
    return normalizeUserPreferences(userId, await readPreferencesJson(userId));
  } catch {
    return defaultUserPreferences(userId);
  }
}

export async function deleteUserPersonalSettings(userId: string) {
  await rm(userSettingsDir(userId), { recursive: true, force: true });
}

async function writeUserPreferences(preferences: UserPreferences) {
  const directory = userSettingsDir(preferences.userId);
  await mkdir(directory, { recursive: true });
  const targetPath = userPreferencesPath(preferences.userId);
  const tempPath = `${targetPath}.${process.pid}.${Date.now().toString(36)}.${randomUUID()}.tmp`;

  try {
    await writeFile(tempPath, `${JSON.stringify(storedUserPreferences(preferences), null, 2)}\n`, "utf8");
    await rename(tempPath, targetPath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

function storedUserPreferences(preferences: UserPreferences): StoredUserPreferences {
  const { appBackground: _legacyProjection, ...stored } = preferences;
  return stored;
}

async function updateUserPreferences<T>(userId: string, mutator: (preferences: UserPreferences) => T | Promise<T>) {
  const mutation = personalSettingsMutationQueue.then(async () => {
    const preferences = await readUserPreferences(userId);
    const result = await mutator(preferences);
    await writeUserPreferences(preferences);
    return result;
  });
  personalSettingsMutationQueue = mutation.then(() => undefined, () => undefined);
  return mutation;
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
  for (let attempt = 0; attempt < 20; attempt += 1) {
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

function parsePersonalBackgroundId(id: string) {
  let decodedId: string;
  try {
    decodedId = decodeURIComponent(id);
  } catch {
    throw new Error("background not found");
  }

  const [sceneRaw, scopeRaw, ...fileNameParts] = decodedId.split("/");
  const parsedScene = backgroundSceneSchema.safeParse(sceneRaw);
  const scene = parsedScene.success ? parsedScene.data : null;
  const storageScene = backgroundStorageScenePathSchema.parse(sceneRaw);
  const fileName = fileNameParts.join("/");

  if (scopeRaw !== "personal" || !fileName || fileName.includes("/") || fileName.includes("\\") || path.basename(fileName) !== fileName) {
    throw new Error("background not found");
  }

  return { scene, storageScene, fileName };
}

function personalStorageScenes(scene: CanonicalBackgroundScene): AnyVisualBackgroundStorageScene[] {
  const sharedScenes = visualBackgroundScenes.filter((candidate) => candidate !== scene);
  const legacyScenes = acceptsLegacyAppBackgroundScene(scene) ? ["app_background" as const] : [];
  return [scene, ...sharedScenes, ...legacyVisualBackgroundStorageScenes, ...legacyScenes];
}

function isBackgroundUsableForScene(input: { scene: CanonicalBackgroundScene | null; storageScene: AnyVisualBackgroundStorageScene }, scene: CanonicalBackgroundScene) {
  if ((visualBackgroundScenes as readonly string[]).includes(input.storageScene)) {
    return true;
  }
  if ((legacyVisualBackgroundStorageScenes as readonly string[]).includes(input.storageScene)) {
    return true;
  }
  return input.storageScene === "app_background" && acceptsLegacyAppBackgroundScene(scene);
}

async function scanPersonalBackgrounds(userId: string, scene: CanonicalBackgroundScene) {
  const images: VisualBackgroundImage[] = [];

  for (const storageScene of personalStorageScenes(scene)) {
    const directory = personalBackgroundDir(userId, storageScene);
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
            const id = personalBackgroundId(storageScene, entry.name);
            return {
              id,
              scene,
              fileName: entry.name,
              url: personalBackgroundUrl(storageScene, entry.name),
              fileKey: id,
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

async function assertAccessibleBackground(userId: string, scene: CanonicalBackgroundScene, id: string) {
  const decodedId = decodeURIComponent(id);
  if (decodedId.includes("/personal/")) {
    const parsed = parsePersonalBackgroundId(decodedId);
    if (!isBackgroundUsableForScene(parsed, scene)) {
      throw new Error("background not found");
    }
    const filePath = path.join(personalBackgroundDir(userId, parsed.storageScene), parsed.fileName);
    const fileStat = await stat(filePath).catch(() => null);
    if (!fileStat?.isFile()) {
      throw new Error("background not found");
    }
    return personalBackgroundId(parsed.storageScene, parsed.fileName);
  }

  const parsed = parseBackgroundId(decodedId);
  const fileStat = await stat(parsed.filePath).catch(() => null);
  if (!fileStat?.isFile() || !isBackgroundUsableForScene(parsed, scene) || parsed.scope === "personal") {
    throw new Error("background not found");
  }
  return `${parsed.storageScene}/${parsed.storageScope}/${parsed.fileName}`;
}

async function normalizePersonalBackgroundConfig(userId: string, scene: CanonicalBackgroundScene, config: BackgroundSceneConfig | null) {
  if (!config) {
    return null;
  }

  if (config.mode === "fixed" && !config.fixedBackgroundId) {
    throw new Error("invalid preference");
  }

  return {
    ...config,
    fixedBackgroundId: config.fixedBackgroundId ? await assertAccessibleBackground(userId, scene, config.fixedBackgroundId) : null,
  } satisfies BackgroundSceneConfig;
}

export async function saveUserPreferences(userId: string, patch: z.infer<typeof userPreferencesPatchSchema>) {
  const input = userPreferencesPatchSchema.parse(patch);
  if (input.defaultLandingPath !== undefined && input.defaultLandingPath !== null && !allowedLandingPaths.has(input.defaultLandingPath)) {
    throw new Error("invalid preference");
  }

  return updateUserPreferences(userId, async (preferences) => {
    if (input.defaultLandingPath !== undefined) {
      preferences.defaultLandingPath = input.defaultLandingPath;
    }
    if (input.sidebarCollapsed !== undefined) {
      preferences.sidebarCollapsed = input.sidebarCollapsed;
    }
    if (input.chatTheme !== undefined) {
      preferences.chatTheme = input.chatTheme;
    }
    if (input.display !== undefined) {
      preferences.display = normalizeUserDisplayPreferences(input.display);
    }
    if (input.workspaceLayout !== undefined) {
      preferences.workspaceLayout = normalizeWorkspaceLayoutPreferences(input.workspaceLayout);
    }
    if (input.notificationDisplay) {
      preferences.notificationDisplay = {
        ...preferences.notificationDisplay,
        ...input.notificationDisplay,
      };
    }
    if (input.appBackground !== undefined) {
      throw new Error("invalid preference");
    }
    if (input.backgrounds) {
      for (const [sceneRaw, config] of Object.entries(input.backgrounds)) {
        const scene = backgroundSceneSchema.parse(sceneRaw);
        preferences.backgrounds[scene] = await normalizePersonalBackgroundConfig(userId, scene, config);
      }
    }
    preferences.appBackground = preferences.backgrounds.sidebar_background ?? null;
    return preferences;
  });
}

export async function listPersonalBackgrounds(userId: string, sceneInput: CanonicalBackgroundScene = "sidebar_background"): Promise<PersonalBackgroundsData> {
  const scene = backgroundSceneSchema.parse(sceneInput);
  const [systemBackgrounds, preferences, personalImages] = await Promise.all([
    listVisualBackgrounds(scene),
    readUserPreferences(userId),
    scanPersonalBackgrounds(userId, scene),
  ]);
  const list = [...systemBackgrounds.list, ...personalImages];
  const personalConfig = preferences.backgrounds[scene] ?? null;
  const personalFixedExists = personalConfig?.fixedBackgroundId ? list.some((image) => image.id === personalConfig.fixedBackgroundId) : false;
  const config = personalConfig && (personalConfig.mode !== "fixed" || personalFixedExists)
    ? { ...personalConfig, fixedBackgroundId: personalFixedExists ? personalConfig.fixedBackgroundId : null }
    : systemBackgrounds.config;
  const fixedBackgroundId = config.fixedBackgroundId && list.some((image) => image.id === config.fixedBackgroundId)
    ? config.fixedBackgroundId
    : systemBackgrounds.config.fixedBackgroundId;

  return {
    scene,
    config: {
      ...config,
      fixedBackgroundId,
    },
    list: list.map((image) => ({ ...image, isDefault: image.id === fixedBackgroundId })),
    preferences,
  };
}

export async function saveUploadedPersonalBackground(input: { userId: string; scene: CanonicalBackgroundScene; fileName: string; mimeType: string; buffer: Buffer }) {
  const scene = backgroundSceneSchema.parse(input.scene);
  if (!isSupportedVisualBackgroundImage(input.mimeType, input.buffer)) {
    throw new Error("invalid file type");
  }
  if (input.buffer.length > maxUploadSize) {
    throw new Error("file too large");
  }

  const existing = await scanPersonalBackgrounds(input.userId, scene);
  if (existing.length >= maxPersonalBackgroundsPerUser) {
    throw new Error("personal background quota exceeded");
  }

  const directory = personalBackgroundDir(input.userId, scene);
  await mkdir(directory, { recursive: true });
  const { fileName, filePath } = await writeUniqueUploadFile(directory, sanitizeFileName(input.fileName, input.mimeType), input.buffer);
  const fileStat = await stat(filePath);
  const id = personalBackgroundId(scene, fileName);

  return {
    id,
    scene,
    fileName,
    url: personalBackgroundUrl(scene, fileName),
    fileKey: id,
    mimeType: input.mimeType,
    fileSize: fileStat.size,
    isDefault: false,
    createdAt: fileStat.birthtime.toISOString(),
  } satisfies VisualBackgroundImage;
}

export async function deletePersonalBackground(userId: string, id: string) {
  const parsed = parsePersonalBackgroundId(id);
  const filePath = path.join(personalBackgroundDir(userId, parsed.storageScene), parsed.fileName);
  const fileStat = await stat(filePath).catch(() => null);
  if (!fileStat?.isFile()) {
    throw new Error("background not found");
  }
  await unlink(filePath);

  const deletedId = personalBackgroundId(parsed.storageScene, parsed.fileName);
  await updateUserPreferences(userId, (preferences) => {
    for (const scene of visualBackgroundScenes) {
      const config = preferences.backgrounds[scene];
      if (!config) continue;
      delete config.crops[deletedId];
      if (config.fixedBackgroundId === deletedId) {
        preferences.backgrounds[scene] = null;
      }
    }
    preferences.appBackground = preferences.backgrounds.sidebar_background ?? null;
  });

  return { id: deletedId };
}

export async function getPersonalBackgroundFile(userId: string, sceneRaw: string, scopeRaw: string, fileName: string) {
  const parsed = parsePersonalBackgroundId(`${sceneRaw}/${scopeRaw}/${fileName}`);
  const filePath = path.join(personalBackgroundDir(userId, parsed.storageScene), parsed.fileName);
  const fileStat = await stat(filePath);
  if (!fileStat.isFile()) {
    throw new Error("background not found");
  }

  return {
    stream: createReadStream(filePath),
    mimeType: mimeTypeFromFileName(parsed.fileName),
  };
}

export function personalSettingsError(error: unknown) {
  if (error instanceof z.ZodError) {
    return { status: 400, code: 40005, message: "invalid preference" };
  }

  const message = error instanceof Error ? error.message : String(error);
  if (message === "invalid preference") {
    return { status: 400, code: 40005, message };
  }
  if (message === "invalid file type") {
    return { status: 400, code: 40003, message };
  }
  if (message === "file too large") {
    return { status: 400, code: 40004, message };
  }
  if (message === "personal background quota exceeded") {
    return { status: 403, code: 40302, message };
  }
  if (message === "background not found") {
    return { status: 404, code: 40401, message };
  }
  return { status: 500, code: 50001, message: "settings failed" };
}
