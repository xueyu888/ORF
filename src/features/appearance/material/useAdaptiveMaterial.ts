import { useEffect, useMemo, useState } from "react";
import type { AppearanceMode } from "../appearanceMode";
import type { VisualBackgroundCrop, VisualMaterialPreferences } from "../../../domain/settings/visualBackgrounds";
import { analyzeBackground, neutralBackgroundAnalysis } from "./backgroundAnalyzer";
import { deriveAdaptiveMaterial } from "./materialPolicy";
import type { MaterialViewportSize } from "./backgroundViewport";
import type { PersistentMaterialRole } from "./materialTokens";

type UseAdaptiveMaterialInput = {
  appearance: AppearanceMode;
  crop: VisualBackgroundCrop;
  highContrast: boolean;
  imageUrl: string | null;
  preferences: VisualMaterialPreferences;
  role: PersistentMaterialRole;
  unfocused?: boolean;
  viewport: MaterialViewportSize;
};

function supportsBackdropFilter() {
  if (typeof CSS === "undefined") return false;
  return CSS.supports("backdrop-filter", "blur(1px)") || CSS.supports("-webkit-backdrop-filter", "blur(1px)");
}

export function useAdaptiveMaterial(input: UseAdaptiveMaterialInput) {
  const [analysis, setAnalysis] = useState(neutralBackgroundAnalysis);
  const viewportWidth = Math.max(1, Math.round(input.viewport.width));
  const viewportHeight = Math.max(1, Math.round(input.viewport.height));

  useEffect(() => {
    let cancelled = false;
    if (!input.imageUrl) {
      setAnalysis(neutralBackgroundAnalysis);
      return undefined;
    }
    void analyzeBackground({
      imageUrl: input.imageUrl,
      crop: input.crop,
      viewport: { width: viewportWidth, height: viewportHeight },
    }).then((nextAnalysis) => {
      if (!cancelled) setAnalysis(nextAnalysis);
    });
    return () => {
      cancelled = true;
    };
  }, [input.crop.centerX, input.crop.centerY, input.crop.zoom, input.imageUrl, viewportHeight, viewportWidth]);

  return useMemo(() => deriveAdaptiveMaterial({
    analysis,
    appearance: input.appearance,
    capabilities: {
      backdropFilter: supportsBackdropFilter(),
      highContrast: input.highContrast,
    },
    hasBackground: Boolean(input.imageUrl),
    preferences: input.preferences,
    role: input.role,
    unfocused: input.unfocused,
  }), [analysis, input.appearance, input.highContrast, input.imageUrl, input.preferences, input.role, input.unfocused]);
}
