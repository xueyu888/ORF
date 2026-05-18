import type { Objective } from "../../../types/orf";

export function bountyCycleLabel(objectives: readonly Objective[]) {
  const cycles = Array.from(new Set(objectives.map((objective) => objective.cycle.trim()).filter(Boolean))).sort((left, right) => left.localeCompare(right));

  if (cycles.length === 0) {
    return "暂无周期";
  }

  if (cycles.length === 1) {
    return cycles[0]!;
  }

  return `${cycles.at(-1)} 等 ${cycles.length} 个周期`;
}
