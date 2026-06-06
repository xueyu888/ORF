import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { inArray } from "drizzle-orm";
import { z } from "zod";
import { appShellBackgroundSlots, canonicalVisualBackgroundScene, type AppShellBackgroundSlot } from "../../src/domain/settings/visualBackgrounds";
import { db } from "../db/client";
import { users } from "../db/schema";
import { objectStorage } from "../storage/objectStorage";
import {
  backgroundSceneConfigSchema,
  isSupportedVisualBackgroundImage,
  listAppShellBackgrounds,
  listVisualBackgrounds,
  parseBackgroundId,
  type BackgroundSceneConfig,
  type VisualBackgroundImage,
} from "./visualBackgrounds";

const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"]);
const allowedLandingPaths = new Set(["/bounties", "/tasks", "/feedback", "/reports", "/notifications"]);
const settingsRoot = path.join(process.cwd(), "public", "settings");
const maxUploadSize = 10 * 1024 * 1024;
const maxPersonalBackgroundsPerUser = 20;
let personalSettingsMutationQueue: Promise<void> = Promise.resolve();

type PersonalBackgroundResource = {
  createdAt: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  objectKey: string;
};

export type UserPreferences = {
  userId: string;
  defaultLandingPath: string | null;
  sidebarCollapsed: boolean | null;
  appBackground: BackgroundSceneConfig | null;
  appShellBackgrounds: Record<AppShellBackgroundSlot, BackgroundSceneConfig | null>;
  personalBackgroundsShared: boolean;
  personalBackgroundAccessGrants: string[];
  personalBackgroundResources: PersonalBackgroundResource[];
  notificationDisplay: {
    toastEnabled: boolean;
  };
};

type AppShellPersonalBackgroundSlotData = {
  slot: AppShellBackgroundSlot;
  scene: "app_background";
  config: BackgroundSceneConfig;
  list: VisualBackgroundImage[];
};

export type PersonalBackgroundsData = {
  scene: "app_background";
  slots: Record<AppShellBackgroundSlot, AppShellPersonalBackgroundSlotData>;
  list: VisualBackgroundImage[];
  preferences: UserPreferences;
};

const appShellBackgroundPatchSchema = z.object({
  topbar: backgroundSceneConfigSchema.nullable().optional(),
  sidebar: backgroundSceneConfigSchema.nullable().optional(),
  main_content: backgroundSceneConfigSchema.nullable().optional(),
});

export const userPreferencesPatchSchema = z.object({
  defaultLandingPath: z.string().nullable().optional(),
  sidebarCollapsed: z.boolean().nullable().optional(),
  appBackground: backgroundSceneConfigSchema.nullable().optional(),
  appShellBackgrounds: appShellBackgroundPatchSchema.optional(),
  personalBackgroundsShared: z.boolean().optional(),
  notificationDisplay: z.object({ toastEnabled: z.boolean().optional() }).optional(),
});

function safeUserSegment(userId: string) {
  return Buffer.from(userId, "utf8").toString("base64url");
}

function userIdFromSafeSegment(segment: string) {
  let decoded: string;
  try {
    decoded = Buffer.from(segment, "base64url").toString("utf8");
  } catch {
    throw new Error("background not found");
  }
  if (!decoded || safeUserSegment(decoded) !== segment) {
    throw new Error("background not found");
  }
  return decoded;
}

function userSettingsDir(userId: string) {
  return path.join(settingsRoot, "users", safeUserSegment(userId));
}

function userPreferencesPath(userId: string) {
  return path.join(userSettingsDir(userId), "preferences.json");
}

function nowIso() {
  return new Date().toISOString();
}

function safeObjectSegment(value: string) {
  return value.trim().replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "") || "background";
}

function personalBackgroundObjectKey(input: { fileName: string; ownerId: string; timestamp: string }) {
  const parsed = path.parse(input.fileName);
  const stamp = input.timestamp.replace(/[^0-9A-Za-z]+/g, "");
  return `settings/users/${safeObjectSegment(input.ownerId)}/backgrounds/${stamp}-${randomUUID().slice(0, 8)}-${safeObjectSegment(parsed.name)}${parsed.ext}`;
}

function personalBackgroundUrl(ownerId: string, fileName: string) {
  return `/settings/backgrounds/app_background/personal/${safeUserSegment(ownerId)}/${encodeURIComponent(fileName)}`;
}

function personalBackgroundId(ownerId: string, fileName: string) {
  return `app_background/personal/${safeUserSegment(ownerId)}/${fileName}`;
}

