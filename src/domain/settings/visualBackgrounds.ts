export const visualBackgroundScenes = ["login_background", "app_background"] as const;
export const legacyVisualBackgroundScenes = ["sidebar_background"] as const;
export const visualBackgroundScopes = ["default", "system"] as const;
export const legacyVisualBackgroundScopes = ["user"] as const;

export type VisualBackgroundScene = (typeof visualBackgroundScenes)[number];
export type LegacyVisualBackgroundScene = (typeof legacyVisualBackgroundScenes)[number];
export type AnyVisualBackgroundScene = VisualBackgroundScene | LegacyVisualBackgroundScene;
export type VisualBackgroundScope = (typeof visualBackgroundScopes)[number];
export type LegacyVisualBackgroundScope = (typeof legacyVisualBackgroundScopes)[number];
export type AnyVisualBackgroundScope = VisualBackgroundScope | LegacyVisualBackgroundScope;

export function canonicalVisualBackgroundScene(scene: AnyVisualBackgroundScene): VisualBackgroundScene {
  return scene === "sidebar_background" ? "app_background" : scene;
}

export function canonicalVisualBackgroundScope(scope: AnyVisualBackgroundScope): VisualBackgroundScope {
  return scope === "user" ? "system" : scope;
}
