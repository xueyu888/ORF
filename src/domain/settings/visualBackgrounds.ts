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
  "page_resources_background",
  "page_settings_background",
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

export const visualBackgroundScopes = ["default", "system", "personal"] as const;

export type AppChromeVisualBackgroundScene = (typeof appChromeVisualBackgroundScenes)[number];
export type PageVisualBackgroundScene = (typeof pageVisualBackgroundScenes)[number];
export type VisualBackgroundScene = (typeof visualBackgroundScenes)[number];
export type VisualBackgroundScope = (typeof visualBackgroundScopes)[number];

export type VisualBackgroundMode = "fixed" | "switchable";
export type VisualBackgroundSwitchTrigger = "on_open" | "interval";
export type VisualBackgroundSwitchOrder = "sequential" | "random";
export type VisualBackgroundFitMode = "cover-crop";
export const visualMaterialTones = ["auto", "soft-light", "soft-dark"] as const;
export type VisualMaterialTone = (typeof visualMaterialTones)[number];

export type VisualMaterialPreferences = {
  tone: VisualMaterialTone;
  exposure: number;
  overlayStrength: number;
  blurStrength: number;
  reduceTransparency: boolean;
};

export type VisualBackgroundMigration = {
  overlayOpacityV2: number | null;
};

export type VisualBackgroundCrop = {
  centerX: number;
  centerY: number;
  zoom: number;
};

export type VisualBackgroundConfig = {
  version: 4;
  fitMode: VisualBackgroundFitMode;
  mode: VisualBackgroundMode;
  fixedBackgroundId: string | null;
  material: VisualMaterialPreferences;
  migration: VisualBackgroundMigration;
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

export const visualMaterialExposureLimits = {
  min: 0,
  max: 1,
} as const;

export const visualMaterialStrengthLimits = {
  min: 0,
  max: 1,
} as const;

export const defaultVisualBackgroundCrop: VisualBackgroundCrop = {
  centerX: 0.5,
  centerY: 0.5,
  zoom: 1,
};

export const defaultVisualMaterialPreferences: VisualMaterialPreferences = {
  tone: "auto",
  exposure: 0.64,
  overlayStrength: 1,
  blurStrength: 1,
  reduceTransparency: false,
};

export function isPageVisualBackgroundScene(scene: VisualBackgroundScene): scene is PageVisualBackgroundScene {
  return (pageVisualBackgroundScenes as readonly string[]).includes(scene);
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export function normalizeVisualBackgroundCrop(input: Partial<VisualBackgroundCrop> | Record<string, unknown> | null | undefined): VisualBackgroundCrop {
  return {
    centerX: clampNumber(input?.centerX, visualBackgroundCropLimits.centerMin, visualBackgroundCropLimits.centerMax, defaultVisualBackgroundCrop.centerX),
    centerY: clampNumber(input?.centerY, visualBackgroundCropLimits.centerMin, visualBackgroundCropLimits.centerMax, defaultVisualBackgroundCrop.centerY),
    zoom: clampNumber(input?.zoom, visualBackgroundCropLimits.zoomMin, visualBackgroundCropLimits.zoomMax, defaultVisualBackgroundCrop.zoom),
  };
}

export function normalizeVisualMaterialTone(input: unknown): VisualMaterialTone {
  return (visualMaterialTones as readonly unknown[]).includes(input) ? input as VisualMaterialTone : defaultVisualMaterialPreferences.tone;
}

export function normalizeVisualMaterialPreferences(
  input: Partial<VisualMaterialPreferences> | null | undefined,
): VisualMaterialPreferences {
  return {
    tone: normalizeVisualMaterialTone(input?.tone),
    exposure: clampNumber(
      input?.exposure,
      visualMaterialExposureLimits.min,
      visualMaterialExposureLimits.max,
      defaultVisualMaterialPreferences.exposure,
    ),
    overlayStrength: clampNumber(
      input?.overlayStrength,
      visualMaterialStrengthLimits.min,
      visualMaterialStrengthLimits.max,
      defaultVisualMaterialPreferences.overlayStrength,
    ),
    blurStrength: clampNumber(
      input?.blurStrength,
      visualMaterialStrengthLimits.min,
      visualMaterialStrengthLimits.max,
      defaultVisualMaterialPreferences.blurStrength,
    ),
    reduceTransparency: typeof input?.reduceTransparency === "boolean"
      ? input.reduceTransparency
      : defaultVisualMaterialPreferences.reduceTransparency,
  };
}

export function normalizeVisualBackgroundMigration(
  input: Partial<VisualBackgroundMigration> | null | undefined,
): VisualBackgroundMigration {
  const candidate = input?.overlayOpacityV2;
  return {
    overlayOpacityV2: typeof candidate !== "number" || !Number.isFinite(candidate)
      ? null
      : clampNumber(candidate, 0, 1, 0),
  };
}

export function defaultVisualBackgroundConfig(): VisualBackgroundConfig {
  return {
    version: 4,
    fitMode: "cover-crop",
    mode: "fixed",
    fixedBackgroundId: null,
    material: { ...defaultVisualMaterialPreferences },
    migration: { overlayOpacityV2: null },
    switchTrigger: "on_open",
    switchOrder: "random",
    switchIntervalMinutes: 10,
    crops: {},
  };
}

function recordValue(input: unknown): Record<string, unknown> {
  return typeof input === "object" && input !== null ? input as Record<string, unknown> : {};
}

export function normalizeVisualBackgroundConfig(input: unknown): VisualBackgroundConfig {
  const raw = recordValue(input);
  const fallback = defaultVisualBackgroundConfig();
  const materialInput = recordValue(raw.material) as Partial<VisualMaterialPreferences>;
  const migrationInput = recordValue(raw.migration) as Partial<VisualBackgroundMigration>;
  const rawCrops = recordValue(raw.crops);
  const crops = Object.fromEntries(
    Object.entries(rawCrops).map(([backgroundId, crop]) => [backgroundId, normalizeVisualBackgroundCrop(recordValue(crop))]),
  );
  const mode = raw.mode === "switchable" ? "switchable" : "fixed";
  const switchTrigger = raw.switchTrigger === "interval" ? "interval" : "on_open";
  const switchOrder = raw.switchOrder === "sequential" ? "sequential" : "random";

  return {
    version: 4,
    fitMode: "cover-crop",
    mode,
    fixedBackgroundId: typeof raw.fixedBackgroundId === "string" ? raw.fixedBackgroundId : null,
    material: normalizeVisualMaterialPreferences(materialInput),
    migration: normalizeVisualBackgroundMigration(migrationInput),
    switchTrigger,
    switchOrder,
    switchIntervalMinutes: Math.round(clampNumber(raw.switchIntervalMinutes, 1, 1440, fallback.switchIntervalMinutes)),
    crops,
  };
}
