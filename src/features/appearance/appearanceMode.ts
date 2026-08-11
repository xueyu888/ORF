import { applyDesignTokens } from "../../config/designTokens";

export type AppearanceMode = "light" | "dark";
export const defaultAppearanceMode: AppearanceMode = "light";

const appearanceModeStorageKey = "orf.appearanceMode.v1";
const userAppearanceModeStoragePrefix = "orf.userAppearanceMode.v1";

function storedAppearanceMode(key: string): AppearanceMode | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(key);
    return stored === "dark" || stored === "light" ? stored : null;
  } catch {
    return null;
  }
}

function userAppearanceModeStorageKey(userId: string) {
  return `${userAppearanceModeStoragePrefix}.${encodeURIComponent(userId)}`;
}

export function readCachedAppearanceMode(): AppearanceMode {
  return storedAppearanceMode(appearanceModeStorageKey) ?? defaultAppearanceMode;
}

export function readCachedUserAppearanceMode(userId: string | null | undefined): AppearanceMode | null {
  return userId ? storedAppearanceMode(userAppearanceModeStorageKey(userId)) : null;
}

export function cacheConfirmedAppearanceMode(userId: string, appearanceMode: AppearanceMode) {
  if (typeof window === "undefined" || !userId) return;
  try {
    window.localStorage.setItem(appearanceModeStorageKey, appearanceMode);
    window.localStorage.setItem(userAppearanceModeStorageKey(userId), appearanceMode);
  } catch {
    // The server preference remains authoritative when local storage is unavailable.
  }
}

export function applyAppearanceModeToDocument(appearanceMode: AppearanceMode) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute("data-orf-appearance", appearanceMode);
  root.style.colorScheme = appearanceMode;
  applyDesignTokens(appearanceMode, root);
}

export function initializeAppearanceMode() {
  const appearanceMode = readCachedAppearanceMode();
  applyAppearanceModeToDocument(appearanceMode);
  return appearanceMode;
}
