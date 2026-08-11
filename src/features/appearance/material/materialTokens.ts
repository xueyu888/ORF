import type { CSSProperties } from "react";

export const persistentMaterialRoles = ["sidebar", "topbar", "workspace"] as const;
export const surfaceMaterialRoles = ["content", "floating", "modal"] as const;
export const materialRoles = [...persistentMaterialRoles, ...surfaceMaterialRoles] as const;

export type PersistentMaterialRole = (typeof persistentMaterialRoles)[number];
export type SurfaceMaterialRole = (typeof surfaceMaterialRoles)[number];
export type MaterialRole = (typeof materialRoles)[number];
export type MaterialTransparency = "adaptive" | "reduced" | "fallback";

export type AdaptiveMaterial = {
  backdropTone: "soft-light" | "soft-dark";
  tintColor: string;
  tintOpacity: number;
  blurRadius: number;
  saturation: number;
  noiseOpacity: number;
  borderLightOpacity: number;
  borderDarkOpacity: number;
  shadowOpacity: number;
  transparency: MaterialTransparency;
};

function clampUnit(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function materialCssVariables(material: AdaptiveMaterial): CSSProperties {
  return {
    "--orf-material-tint": material.tintColor,
    "--orf-material-tint-opacity": `${(clampUnit(material.tintOpacity) * 100).toFixed(2)}%`,
    "--orf-material-blur": `${Math.max(0, material.blurRadius).toFixed(2)}px`,
    "--orf-material-saturation": Math.max(0, material.saturation).toFixed(3),
    "--orf-material-noise-opacity": clampUnit(material.noiseOpacity).toFixed(3),
    "--orf-material-border-light-opacity": clampUnit(material.borderLightOpacity).toFixed(3),
    "--orf-material-border-dark-opacity": clampUnit(material.borderDarkOpacity).toFixed(3),
    "--orf-material-shadow-opacity": clampUnit(material.shadowOpacity).toFixed(3),
  } as CSSProperties;
}
