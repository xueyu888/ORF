import {
  defaultVisualBackgroundConfig,
  defaultVisualBackgroundCrop,
  defaultVisualMaterialPreferences,
  normalizeVisualBackgroundCrop,
  normalizeVisualBackgroundMigration,
  normalizeVisualMaterialPreferences,
  visualBackgroundCropLimits,
  visualMaterialExposureLimits,
  type VisualBackgroundConfig,
  type VisualBackgroundCrop,
  type VisualBackgroundMigration,
  type VisualMaterialPreferences,
} from "../../src/domain/settings/visualBackgrounds";

const defaultLegacyOverlayOpacity = 0.58;

function recordValue(input: unknown): Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input) ? input as Record<string, unknown> : {};
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function legacyOverlayOpacityToExposure(input: unknown) {
  const overlayOpacity = clampNumber(input, 0, 1, defaultLegacyOverlayOpacity);
  return clampNumber(
    0.9 - overlayOpacity * 0.45,
    visualMaterialExposureLimits.min,
    visualMaterialExposureLimits.max,
    defaultVisualMaterialPreferences.exposure,
  );
}

function migrateCrop(input: unknown): VisualBackgroundCrop {
  const crop = recordValue(input);
  if ("centerX" in crop || "centerY" in crop || "zoom" in crop) {
    return normalizeVisualBackgroundCrop(crop);
  }

  const offsetX = clampNumber(crop.offsetX, -100, 100, 0);
  const offsetY = clampNumber(crop.offsetY, -100, 100, 0);
  const scale = clampNumber(crop.scale, 0.5, visualBackgroundCropLimits.zoomMax, defaultVisualBackgroundCrop.zoom);
  return normalizeVisualBackgroundCrop({
    centerX: 0.5 + offsetX / 200,
    centerY: 0.5 + offsetY / 200,
    zoom: Math.max(visualBackgroundCropLimits.zoomMin, scale),
  });
}

export function normalizeLegacyVisualBackgroundConfig(input: unknown): VisualBackgroundConfig {
  const raw = recordValue(input);
  const fallback = defaultVisualBackgroundConfig();
  const materialInput = recordValue(raw.material) as Partial<VisualMaterialPreferences>;
  const migrationInput = recordValue(raw.migration) as Partial<VisualBackgroundMigration>;
  const legacyOverlayOpacity = raw.version === 4
    ? undefined
    : migrationInput.overlayOpacityV2
      ?? (raw.version === 3 || raw.material ? undefined : raw.overlayOpacity ?? defaultLegacyOverlayOpacity);
  const material = normalizeVisualMaterialPreferences({
    ...materialInput,
    exposure: materialInput.exposure ?? (legacyOverlayOpacity === undefined ? undefined : legacyOverlayOpacityToExposure(legacyOverlayOpacity)),
  });
  const rawCrops = recordValue(raw.crops ?? raw.placements);

  return {
    version: 4,
    fitMode: "cover-crop",
    mode: raw.mode === "switchable" ? "switchable" : "fixed",
    fixedBackgroundId: typeof raw.fixedBackgroundId === "string"
      ? raw.fixedBackgroundId
      : typeof raw.defaultBackgroundId === "string"
        ? raw.defaultBackgroundId
        : null,
    material,
    migration: normalizeVisualBackgroundMigration({
      overlayOpacityV2: legacyOverlayOpacity === undefined
        ? migrationInput.overlayOpacityV2 ?? null
        : clampNumber(legacyOverlayOpacity, 0, 1, defaultLegacyOverlayOpacity),
    }),
    switchTrigger: raw.switchTrigger === "interval" ? "interval" : "on_open",
    switchOrder: raw.switchOrder === "sequential" ? "sequential" : "random",
    switchIntervalMinutes: Math.round(clampNumber(raw.switchIntervalMinutes, 1, 1440, fallback.switchIntervalMinutes)),
    crops: Object.fromEntries(
      Object.entries(rawCrops).map(([backgroundId, crop]) => [backgroundId, migrateCrop(crop)]),
    ),
  };
}
