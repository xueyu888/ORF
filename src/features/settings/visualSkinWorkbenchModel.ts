import type { OrfReadModelInvalidation } from "../../types/realtime";

export type VisualSkinScope = "personal" | "system";

function isVisualSkinSettingTarget(
  invalidation: OrfReadModelInvalidation,
  scope: VisualSkinScope,
  userId: string | null | undefined,
) {
  if (!invalidation.target) return true;
  if (invalidation.target.type !== "setting") return false;

  const targetId = invalidation.target.id;
  if (targetId.startsWith("visual:")) return true;
  if (scope === "system") return false;
  if (targetId.startsWith("community:")) return true;
  return Boolean(userId && targetId === `personal:${userId}`);
}

export function visualSkinSettingInvalidations(
  invalidations: readonly OrfReadModelInvalidation[],
  scope: VisualSkinScope,
  userId: string | null | undefined,
) {
  return invalidations.filter((invalidation) => (
    invalidation.reason === "setting.changed" &&
    invalidation.models.includes("settings") &&
    isVisualSkinSettingTarget(invalidation, scope, userId)
  ));
}

export function visualSkinInvalidationKey(invalidations: readonly OrfReadModelInvalidation[]) {
  return invalidations.map((invalidation) => invalidation.id).join("|");
}
