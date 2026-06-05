import { emptyBusinessState, normalizeState } from "./OrfFlowStore";

export { normalizeState };

export function loadEmptyOrfStateSnapshot() {
  return normalizeState(emptyBusinessState());
}