function emptyPersonalAppShellBackgrounds() {
  return Object.fromEntries(appShellBackgroundSlots.map((slot) => [slot, null])) as Record<AppShellBackgroundSlot, BackgroundSceneConfig | null>;
}

function defaultUserPreferences(userId: string): UserPreferences {
  return {
    userId,
    defaultLandingPath: null,
    sidebarCollapsed: null,
    appBackground: null,
    appShellBackgrounds: emptyPersonalAppShellBackgrounds(),
    personalBackgroundsShared: false,
    personalBackgroundAccessGrants: [],
    personalBackgroundResources: [],
    notificationDisplay: {
      toastEnabled: true,
    },
  };
}

function normalizePersonalBackgroundResources(input: unknown): PersonalBackgroundResource[] {
  if (!Array.isArray(input)) {
    return [];
  }
  return input
    .filter((resource): resource is Partial<PersonalBackgroundResource> =>
      typeof resource === "object" &&
      resource !== null &&
      typeof resource.fileName === "string" &&
      typeof resource.objectKey === "string" &&
      typeof resource.mimeType === "string" &&
      typeof resource.fileSize === "number")
    .map((resource) => ({
      createdAt: typeof resource.createdAt === "string" ? resource.createdAt : nowIso(),
      fileName: path.basename(resource.fileName ?? "background"),
      fileSize: resource.fileSize ?? 0,
      mimeType: resource.mimeType ?? "application/octet-stream",
      objectKey: resource.objectKey ?? "",
    }));
}

function normalizeUserPreferences(userId: string, input: Partial<UserPreferences> | null | undefined): UserPreferences {
  const fallback = defaultUserPreferences(userId);
  const defaultLandingPath =
    typeof input?.defaultLandingPath === "string" && allowedLandingPaths.has(input.defaultLandingPath)
      ? input.defaultLandingPath
      : input?.defaultLandingPath === null
        ? null
        : fallback.defaultLandingPath;
  const legacyAppBackground = input?.appBackground ? backgroundSceneConfigSchema.parse(input.appBackground) : null;
  const appShellBackgrounds = emptyPersonalAppShellBackgrounds();
  for (const slot of appShellBackgroundSlots) {
    const slotConfig = input?.appShellBackgrounds?.[slot];
    appShellBackgrounds[slot] = slotConfig ? backgroundSceneConfigSchema.parse(slotConfig) : slotConfig === null ? null : legacyAppBackground;
  }

  return {
    userId,
    defaultLandingPath,
    sidebarCollapsed: typeof input?.sidebarCollapsed === "boolean" ? input.sidebarCollapsed : input?.sidebarCollapsed === null ? null : fallback.sidebarCollapsed,
    appBackground: legacyAppBackground,
    appShellBackgrounds,
    personalBackgroundsShared: input?.personalBackgroundsShared === true,
    personalBackgroundAccessGrants: Array.isArray(input?.personalBackgroundAccessGrants)
      ? Array.from(new Set(input.personalBackgroundAccessGrants.filter((grant): grant is string => typeof grant === "string" && grant.trim().length > 0)))
      : [],
    personalBackgroundResources: normalizePersonalBackgroundResources(input?.personalBackgroundResources),
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
    await writeFile(tempPath, `${JSON.stringify(preferences, null, 2)}\n`, "utf8");
    await rename(tempPath, targetPath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
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

function parsePersonalBackgroundId(id: string, fallbackOwnerId?: string) {
  let decodedId: string;
  try {
    decodedId = decodeURIComponent(id);
  } catch {
    throw new Error("background not found");
  }

  const [sceneRaw, scopeRaw, ...fileNameParts] = decodedId.split("/");
  const scene = canonicalVisualBackgroundScene(z.enum(["app_background", "sidebar_background"]).parse(sceneRaw));
  let ownerId = fallbackOwnerId ?? "";
  let fileName = "";

  if (fileNameParts.length === 1 && fallbackOwnerId) {
    fileName = fileNameParts[0] ?? "";
  } else if (fileNameParts.length === 2) {
    ownerId = userIdFromSafeSegment(fileNameParts[0] ?? "");
    fileName = fileNameParts[1] ?? "";
  } else {
    throw new Error("background not found");
  }

  if (scene !== "app_background" || scopeRaw !== "personal" || !ownerId || !fileName || fileName.includes("/") || fileName.includes("\\") || path.basename(fileName) !== fileName) {
    throw new Error("background not found");
  }

  return { ownerId, fileName, id: personalBackgroundId(ownerId, fileName) };
}

async function readKnownPersonalBackgroundOwnerIds() {
  const directory = path.join(settingsRoot, "users");
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      try {
        return userIdFromSafeSegment(entry.name);
      } catch {
        return null;
      }
    })
    .filter((userId): userId is string => Boolean(userId));
}

async function readUserDisplayNames(userIds: string[]) {
  const uniqueUserIds = Array.from(new Set(userIds));
  if (uniqueUserIds.length === 0) {
    return new Map<string, string>();
  }

  try {
    const rows = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, uniqueUserIds));
    return new Map(rows.map((user) => [user.id, user.name]));
  } catch {
    return new Map<string, string>();
  }
}

