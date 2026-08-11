import {
  normalizeVisualBackgroundCrop,
  normalizeVisualMaterialPreferences,
  visualBackgroundScenes,
  type VisualBackgroundScene,
} from "../../../domain/settings/visualBackgrounds";
import type { VisualBackgroundImage } from "../../../state/apiClient";
import type { VisualBackgroundSelection } from "../../../utils/visualBackgrounds";

const cacheName = "orf-visual-background-images-v1";
const manifestStoragePrefix = "orf.visualBackgroundImageCache.v1";
const cacheRoutePrefix = "/__orf-local-background-cache__/v1";
const pendingCacheMutations = new Map<string, Promise<boolean>>();

type CachedVisualBackgroundManifest = {
  cachedAt: string;
  cacheUrl: string;
  crop: VisualBackgroundSelection["crop"];
  image: VisualBackgroundImage;
  material: VisualBackgroundSelection["material"];
  scene: VisualBackgroundScene;
  sourceUrl: string;
  userId: string;
  version: 1;
};

export type CachedVisualBackgroundSelection = VisualBackgroundSelection & {
  cachedAt: string;
  sourceUrl: string;
};

function canUsePersistentBackgroundCache() {
  try {
    return typeof window !== "undefined"
      && typeof window.caches !== "undefined"
      && typeof window.localStorage !== "undefined"
      && typeof window.URL?.createObjectURL === "function";
  } catch {
    return false;
  }
}

function manifestStorageKey(userId: string, scene: VisualBackgroundScene) {
  return `${manifestStoragePrefix}.${encodeURIComponent(userId)}.${scene}`;
}

function cacheUrl(userId: string, scene: VisualBackgroundScene, imageId: string) {
  return new URL(
    `${cacheSceneUrlPrefix(userId, scene)}${encodeURIComponent(imageId)}`,
    window.location.origin,
  ).href;
}

function cacheSceneUrlPrefix(userId: string, scene: VisualBackgroundScene) {
  return `${cacheRoutePrefix}/${encodeURIComponent(userId)}/${encodeURIComponent(scene)}/`;
}

async function removeSceneCacheEntries(
  cache: Cache,
  userId: string,
  scene: VisualBackgroundScene,
  exceptUrl?: string,
) {
  const prefix = new URL(cacheSceneUrlPrefix(userId, scene), window.location.origin).href;
  const requests = await cache.keys();
  await Promise.all(requests
    .filter((request) => request.url.startsWith(prefix) && request.url !== exceptUrl)
    .map((request) => cache.delete(request)));
}

function recordValue(input: unknown): Record<string, unknown> {
  return typeof input === "object" && input !== null ? input as Record<string, unknown> : {};
}

function normalizedCachedImage(input: unknown, fallbackScene: VisualBackgroundScene): VisualBackgroundImage | null {
  const image = recordValue(input);
  if (typeof image.id !== "string" || typeof image.url !== "string" || typeof image.fileName !== "string") return null;
  const scene = typeof image.scene === "string" && (visualBackgroundScenes as readonly string[]).includes(image.scene)
    ? image.scene as VisualBackgroundScene
    : fallbackScene;
  return {
    id: image.id,
    scene,
    fileName: image.fileName,
    url: image.url,
    fileKey: typeof image.fileKey === "string" ? image.fileKey : image.id,
    mimeType: typeof image.mimeType === "string" ? image.mimeType : "image/*",
    fileSize: typeof image.fileSize === "number" && Number.isFinite(image.fileSize) ? image.fileSize : 0,
    isDefault: image.isDefault === true,
    ...(typeof image.createdAt === "string" ? { createdAt: image.createdAt } : {}),
  };
}

function readManifest(userId: string, scene: VisualBackgroundScene): CachedVisualBackgroundManifest | null {
  if (!canUsePersistentBackgroundCache()) return null;
  try {
    const raw = window.localStorage.getItem(manifestStorageKey(userId, scene));
    if (!raw) return null;
    const parsed = recordValue(JSON.parse(raw));
    const image = normalizedCachedImage(parsed.image, scene);
    if (
      parsed.version !== 1
      || parsed.userId !== userId
      || parsed.scene !== scene
      || typeof parsed.cacheUrl !== "string"
      || typeof parsed.sourceUrl !== "string"
      || typeof parsed.cachedAt !== "string"
      || !image
      || parsed.cacheUrl !== cacheUrl(userId, scene, image.id)
      || parsed.sourceUrl !== image.url
    ) {
      window.localStorage.removeItem(manifestStorageKey(userId, scene));
      return null;
    }
    return {
      version: 1,
      userId,
      scene,
      image,
      cacheUrl: parsed.cacheUrl,
      sourceUrl: parsed.sourceUrl,
      cachedAt: parsed.cachedAt,
      crop: normalizeVisualBackgroundCrop(recordValue(parsed.crop)),
      material: normalizeVisualMaterialPreferences(recordValue(parsed.material)),
    };
  } catch {
    try {
      window.localStorage.removeItem(manifestStorageKey(userId, scene));
    } catch {
      // The cache is optional; storage failures fall back to the network path.
    }
    return null;
  }
}

