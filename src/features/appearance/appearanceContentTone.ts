import type { AppearanceMode } from "./appearanceMode";

export type AppearanceContentTone = "light" | "dark";

export function contentToneForAppearance(appearance: AppearanceMode): AppearanceContentTone {
  return appearance === "dark" ? "light" : "dark";
}