async function scanPersonalBackgroundsForOwner(input: {
  ownerId: string;
  viewerId: string;
  ownerName: string;
  resources: PersonalBackgroundResource[];
  shared: boolean;
}) {
  return input.resources
    .slice()
    .sort((first, second) => first.fileName.localeCompare(second.fileName))
    .map((resource) => {
      const id = personalBackgroundId(input.ownerId, resource.fileName);
      return {
        id,
        scene: "app_background",
        fileName: resource.fileName,
        url: personalBackgroundUrl(input.ownerId, resource.fileName),
        fileKey: id,
        mimeType: resource.mimeType,
        fileSize: resource.fileSize,
        isDefault: false,
        createdAt: resource.createdAt,
        ownerId: input.ownerId,
        ownerName: input.ownerName,
        shared: input.shared,
        ownedByCurrentUser: input.ownerId === input.viewerId,
      } satisfies VisualBackgroundImage;
    });
}

async function assertAccessibleAppBackground(userId: string, id: string) {
  const decodedId = decodeURIComponent(id);
  if (decodedId.startsWith("app_background/personal/") || decodedId.startsWith("sidebar_background/personal/")) {
    const parsed = parsePersonalBackgroundId(decodedId, userId);
    const [ownerPreferences, viewerPreferences] = await Promise.all([
      readUserPreferences(parsed.ownerId),
      readUserPreferences(userId),
    ]);
    if (!ownerPreferences.personalBackgroundResources.some((resource) => resource.fileName === parsed.fileName)) {
      throw new Error("background not found");
    }
    if (parsed.ownerId === userId) {
      return { id: parsed.id, grantId: null };
    }

    if (!ownerPreferences.personalBackgroundsShared && !viewerPreferences.personalBackgroundAccessGrants.includes(parsed.id)) {
      throw new Error("background not found");
    }
    return { id: parsed.id, grantId: parsed.id };
  }

  const parsed = parseBackgroundId(decodedId);
  if (parsed.scene !== "app_background" || parsed.scope === "personal") {
    throw new Error("background not found");
  }
  const systemBackgrounds = await listVisualBackgrounds("app_background");
  if (!systemBackgrounds.list.some((background) => background.id === `${parsed.storageScene}/${parsed.storageScope}/${parsed.fileName}`)) {
    throw new Error("background not found");
  }
  return { id: `${parsed.storageScene}/${parsed.storageScope}/${parsed.fileName}`, grantId: null };
}

async function normalizePersonalBackgroundConfig(userId: string, config: BackgroundSceneConfig | null, grantIds: Set<string>) {
  if (!config) {
    return null;
  }

  if (config.mode === "fixed" && !config.fixedBackgroundId) {
    throw new Error("invalid preference");
  }

  return {
    ...config,
    fixedBackgroundId: config.fixedBackgroundId
      ? await assertAccessibleAppBackground(userId, config.fixedBackgroundId).then((result) => {
        if (result.grantId) {
          grantIds.add(result.grantId);
        }
        return result.id;
      })
      : null,
  } satisfies BackgroundSceneConfig;
}