async function clearPersistedVisualBackgroundSelection(userId: string, scene: VisualBackgroundScene) {
  if (!canUsePersistentBackgroundCache()) return false;
  try {
    const manifest = readManifest(userId, scene);
    window.localStorage.removeItem(manifestStorageKey(userId, scene));
    const cache = await window.caches.open(cacheName);
    if (manifest) await cache.delete(manifest.cacheUrl);
    await removeSceneCacheEntries(cache, userId, scene);
    return true;
  } catch {
    return false;
  }
}

function enqueueCacheMutation(
  userId: string,
  scene: VisualBackgroundScene,
  mutate: () => Promise<boolean>,
) {
  const key = manifestStorageKey(userId, scene);
  const previousMutation = pendingCacheMutations.get(key) ?? Promise.resolve(false);
  const nextMutation = previousMutation
    .catch(() => false)
    .then(mutate);
  pendingCacheMutations.set(key, nextMutation);
  void nextMutation.finally(() => {
    if (pendingCacheMutations.get(key) === nextMutation) pendingCacheMutations.delete(key);
  });
  return nextMutation;
}

export async function readCachedVisualBackgroundSelection(input: {
  scene: VisualBackgroundScene;
  userId: string;
}): Promise<CachedVisualBackgroundSelection | null> {
  const manifest = readManifest(input.userId, input.scene);
  if (!manifest) return null;
  try {
    const cache = await window.caches.open(cacheName);
    const response = await cache.match(manifest.cacheUrl);
    if (!response?.ok) {
      await clearCachedVisualBackgroundSelection(input);
      return null;
    }
    const blob = await response.blob();
    if (blob.size === 0) {
      await clearCachedVisualBackgroundSelection(input);
      return null;
    }
    return {
      image: manifest.image,
      crop: manifest.crop,
      material: manifest.material,
      sourceUrl: manifest.sourceUrl,
      cachedAt: manifest.cachedAt,
      url: window.URL.createObjectURL(blob),
    };
  } catch {
    return null;
  }
}

async function persistVisualBackgroundSelection(input: {
  scene: VisualBackgroundScene;
  selection: VisualBackgroundSelection;
  userId: string;
}) {
  if (!canUsePersistentBackgroundCache()) return false;
  try {
    const previousManifest = readManifest(input.userId, input.scene);
    const targetUrl = cacheUrl(input.userId, input.scene, input.selection.image.id);
    const cache = await window.caches.open(cacheName);
    const cachedResponse = await cache.match(targetUrl);
    let hasUsableCachedImage = false;
    if (cachedResponse?.ok) {
      try {
        hasUsableCachedImage = (await cachedResponse.clone().blob()).size > 0;
      } catch {
        await cache.delete(targetUrl);
      }
    }
    if (!hasUsableCachedImage) {
      const response = await window.fetch(input.selection.image.url, {
        cache: "force-cache",
        credentials: "include",
      });
      if (!response.ok) return false;
      const blob = await response.blob();
      if (blob.size === 0) return false;
      await cache.put(targetUrl, new Response(blob, {
        headers: { "Content-Type": blob.type || input.selection.image.mimeType || "application/octet-stream" },
        status: 200,
      }));
    }
    const manifest: CachedVisualBackgroundManifest = {
      version: 1,
      userId: input.userId,
      scene: input.scene,
      image: input.selection.image,
      crop: normalizeVisualBackgroundCrop(input.selection.crop),
      material: normalizeVisualMaterialPreferences(input.selection.material),
      sourceUrl: input.selection.image.url,
      cacheUrl: targetUrl,
      cachedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(manifestStorageKey(input.userId, input.scene), JSON.stringify(manifest));
    if (!previousManifest || previousManifest.cacheUrl !== targetUrl) {
      await removeSceneCacheEntries(cache, input.userId, input.scene, targetUrl);
    }
    return true;
  } catch {
    return false;
  }
}

export function cacheVisualBackgroundSelection(input: {
  scene: VisualBackgroundScene;
  selection: VisualBackgroundSelection;
  userId: string;
}) {
  return enqueueCacheMutation(
    input.userId,
    input.scene,
    () => persistVisualBackgroundSelection(input),
  );
}

export function clearCachedVisualBackgroundSelection(input: {
  scene: VisualBackgroundScene;
  userId: string;
}) {
  return enqueueCacheMutation(
    input.userId,
    input.scene,
    () => clearPersistedVisualBackgroundSelection(input.userId, input.scene),
  );
}

export function releaseCachedVisualBackgroundSelection(selection: CachedVisualBackgroundSelection | null) {
  if (typeof window !== "undefined" && selection?.url.startsWith("blob:")) {
    window.URL.revokeObjectURL(selection.url);
  }
}
