import type { OperatorRegistry } from "../_framework/types";

export function mergeOperatorRegistries<
  TContext,
  TData extends Record<string, unknown> = Record<string, unknown>,
>(...registries: OperatorRegistry<TContext, TData>[]): OperatorRegistry<TContext, TData> {
  const merged: OperatorRegistry<TContext, TData> = {};

  for (const registry of registries) {
    for (const [object, operators] of Object.entries(registry)) {
      merged[object] = {
        ...(merged[object] ?? {}),
        ...operators,
      };
    }
  }

  return merged;
}
