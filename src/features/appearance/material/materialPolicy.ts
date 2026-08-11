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

type RoleMaterialParameters = {
  opacity: number;
  opacityMin: number;
  opacityMax: number;
  opacityExposureResponse: number;
  opacityComplexityResponse: number;
  opacityExtremeResponse: number;
  blur: number;
  blurMin: number;
  blurMax: number;
  blurComplexityResponse: number;
  blurExposureResponse: number;
  unfocusedOffset: number;
  darkToneOffset: number;
  shadow: number;
};

const roleParameters: Record<PersistentMaterialRole, RoleMaterialParameters> = {
  sidebar: {
    opacity: 0.26,
    opacityMin: 0.12,
    opacityMax: 0.34,
    opacityExposureResponse: 0.2,
    opacityComplexityResponse: 0.06,
    opacityExtremeResponse: 0.035,
    blur: 0,
    blurMin: 0,
    blurMax: 0,
    blurComplexityResponse: 0,
    blurExposureResponse: 0,
    unfocusedOffset: 0.02,
    darkToneOffset: 0.02,
    shadow: 0.12,
  },
  topbar: {
    opacity: 0.35,
    opacityMin: 0.18,
    opacityMax: 0.56,
    opacityExposureResponse: 0.24,
    opacityComplexityResponse: 0.14,
    opacityExtremeResponse: 0.08,
    blur: 18,
    blurMin: 12,
    blurMax: 30,
    blurComplexityResponse: 9,
    blurExposureResponse: 3,
    unfocusedOffset: 0.045,
    darkToneOffset: 0.035,
    shadow: 0.1,
  },
  workspace: {
    opacity: 0.41,
    opacityMin: 0.22,
    opacityMax: 0.58,
    opacityExposureResponse: 0.21,
    opacityComplexityResponse: 0.14,
    opacityExtremeResponse: 0.08,
    blur: 17,
    blurMin: 12,
    blurMax: 30,
    blurComplexityResponse: 9,
    blurExposureResponse: 3,
    unfocusedOffset: 0.045,
    darkToneOffset: 0.035,
    shadow: 0.07,
  },
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
  const { darkPixelShare, lightPixelShare, luminanceP50 } = input.analysis;
  if (luminanceP50 < 0.46 || darkPixelShare > lightPixelShare + 0.18) return "soft-dark" as const;
  if (luminanceP50 > 0.56 || lightPixelShare > darkPixelShare + 0.18) return "soft-light" as const;
  return input.appearance === "dark" ? "soft-dark" as const : "soft-light" as const;
}

export function deriveAdaptiveMaterial(input: MaterialPolicyInput): AdaptiveMaterial {
  const role = roleParameters[input.role];
  const tone = backdropTone(input);
  const exposure = clamp(input.preferences.exposure, 0, 1);
  const overlayStrength = clamp(input.preferences.overlayStrength, 0, 1);
  const blurStrength = clamp(input.preferences.blurStrength, 0, 1);
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
      tintOpacity: mustReduce ? 0.97 : 0.92 * overlayStrength,
      blurRadius: 0,
      saturation: 1,
      noiseOpacity: 0,
      borderLightOpacity: (tone === "soft-dark" ? 0.1 : 0.42) * (mustReduce ? 1 : overlayStrength),
      borderDarkOpacity: (tone === "soft-dark" ? 0.3 : 0.12) * (mustReduce ? 1 : overlayStrength),
      shadowOpacity: role.shadow,
      transparency,
    };
  }

  const extremeShare = input.analysis.darkPixelShare + input.analysis.lightPixelShare;
  const adaptiveTintOpacity = clamp(
    role.opacity
      - exposure * role.opacityExposureResponse
      + input.analysis.complexity * role.opacityComplexityResponse
      + extremeShare * role.opacityExtremeResponse
      + (input.unfocused ? role.unfocusedOffset : 0)
      + (tone === "soft-dark" ? role.darkToneOffset : 0),
    role.opacityMin,
    role.opacityMax,
  );
  const tintOpacity = adaptiveTintOpacity * overlayStrength;
  const adaptiveBlurRadius = clamp(
    role.blur
      + input.analysis.complexity * role.blurComplexityResponse
      - exposure * role.blurExposureResponse,
    role.blurMin,
    role.blurMax,
  );

  return {
    backdropTone: tone,
    tintColor,
    tintOpacity,
    blurRadius: adaptiveBlurRadius * blurStrength,
    saturation: clamp(1.04 + input.analysis.saturation * 0.18, 1.04, 1.2),
    noiseOpacity: clamp(0.008 + input.analysis.complexity * 0.012, 0.008, 0.02) * overlayStrength,
    borderLightOpacity: (tone === "soft-dark" ? 0.14 : 0.48) * overlayStrength,
    borderDarkOpacity: (tone === "soft-dark" ? 0.34 : 0.13) * overlayStrength,
    shadowOpacity: role.shadow,
    transparency,
  };
}
