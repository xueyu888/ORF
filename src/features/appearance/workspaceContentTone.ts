import type { MaterialContentTone } from "./material/materialTokens";
import type { AppearanceMode } from "./appearanceMode";

export type WorkspaceContentTonePolicy = "adaptive" | "appearance";

export function resolveWorkspaceContentTone(input: {
  analyzedTone: MaterialContentTone;
  appearance: AppearanceMode;
  policy: WorkspaceContentTonePolicy;
}): MaterialContentTone {
  if (input.policy === "adaptive") {
    return input.analyzedTone;
  }

  return input.appearance === "dark" ? "light" : "dark";
}
