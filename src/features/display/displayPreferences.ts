import {
  displayPreferenceLimits,
  quantizeWorkbenchZoomLevel,
  type UserDisplayPreferences,
} from "../../domain/settings/personalPreferences";

const textSmRemRatio = 0.875;
const defaultRootFontSizePx = 16;
const minRootFontSizePx = 13;
const maxRootFontSizePx = 32;
const displayCssVariableNames = [
  "--orf-card-padding",
  "--orf-content-font-size",
  "--orf-control-density-scale",
  "--orf-density-scale",
  "--orf-interface-font-size",
  "--orf-mobile-bottom-nav-height",
  "--orf-root-font-size",
  "--orf-row-height",
  "--orf-row-density-scale",
  "--orf-sidebar-header-height",
  "--orf-tree-indent",
  "--orf-workbench-zoom-scale",
] as const;

export function workbenchZoomScale(level: number) {
  return Math.pow(1.2, level);
}

export function nextWorkbenchZoomLevel(currentLevel: number, direction: "in" | "out" | "reset") {
  if (direction === "reset") return 0;
  const delta = direction === "in" ? displayPreferenceLimits.workbenchZoomLevel.shortcutStep : -displayPreferenceLimits.workbenchZoomLevel.shortcutStep;
  return quantizeWorkbenchZoomLevel(currentLevel + delta);
}

export function densityScale(density: UserDisplayPreferences["density"]) {
  switch (density) {
    case "compact":
      return { control: 0.94, generic: 0.92, row: 0.92 };
    case "comfortable":
      return { control: 1.12, generic: 1.1, row: 1.14 };
    case "default":
    default:
      return { control: 1, generic: 1, row: 1 };
  }
}

export function displayRootFontSizePx(preferences: UserDisplayPreferences, includeWorkbenchZoom: boolean) {
  const zoomScale = includeWorkbenchZoom ? workbenchZoomScale(preferences.workbenchZoomLevel) : 1;
  const baseRoot = preferences.interfaceFontSize / textSmRemRatio;
  return clampNumber(baseRoot * zoomScale, minRootFontSizePx, maxRootFontSizePx);
}

export function displayPreferenceCssVariables(preferences: UserDisplayPreferences, includeWorkbenchZoom: boolean) {
  const rootFontSize = displayRootFontSizePx(preferences, includeWorkbenchZoom);
  const scales = densityScale(preferences.density);
  return {
    "--orf-card-padding": `${(16 * scales.generic).toFixed(2)}px`,
    "--orf-content-font-size": `${preferences.contentFontSize}px`,
    "--orf-control-density-scale": String(scales.control),
    "--orf-density-scale": String(scales.generic),
    "--orf-interface-font-size": `${preferences.interfaceFontSize}px`,
    "--orf-mobile-bottom-nav-height": `calc(${(66 * scales.control).toFixed(2)}px + env(safe-area-inset-bottom))`,
    "--orf-root-font-size": `${rootFontSize.toFixed(3)}px`,
    "--orf-row-height": `${(48 * scales.row).toFixed(2)}px`,
    "--orf-row-density-scale": String(scales.row),
    "--orf-sidebar-header-height": `${(100 * scales.control).toFixed(2)}px`,
    "--orf-tree-indent": `${(28 * scales.generic).toFixed(2)}px`,
    "--orf-workbench-zoom-scale": String(workbenchZoomScale(preferences.workbenchZoomLevel)),
  } satisfies Record<(typeof displayCssVariableNames)[number], string>;
}

export function applyDisplayPreferencesToDocument(
  preferences: UserDisplayPreferences,
  options: { includeWorkbenchZoom: boolean },
) {
  if (typeof document === "undefined") {
    return () => undefined;
  }

  const root = document.documentElement;
  const previousFontSize = root.style.fontSize;
  const previousDensity = root.getAttribute("data-orf-display-density");
  const previousContrast = root.getAttribute("data-orf-display-contrast");
  const previousReady = root.getAttribute("data-orf-display-ready");
  const previousVariables = new Map<string, string>();
  for (const name of displayCssVariableNames) {
    previousVariables.set(name, root.style.getPropertyValue(name));
  }

  const variables = displayPreferenceCssVariables(preferences, options.includeWorkbenchZoom);
  root.style.fontSize = variables["--orf-root-font-size"];
  for (const [name, value] of Object.entries(variables)) {
    root.style.setProperty(name, value);
  }
  root.setAttribute("data-orf-display-density", preferences.density);
  root.setAttribute("data-orf-display-contrast", preferences.contrast);
  root.setAttribute("data-orf-display-ready", "true");

  return () => {
    root.style.fontSize = previousFontSize;
    for (const [name, value] of previousVariables) {
      if (value) {
        root.style.setProperty(name, value);
      } else {
        root.style.removeProperty(name);
      }
    }
    restoreAttribute(root, "data-orf-display-density", previousDensity);
    restoreAttribute(root, "data-orf-display-contrast", previousContrast);
    restoreAttribute(root, "data-orf-display-ready", previousReady);
  };
}

function restoreAttribute(element: HTMLElement, name: string, value: string | null) {
  if (value === null) {
    element.removeAttribute(name);
  } else {
    element.setAttribute(name, value);
  }
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return defaultRootFontSizePx;
  return Math.max(min, Math.min(max, value));
}
