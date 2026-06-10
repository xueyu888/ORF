import type { Evidence, Result } from "../../../types/orf";
import { addCalendarDays } from "../../../utils/date";

export type RelativeTime = {
  compactDuration: string;
  overdue: boolean;
  value: string;
};

export function bountyUpdatedAt(result: Result, evidence: Evidence[]) {
  return latestDate([
    result.updatedAt,
    result.trend.at(-1)?.date,
    ...evidence.filter((item) => item.linkedResultId === result.id).map((item) => item.date),
  ]);
}

export function remainingTime(value: string, now: Date) {
  return deadlineRemainingTime(value, now)?.value ?? (value || "未设置");
}

export function deadlineRemainingTime(value: string, now: Date): RelativeTime | null {
  if (!value) return null;

  const target = new Date(`${value}T23:59:00`);
  if (Number.isNaN(target.getTime())) return null;

  return relativeTime(target, now, { active: "剩余", overdue: "已超时" });
}

export function reestimateWindowRemainingTime(value: string | null | undefined, now: Date): RelativeTime | null {
  if (!value) return null;

  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return null;

  return relativeTime(target, now, { active: "重估剩余", overdue: "重估已超时" });
}

export function formatDateTimeMinute(value: string | null | undefined) {
  if (!value) return "未设置";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function relativeTime(target: Date, now: Date, labels: { active: string; overdue: string }): RelativeTime {
  const diffMinutes = Math.ceil((target.getTime() - now.getTime()) / 60000);
  const absMinutes = Math.abs(diffMinutes);
  const overdue = diffMinutes < 0;
  const prefix = overdue ? labels.overdue : labels.active;
  const days = Math.floor(absMinutes / 1440);
  const hours = Math.floor((absMinutes % 1440) / 60);
  const minutes = absMinutes % 60;

  if (days > 0) {
    return {
      compactDuration: hours > 0 ? `${days}天${hours}时` : `${days}天`,
      overdue,
      value: `${prefix} ${days} 天 ${hours} 小时`,
    };
  }

  if (hours > 0) {
    return {
      compactDuration: minutes > 0 ? `${hours}时${minutes}分` : `${hours}时`,
      overdue,
      value: `${prefix} ${hours} 小时 ${minutes} 分钟`,
    };
  }

  return { compactDuration: `${minutes}分`, overdue, value: `${prefix} ${minutes} 分钟` };
}

export function latestDate(values: Array<string | undefined>) {
  return values.filter(Boolean).sort().at(-1) ?? "";
}

export function addDays(value: string, days: number) {
  return addCalendarDays(value, days);
}
