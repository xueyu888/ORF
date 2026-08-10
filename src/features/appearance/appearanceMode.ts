import { applyDesignTokens } from "../../config/designTokens";

export type AppearanceMode = "light" | "dark";
export const defaultAppearanceMode: AppearanceMode = "light";

const appearanceModeStorageKey = "orf.appearanceMode.v1";

export function readCachedAppearanceMode(): AppearanceMode {
  if (typeof window === "undefined") return defaultAppearanceMode;
  try {
    const stored = window.localStorage.getItem(appearanceModeStorageKey);
    return stored === "dark" || stored === "light" ? stored : defaultAppearanceMode;
  } catch {
    return defaultAppearanceMode;
  }
}

export function cacheAppearanceMode(appearanceMode: AppearanceMode) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(appearanceModeStorageKey, appearanceMode);
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
