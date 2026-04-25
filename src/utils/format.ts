import type { MetricDirection, Result } from "../types/orf";

export const percent = (value: number) => `${Math.round(value)}%`;

export function resultProgress(result: Result): number {
  const span = result.target - result.baseline;
  if (span === 0) {
    return 100;
  }

  const raw =
    result.direction === "increase"
      ? ((result.current - result.baseline) / span) * 100
      : ((result.baseline - result.current) / (result.baseline - result.target)) * 100;

  return Math.max(0, Math.min(100, Math.round(raw)));
}

export function metricValue(value: number, unit: string, direction?: MetricDirection): string {
  if (unit === "$") {
    return `$${value.toFixed(3)}`;
  }

  if (unit === "s") {
    return `${value.toFixed(1)}s`;
  }

  if (unit === "%" && direction === "decrease" && value < 10) {
    return `${value.toFixed(1)}%`;
  }

  return `${value}${unit}`;
}

export function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function byId<T extends { id: string }>(items: T[], id: string | undefined): T | undefined {
  return items.find((item) => item.id === id);
}
