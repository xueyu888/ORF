export const appChromeVisualBackgroundScenes = [
  "login_background",
  "topbar_background",
  "sidebar_background",
] as const;

export const pageVisualBackgroundScenes = [
  "page_bounties_background",
  "page_tasks_background",
  "page_work_logs_background",
  "page_chat_background",
  "page_feedback_background",
  "page_reports_background",
  "page_system_background",
  "page_dashboard_background",
  "page_strategy_map_background",
  "page_ai_evaluation_background",
  "page_loot_background",
] as const;

export const visualBackgroundScenes = [
  ...appChromeVisualBackgroundScenes,
  ...pageVisualBackgroundScenes,
] as const;

export const legacyVisualBackgroundScenes = ["app_background"] as const;
export const visualBackgroundScopes = ["default", "system", "personal"] as const;
export const legacyVisualBackgroundScopes = ["user"] as const;

export type AppChromeVisualBackgroundScene = (typeof appChromeVisualBackgroundScenes)[number];
export type PageVisualBackgroundScene = (typeof pageVisualBackgroundScenes)[number];
export type VisualBackgroundScene = (typeof visualBackgroundScenes)[number];
export type LegacyVisualBackgroundScene = (typeof legacyVisualBackgroundScenes)[number];
export type AnyVisualBackgroundScene = VisualBackgroundScene | LegacyVisualBackgroundScene;
export type VisualBackgroundScope = (typeof visualBackgroundScopes)[number];
export type LegacyVisualBackgroundScope = (typeof legacyVisualBackgroundScopes)[number];
export type AnyVisualBackgroundScope = VisualBackgroundScope | LegacyVisualBackgroundScope;

export type VisualBackgroundMode = "fixed" | "switchable";
export type VisualBackgroundSwitchTrigger = "on_open" | "interval";
export type VisualBackgroundSwitchOrder = "sequential" | "random";
export type VisualBackgroundFitMode = "cover-crop";

export type VisualBackgroundCrop = {
  centerX: number;
  centerY: number;
  zoom: number;
};

export type VisualBackgroundConfig = {
  version: 2;
  fitMode: VisualBackgroundFitMode;
  mode: VisualBackgroundMode;
  fixedBackgroundId: string | null;
  overlayOpacity: number;
  switchTrigger: VisualBackgroundSwitchTrigger;
  switchOrder: VisualBackgroundSwitchOrder;
  switchIntervalMinutes: number;
  crops: Record<string, VisualBackgroundCrop>;
};

export const visualBackgroundCropLimits = {
  centerMin: 0,
  centerMax: 1,
  zoomMin: 1,
  zoomMax: 3,
} as const;

export const visualBackgroundOverlayLimits = {
  opacityMin: 0,
  opacityMax: 1,
} as const;

export const defaultVisualBackgroundCrop: VisualBackgroundCrop = {
  centerX: 0.5,
  centerY: 0.5,
  zoom: 1,
};

export const defaultVisualBackgroundOverlayOpacity = 0.58;

export function canonicalVisualBackgroundScene(scene: AnyVisualBackgroundScene): VisualBackgroundScene {
  return scene === "app_background" ? "sidebar_background" : scene;
}

export function canonicalVisualBackgroundScope(scope: AnyVisualBackgroundScope): VisualBackgroundScope {
  return scope === "user" ? "system" : scope;
}

export function acceptsLegacyAppBackgroundScene(scene: VisualBackgroundScene) {
  return scene === "topbar_background" || scene === "sidebar_background";
}

export function isPageVisualBackgroundScene(scene: VisualBackgroundScene): scene is PageVisualBackgroundScene {
  return (pageVisualBackgroundScenes as readonly string[]).includes(scene);
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function hasNewCropShape(input: unknown): input is Partial<VisualBackgroundCrop> {
  return typeof input === "object" && input !== null && ("centerX" in input || "centerY" in input || "zoom" in input);
}

function legacyPlacementToCrop(input: { offsetX?: unknown; offsetY?: unknown; scale?: unknown }): VisualBackgroundCrop {
  const offsetX = clampNumber(input.offsetX, -100, 100, 0);
  const offsetY = clampNumber(input.offsetY, -100, 100, 0);
  const legacyScale = clampNumber(input.scale, 0.5, visualBackgroundCropLimits.zoomMax, defaultVisualBackgroundCrop.zoom);

  return {
    centerX: clampNumber(0.5 + offsetX / 200, visualBackgroundCropLimits.centerMin, visualBackgroundCropLimits.centerMax, defaultVisualBackgroundCrop.centerX),
    centerY: clampNumber(0.5 + offsetY / 200, visualBackgroundCropLimits.centerMin, visualBackgroundCropLimits.centerMax, defaultVisualBackgroundCrop.centerY),
    zoom: clampNumber(Math.max(visualBackgroundCropLimits.zoomMin, legacyScale), visualBackgroundCropLimits.zoomMin, visualBackgroundCropLimits.zoomMax, defaultVisualBackgroundCrop.zoom),
  };
}

export function normalizeVisualBackgroundCrop(input: Partial<VisualBackgroundCrop> | Record<string, unknown> | null | undefined): VisualBackgroundCrop {
  if (!hasNewCropShape(input)) {
    return legacyPlacementToCrop(input ?? {});
  }

  return {
    centerX: clampNumber(input.centerX, visualBackgroundCropLimits.centerMin, visualBackgroundCropLimits.centerMax, defaultVisualBackgroundCrop.centerX),
    centerY: clampNumber(input.centerY, visualBackgroundCropLimits.centerMin, visualBackgroundCropLimits.centerMax, defaultVisualBackgroundCrop.centerY),
    zoom: clampNumber(input.zoom, visualBackgroundCropLimits.zoomMin, visualBackgroundCropLimits.zoomMax, defaultVisualBackgroundCrop.zoom),
  };
}

export function normalizeVisualBackgroundOverlayOpacity(input: unknown): number {
  return clampNumber(input, visualBackgroundOverlayLimits.opacityMin, visualBackgroundOverlayLimits.opacityMax, defaultVisualBackgroundOverlayOpacity);
}

export function defaultVisualBackgroundConfig(): VisualBackgroundConfig {
  return {
    version: 2,
    fitMode: "cover-crop",
    mode: "fixed",
    fixedBackgroundId: null,
    overlayOpacity: defaultVisualBackgroundOverlayOpacity,
    switchTrigger: "on_open",
    switchOrder: "random",
    switchIntervalMinutes: 10,
    crops: {},
  };
}
