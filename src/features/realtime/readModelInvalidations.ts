import type { OrfReadModel, OrfReadModelInvalidation, OrfReadModelInvalidationReason } from "../../types/realtime";

type ReadModelInvalidationKeyOptions = {
  excludeReasons?: OrfReadModelInvalidationReason[];
  includeReasons?: OrfReadModelInvalidationReason[];
};

export function readModelInvalidationKey(
  invalidations: OrfReadModelInvalidation[],
  model: OrfReadModel,
  options: ReadModelInvalidationKeyOptions = {},
) {
  const excludeReasons = new Set(options.excludeReasons ?? []);
  const includeReasons = options.includeReasons ? new Set(options.includeReasons) : null;
  return invalidations
    .filter((invalidation) =>
      invalidation.models.includes(model) &&
      !excludeReasons.has(invalidation.reason) &&
      (!includeReasons || includeReasons.has(invalidation.reason))
    )
    .map((invalidation) => {
      const target = invalidation.target ? `${invalidation.target.type}:${invalidation.target.id}` : "all";
      return `${invalidation.id}:${invalidation.reason}:${target}:${invalidation.createdAt}`;
    })
    .join("|");
}
