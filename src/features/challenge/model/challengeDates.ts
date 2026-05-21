import type { Evidence, Feedback, Result } from "../../../types/orf";
import { addCalendarDays } from "../../../utils/date";

export function bountyUpdatedAt(result: Result, feedback: Feedback[], evidence: Evidence[]) {
  return latestDate([
    result.trend.at(-1)?.date,
    ...feedback.filter((item) => item.linkedResultId === result.id).map((item) => item.updatedAt),
    ...evidence.filter((item) => item.linkedResultId === result.id).map((item) => item.date),
  ]);
}

export function remainingTime(value: string, now: Date) {
  if (!value) return "未设置";

  const target = new Date(`${value}T23:59:00`);
  if (Number.isNaN(target.getTime())) return value;

  const diffMinutes = Math.ceil((target.getTime() - now.getTime()) / 60000);
  const absMinutes = Math.abs(diffMinutes);
  const prefix = diffMinutes >= 0 ? "剩余" : "已超时";
  const days = Math.floor(absMinutes / 1440);
  const hours = Math.floor((absMinutes % 1440) / 60);
  const minutes = absMinutes % 60;

  if (days > 0) return `${prefix} ${days} 天 ${hours} 小时`;
  if (hours > 0) return `${prefix} ${hours} 小时 ${minutes} 分钟`;
  return `${prefix} ${minutes} 分钟`;
}

export function latestDate(values: Array<string | undefined>) {
  return values.filter(Boolean).sort().at(-1) ?? "";
}

export function addDays(value: string, days: number) {
  return addCalendarDays(value, days);
}