function mergePersonalBackgroundGrantIds(preferences: UserPreferences, grantIds: Set<string>) {
  if (grantIds.size === 0) {
    return;
  }
  preferences.personalBackgroundAccessGrants = Array.from(new Set([...preferences.personalBackgroundAccessGrants, ...grantIds]));
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
    if (input.notificationDisplay) {
      preferences.notificationDisplay = {
        ...preferences.notificationDisplay,
        ...input.notificationDisplay,
      };
    }
    if (input.personalBackgroundsShared !== undefined) {
      preferences.personalBackgroundsShared = input.personalBackgroundsShared;
    }
    const grantIds = new Set<string>();
    if (input.appBackground !== undefined) {
      preferences.appBackground = await normalizePersonalBackgroundConfig(userId, input.appBackground, grantIds);
      if (input.appBackground !== null) {
        for (const slot of appShellBackgroundSlots) {
          preferences.appShellBackgrounds[slot] = preferences.appBackground;
        }
      }
    }
    if (input.appShellBackgrounds) {
      for (const slot of appShellBackgroundSlots) {
        if (Object.hasOwn(input.appShellBackgrounds, slot)) {
          preferences.appShellBackgrounds[slot] = await normalizePersonalBackgroundConfig(userId, input.appShellBackgrounds[slot] ?? null, grantIds);
        }
      }
    }
    mergePersonalBackgroundGrantIds(preferences, grantIds);
    return preferences;
  });
}

export async function listPersonalBackgrounds(userId: string): Promise<PersonalBackgroundsData> {
  const [preferences, systemSlots, ownerIds] = await Promise.all([
    readUserPreferences(userId),
    Promise.all(appShellBackgroundSlots.map((slot) => listAppShellBackgrounds(slot))),
    readKnownPersonalBackgroundOwnerIds(),
  ]);
  const ownerPreferences = new Map<string, UserPreferences>();
  await Promise.all(ownerIds.map(async (ownerId) => {
    ownerPreferences.set(ownerId, await readUserPreferences(ownerId));
  }));
  const ownerNames = await readUserDisplayNames(ownerIds);
  const grantedIds = new Set(preferences.personalBackgroundAccessGrants);
  const personalImages = (
    await Promise.all(ownerIds.map(async (ownerId) => {
      const ownerPreference = ownerPreferences.get(ownerId) ?? defaultUserPreferences(ownerId);
      const canListOwner = ownerId === userId || ownerPreference.personalBackgroundsShared;
      const ownerImages = await scanPersonalBackgroundsForOwner({
        ownerId,
        viewerId: userId,
        ownerName: ownerNames.get(ownerId) ?? "未知成员",
        resources: ownerPreference.personalBackgroundResources,
        shared: ownerPreference.personalBackgroundsShared,
      });
      return ownerImages.filter((image) => canListOwner || grantedIds.has(image.id));
    }))
  ).flat();
  const systemList = systemSlots[0]?.list ?? (await listVisualBackgrounds("app_background")).list;
  const list = [...systemList, ...personalImages];
  const listIds = new Set(list.map((image) => image.id));
  const slots = Object.fromEntries(systemSlots.map((systemSlot) => {
    const personalConfig = preferences.appShellBackgrounds[systemSlot.slot];
    const personalFixedExists = personalConfig?.fixedBackgroundId ? listIds.has(personalConfig.fixedBackgroundId) : false;
    const config = personalConfig && (personalConfig.mode !== "fixed" || personalFixedExists)
      ? { ...personalConfig, fixedBackgroundId: personalFixedExists ? personalConfig.fixedBackgroundId : null }
      : systemSlot.config;
    const fixedBackgroundId = config.fixedBackgroundId && listIds.has(config.fixedBackgroundId)
      ? config.fixedBackgroundId
      : systemSlot.config.fixedBackgroundId;

    return [
      systemSlot.slot,
      {
        slot: systemSlot.slot,
        scene: "app_background" as const,
        config: {
          ...config,
          fixedBackgroundId,
        },
        list: list.map((image) => ({ ...image, isDefault: image.id === fixedBackgroundId })),
      },
    ];
  })) as Record<AppShellBackgroundSlot, AppShellPersonalBackgroundSlotData>;

  return {
    scene: "app_background",
    slots,
    list,
    preferences,
  };
}

