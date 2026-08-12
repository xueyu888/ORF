import { z } from "zod";

export const appearanceModeSchema = z.enum(["dark", "light"]);
export const displayDensitySchema = z.enum(["compact", "default", "comfortable"]);
export const displayContrastSchema = z.enum(["default", "high"]);
export const displayPreferenceLimits = {
  contentFontSize: { max: 28, min: 13 },
  interfaceFontSize: { max: 22, min: 12 },
  workbenchZoomLevel: { max: 4, min: -2, shortcutStep: 1, step: 0.25 },
} as const;
export const sidebarLayoutLimits = {
  expandedWidthPx: { default: 260, max: 560, min: 220 },
} as const;
export const workbenchZoomLevelSchema = z.coerce.number().finite()
  .min(displayPreferenceLimits.workbenchZoomLevel.min)
  .max(displayPreferenceLimits.workbenchZoomLevel.max)
  .transform(quantizeWorkbenchZoomLevel);
export const interfaceFontSizeSchema = z.coerce.number().int()
  .min(displayPreferenceLimits.interfaceFontSize.min)
  .max(displayPreferenceLimits.interfaceFontSize.max);
export const contentFontSizeSchema = z.coerce.number().int()
  .min(displayPreferenceLimits.contentFontSize.min)
  .max(displayPreferenceLimits.contentFontSize.max);
export const sidebarWidthSchema = z.coerce.number().int()
  .min(sidebarLayoutLimits.expandedWidthPx.min)
  .max(sidebarLayoutLimits.expandedWidthPx.max);

export type AppearanceMode = z.infer<typeof appearanceModeSchema>;
export type DisplayDensity = z.infer<typeof displayDensitySchema>;
export type DisplayContrast = z.infer<typeof displayContrastSchema>;
export const defaultUserAppearanceMode: AppearanceMode = "dark";
export const defaultUserDisplayPreferences = {
  contentFontSize: 14,
  contrast: "default",
  density: "default",
  interfaceFontSize: 14,
  workbenchZoomLevel: 0,
} as const satisfies UserDisplayPreferences;

export const userDisplayPreferencesSchema = z.object({
  contentFontSize: contentFontSizeSchema,
  contrast: displayContrastSchema,
  density: displayDensitySchema,
  interfaceFontSize: interfaceFontSizeSchema,
  workbenchZoomLevel: workbenchZoomLevelSchema,
});

export const userDisplayPreferencesPatchSchema = userDisplayPreferencesSchema.partial();

export type UserDisplayPreferences = {
  contentFontSize: number;
  contrast: DisplayContrast;
  density: DisplayDensity;
  interfaceFontSize: number;
  workbenchZoomLevel: number;
};

export function normalizeUserDisplayPreferences(input: unknown): UserDisplayPreferences {
  const parsed = userDisplayPreferencesPatchSchema.safeParse(input);
  return {
    ...defaultUserDisplayPreferences,
    ...(parsed.success ? parsed.data : {}),
  };
}

export function normalizeSidebarWidth(input: unknown) {
  const parsed = sidebarWidthSchema.safeParse(input);
  return parsed.success ? parsed.data : sidebarLayoutLimits.expandedWidthPx.default;
}

export function quantizeWorkbenchZoomLevel(value: number) {
  const { max, min, step } = displayPreferenceLimits.workbenchZoomLevel;
  const clamped = Math.max(min, Math.min(max, value));
  return Math.round(clamped / step) * step;
}
