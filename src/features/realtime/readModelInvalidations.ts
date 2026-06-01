import type { OrfReadModel, OrfReadModelInvalidation } from "../../types/realtime";

export function readModelInvalidationKey(invalidations: OrfReadModelInvalidation[], model: OrfReadModel) {
  return invalidations
    .filter((invalidation) => invalidation.models.includes(model))
    .map((invalidation) => {
      const target = invalidation.target ? `${invalidation.target.type}:${invalidation.target.id}` : "all";
      return `${invalidation.id}:${invalidation.reason}:${target}:${invalidation.createdAt}`;
    })
    .join("|");
}
