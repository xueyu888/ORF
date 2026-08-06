import type { NotificationKind } from "../../types/orf";

export type AttentionLevel = "none" | "badge" | "toast" | "flash" | "urgent";

export type AttentionSource = "chat" | "notification" | "worklog";

export type AttentionItem = {
  body: string;
  createdAt: string;
  eventId: string;
  kind?: NotificationKind | "chat.ack" | "chat.direct" | "chat.mention" | "chat.thread" | "chat.unread" | "worklog.reminder";
  level: Exclude<AttentionLevel, "none">;
  source: AttentionSource;
  targetPath: string;
  title: string;
};

export type AttentionState = {
  badgeCount: number;
  body: string;
  count: number;
  flashCount: number;
  items: AttentionItem[];
  latestEventId: string | null;
  latestTargetPath: string | null;
  level: AttentionLevel;
  reason: string | null;
  signature: string;
  title: string;
  urgentCount: number;
};

export const emptyAttentionState: AttentionState = {
  badgeCount: 0,
  body: "当前没有待处理提醒",
  count: 0,
  flashCount: 0,
  items: [],
  latestEventId: null,
  latestTargetPath: null,
  level: "none",
  reason: null,
  signature: "none:0",
  title: "待我处理",
  urgentCount: 0,
};

export const attentionLevelRank: Record<AttentionLevel, number> = {
  none: 0,
  badge: 1,
  toast: 2,
  flash: 3,
  urgent: 4,
};
