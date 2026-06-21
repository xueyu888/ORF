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

export type VisualBackgroundPlacement = {
  offsetX: number;
  offsetY: number;
  scale: number;
};

export type VisualBackgroundConfig = {
  mode: VisualBackgroundMode;
  fixedBackgroundId: string | null;
  switchTrigger: VisualBackgroundSwitchTrigger;
  switchOrder: VisualBackgroundSwitchOrder;
  switchIntervalMinutes: number;
  placements: Record<string, VisualBackgroundPlacement>;
};

export const visualBackgroundPlacementLimits = {
  offsetMin: -100,
  offsetMax: 100,
  scaleMin: 0.5,
  scaleMax: 3,
} as const;

export const defaultVisualBackgroundPlacement: VisualBackgroundPlacement = {
  offsetX: 0,
  offsetY: 0,
  scale: 1,
};

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

export function normalizeVisualBackgroundPlacement(input: Partial<VisualBackgroundPlacement> | null | undefined): VisualBackgroundPlacement {
  return {
    offsetX: clampNumber(input?.offsetX, visualBackgroundPlacementLimits.offsetMin, visualBackgroundPlacementLimits.offsetMax, defaultVisualBackgroundPlacement.offsetX),
    offsetY: clampNumber(input?.offsetY, visualBackgroundPlacementLimits.offsetMin, visualBackgroundPlacementLimits.offsetMax, defaultVisualBackgroundPlacement.offsetY),
    scale: clampNumber(input?.scale, visualBackgroundPlacementLimits.scaleMin, visualBackgroundPlacementLimits.scaleMax, defaultVisualBackgroundPlacement.scale),
  };
}

export function defaultVisualBackgroundConfig(): VisualBackgroundConfig {
  return {
    mode: "fixed",
    fixedBackgroundId: null,
    switchTrigger: "on_open",
    switchOrder: "random",
    switchIntervalMinutes: 10,
    placements: {},
  };
}
