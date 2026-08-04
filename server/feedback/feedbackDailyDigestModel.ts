import type { Impact } from "../../src/types/orf";

export type FeedbackDailyDigestClock = {
  date: string;
  minuteOfDay: number;
};

export type FeedbackDailyDigestItem = {
  id: string;
  impact: Impact;
  phenomenon: string;
  updatedAt: string;
};

export const feedbackDailyDigestTargetId = (teamId: string, assigneeUserId: string, localDate: string) =>
  `feedback-daily-digest:${teamId}:${assigneeUserId}:${localDate}`;

export function localFeedbackDailyDigestClock(now: Date, timeZone: string): FeedbackDailyDigestClock {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    minuteOfDay: Number(value("hour")) * 60 + Number(value("minute")),
  };
}

export function shouldRunFeedbackDailyDigest(input: {
  hour: number;
  minute: number;
  now: Date;
  timeZone: string;
}) {
  const clock = localFeedbackDailyDigestClock(input.now, input.timeZone);
  return {
    due: clock.minuteOfDay >= input.hour * 60 + input.minute,
    localDate: clock.date,
  };
}

function impactRank(impact: Impact) {
  if (impact === "Critical") return 0;
  if (impact === "High") return 1;
  if (impact === "Medium") return 2;
  return 3;
}

function impactLabel(impact: Impact) {
  if (impact === "Critical") return "Critical";
  if (impact === "High") return "High";
  if (impact === "Medium") return "Medium";
  return "Low";
}

export function sortFeedbackDailyDigestItems(items: readonly FeedbackDailyDigestItem[]) {
  return [...items].sort((left, right) => {
    const impactDelta = impactRank(left.impact) - impactRank(right.impact);
    if (impactDelta !== 0) return impactDelta;
    const updatedDelta = left.updatedAt.localeCompare(right.updatedAt);
    if (updatedDelta !== 0) return updatedDelta;
    return left.id.localeCompare(right.id);
  });
}

export function formatFeedbackDailyDigestBody(input: {
  items: readonly FeedbackDailyDigestItem[];
}) {
  const items = sortFeedbackDailyDigestItems(input.items);
  const lines = items.slice(0, 20).map((item, index) => {
    const title = item.phenomenon.replace(/\s+/g, " ").trim() || "未命名反馈";
    return `${index + 1}. [${impactLabel(item.impact)}] [${title}](/feedback/${encodeURIComponent(item.id)})`;
  });
  const remainingCount = Math.max(items.length - lines.length, 0);
  const sections = [`你有 ${items.length} 条待处理反馈。\n${lines.join("\n")}`.trimEnd()];
  if (remainingCount > 0) sections.push(`还有 ${remainingCount} 条未展开。`);
  return sections.filter(Boolean).join("\n\n");
}