export async function saveUploadedPersonalBackground(input: { userId: string; fileName: string; mimeType: string; buffer: Buffer }) {
  if (!isSupportedVisualBackgroundImage(input.mimeType, input.buffer)) {
    throw new Error("invalid file type");
  }
  if (input.buffer.length > maxUploadSize) {
    throw new Error("file too large");
  }

  const ownerNames = await readUserDisplayNames([input.userId]);
  const preferences = await readUserPreferences(input.userId);
  if (preferences.personalBackgroundResources.length >= maxPersonalBackgroundsPerUser) {
    throw new Error("personal background quota exceeded");
  }

  const timestamp = nowIso();
  const baseFileName = sanitizeFileName(input.fileName, input.mimeType);
  const fileName = `${path.parse(baseFileName).name}-${randomUUID().slice(0, 8)}${path.parse(baseFileName).ext}`;
  const objectKey = personalBackgroundObjectKey({ fileName, ownerId: input.userId, timestamp });
  const id = personalBackgroundId(input.userId, fileName);
  const resource: PersonalBackgroundResource = {
    createdAt: timestamp,
    fileName,
    fileSize: input.buffer.byteLength,
    mimeType: input.mimeType,
    objectKey,
  };

  await objectStorage.putObject({
    body: input.buffer,
    contentLength: input.buffer.byteLength,
    contentType: input.mimeType,
    key: objectKey,
  });

  try {
    await updateUserPreferences(input.userId, (current) => {
      current.personalBackgroundResources = [...current.personalBackgroundResources, resource];
    });
  } catch (error) {
    await objectStorage.deleteObject(objectKey).catch(() => undefined);
    throw error;
  }

  return {
    id,
    scene: "app_background",
    fileName,
    url: personalBackgroundUrl(input.userId, fileName),
    fileKey: id,
    mimeType: resource.mimeType,
    fileSize: resource.fileSize,
    isDefault: false,
    createdAt: resource.createdAt,
    ownerId: input.userId,
    ownerName: ownerNames.get(input.userId) ?? "我",
    shared: preferences.personalBackgroundsShared,
    ownedByCurrentUser: true,
  } satisfies VisualBackgroundImage;
}

async function removeDeletedPersonalBackgroundReferences(deletedId: string) {
  const ownerIds = await readKnownPersonalBackgroundOwnerIds();
  await Promise.all(ownerIds.map(async (ownerId) => {
    const preferences = await readUserPreferences(ownerId);
    let changed = false;
    if (preferences.appBackground?.fixedBackgroundId === deletedId) {
      preferences.appBackground = null;
      changed = true;
    }
    for (const slot of appShellBackgroundSlots) {
      if (preferences.appShellBackgrounds[slot]?.fixedBackgroundId === deletedId) {
        preferences.appShellBackgrounds[slot] = null;
        changed = true;
      }
    }
    const nextGrants = preferences.personalBackgroundAccessGrants.filter((grantId) => grantId !== deletedId);
    if (nextGrants.length !== preferences.personalBackgroundAccessGrants.length) {
      preferences.personalBackgroundAccessGrants = nextGrants;
      changed = true;
    }
    if (changed) {
      await writeUserPreferences(preferences);
    }
  }));
}

export async function deletePersonalBackground(userId: string, id: string) {
  const parsed = parsePersonalBackgroundId(id, userId);
  if (parsed.ownerId !== userId) {
    throw new Error("background not found");
  }
  let deletedObjectKey: string | null = null;
  await updateUserPreferences(userId, (preferences) => {
    const resource = preferences.personalBackgroundResources.find((entry) => entry.fileName === parsed.fileName);
    if (!resource) {
      throw new Error("background not found");
    }
    deletedObjectKey = resource.objectKey;
    preferences.personalBackgroundResources = preferences.personalBackgroundResources.filter((entry) => entry.fileName !== parsed.fileName);
  });
  if (!deletedObjectKey) {
    throw new Error("background not found");
  }

  const deletedId = parsed.id;
  await objectStorage.deleteObject(deletedObjectKey).catch(() => undefined);
  await removeDeletedPersonalBackgroundReferences(deletedId);

  return { id: deletedId };
}

export async function getPersonalBackgroundFile(userId: string, sceneRaw: string, scopeRaw: string, fileName: string, ownerKey?: string) {
  const scene = canonicalVisualBackgroundScene(z.enum(["app_background", "sidebar_background"]).parse(sceneRaw));
  if (scene !== "app_background" || scopeRaw !== "personal") {
    throw new Error("background not found");
  }

  const parsed = ownerKey
    ? parsePersonalBackgroundId(`app_background/personal/${ownerKey}/${fileName}`, userId)
    : parsePersonalBackgroundId(`app_background/personal/${fileName}`, userId);
  const [ownerPreferences, viewerPreferences] = await Promise.all([
    readUserPreferences(parsed.ownerId),
    readUserPreferences(userId),
  ]);
  const resource = ownerPreferences.personalBackgroundResources.find((entry) => entry.fileName === parsed.fileName);
  if (!resource) {
    throw new Error("background not found");
  }
  if (parsed.ownerId !== userId) {
    if (!ownerPreferences.personalBackgroundsShared && !viewerPreferences.personalBackgroundAccessGrants.includes(parsed.id)) {
      throw new Error("background not found");
    }
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
