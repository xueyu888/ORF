import type { AppearanceMode } from "../appearanceMode";
import type { VisualMaterialPreferences } from "../../../domain/settings/visualBackgrounds";
import type { BackgroundAnalysis } from "./backgroundAnalyzer";
import type { AdaptiveMaterial, PersistentMaterialRole } from "./materialTokens";

export type MaterialCapabilities = {
  backdropFilter: boolean;
  highContrast: boolean;
};

type MaterialPolicyInput = {
  analysis: BackgroundAnalysis;
  appearance: AppearanceMode;
  capabilities: MaterialCapabilities;
  hasBackground: boolean;
  preferences: VisualMaterialPreferences;
  role: PersistentMaterialRole;
  unfocused?: boolean;
};

const roleParameters: Record<PersistentMaterialRole, { opacity: number; blur: number; shadow: number }> = {
  sidebar: { opacity: 0.5, blur: 22, shadow: 0.22 },
  topbar: { opacity: 0.43, blur: 18, shadow: 0.12 },
  workspace: { opacity: 0.58, blur: 17, shadow: 0.08 },
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function mixChannel(base: number, environment: number, amount: number) {
  return Math.round(base + (environment - base) * amount);
}

function backdropTone(input: MaterialPolicyInput) {
  if (input.preferences.tone === "soft-light") return "soft-light" as const;
  if (input.preferences.tone === "soft-dark") return "soft-dark" as const;
  return input.appearance === "dark" ? "soft-dark" as const : "soft-light" as const;
}

export function deriveAdaptiveMaterial(input: MaterialPolicyInput): AdaptiveMaterial {
  const role = roleParameters[input.role];
  const tone = backdropTone(input);
  const contentTone = tone === "soft-dark" ? "light" as const : "dark" as const;
  const exposure = clamp(input.preferences.exposure, 0, 1);
  const environmentStrength = clamp(
    0.1 + exposure * 0.24 + input.analysis.saturation * 0.08,
    0.1,
    0.42,
  );
  const baseRgb = tone === "soft-dark" ? [17, 22, 28] as const : [246, 249, 248] as const;
  const tintRgb = baseRgb.map((channel, index) => mixChannel(channel, input.analysis.tintRgb[index] ?? channel, environmentStrength));
  const tintColor = `rgb(${tintRgb[0]} ${tintRgb[1]} ${tintRgb[2]})`;
  const mustReduce = input.preferences.reduceTransparency || input.capabilities.highContrast;
  const fallback = !input.hasBackground || !input.capabilities.backdropFilter;
  const transparency = mustReduce ? "reduced" as const : fallback ? "fallback" as const : "adaptive" as const;

  if (transparency !== "adaptive") {
    return {
      backdropTone: tone,
      tintColor,
      tintOpacity: mustReduce ? 0.97 : 0.92,
      blurRadius: 0,
      saturation: 1,
      noiseOpacity: 0,
      borderLightOpacity: tone === "soft-dark" ? 0.1 : 0.42,
      borderDarkOpacity: tone === "soft-dark" ? 0.3 : 0.12,
      shadowOpacity: role.shadow,
      contentTone,
      transparency,
    };
  }

  const extremeShare = input.analysis.darkPixelShare + input.analysis.lightPixelShare;
  const focusStability = input.unfocused ? 0.045 : 0;
  const tintOpacity = clamp(
    role.opacity
      - exposure * (input.role === "workspace" ? 0.21 : 0.24)
      + input.analysis.complexity * 0.14
      + extremeShare * 0.08
      + focusStability
      + (tone === "soft-dark" ? 0.035 : 0),
    input.role === "topbar" ? 0.22 : 0.28,
    input.role === "workspace" ? 0.72 : 0.66,
  );

  return {
    backdropTone: tone,
    tintColor,
    tintOpacity,
    blurRadius: clamp(role.blur + input.analysis.complexity * 9 - exposure * 3, 12, 30),
    saturation: clamp(1.04 + input.analysis.saturation * 0.18, 1.04, 1.2),
    noiseOpacity: clamp(0.008 + input.analysis.complexity * 0.012, 0.008, 0.02),
    borderLightOpacity: tone === "soft-dark" ? 0.14 : 0.48,
    borderDarkOpacity: tone === "soft-dark" ? 0.34 : 0.13,
    shadowOpacity: role.shadow,
    contentTone,
    transparency,
  };
}
