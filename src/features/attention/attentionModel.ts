import type {
  AppNotification,
  ChatUnreadSummary,
  NotificationKind,
  WorkLogReminderState,
} from "../../types/orf";
import type { AppAttentionState } from "../interaction/appAttentionState";
import {
  attentionLevelRank,
  emptyAttentionState,
  type AttentionItem,
  type AttentionLevel,
  type AttentionState,
} from "./attentionTypes";

type BuildAttentionStateInput = {
  appAttentionState: AppAttentionState;
  authenticated: boolean;
  chatUnreadSummary: ChatUnreadSummary;
  currentPath: string;
  currentUserId?: string | null;
  notifications: AppNotification[];
  workLogReminderState: WorkLogReminderState | null;
};

type DesktopAttentionToastInput = {
  appAttentionState: AppAttentionState;
  currentPath: string;
  currentUserId?: string | null;
  notification: AppNotification;
};

export type AttentionToastIntent = {
  body: string;
  id: string;
  level: Extract<AttentionLevel, "toast" | "flash" | "urgent">;
  targetPath: string;
  title: string;
};

const MAX_ATTENTION_ITEMS = 8;
const SYSTEM_NOTIFICATION_TARGET_PATH = "/chat/system/personalNotifications";
const WORK_LOG_TARGET_PATH = "/work-logs";

const urgentNotificationKinds = new Set<NotificationKind>([
  "data.sync.conflict",
  "feedback.assigned",
  "objective.alignment.requested",
  "objective.loot.submitted",
  "objective.peerReview.requested",
  "objective.recruitment.created",
  "objective.reinforcement.added",
  "objective.revision.required",
  "worklog.reminder",
]);

const flashNotificationKinds = new Set<NotificationKind>([
  "comment.mention.created",
]);

const toastNotificationKinds = new Set<NotificationKind>([
  "challenge.application.approved",
  "challenge.application.created",
  "challenge.application.rejected",
  "comment.reply.created",
  "comment.thread.status.changed",
  "feedback.commented",
  "feedback.created",
  "feedback.status.changed",
  "objective.alignment.reviewed",
  "objective.challenge.accepted",
]);

const badgeNotificationKinds = new Set<NotificationKind>([
  "objective.published",
  "objective.settled",
  "objective.settlement.updated",
  "worklog.submitted",
]);

export function buildAttentionState(input: BuildAttentionStateInput): AttentionState {
  if (!input.authenticated) return emptyAttentionState;

  const notificationItems = input.notifications
    .filter((notification) => !notification.readAt)
    .filter((notification) => notification.kind !== "worklog.reminder")
    .filter((notification) => notification.actorUserId !== input.currentUserId)
    .map((notification) => attentionItemFromNotification(notification, input))
    .filter((item) => item !== null);
  const workLogItem = attentionItemFromWorkLogReminder(input.workLogReminderState, input);
  const chatItems = attentionItemsFromChatUnread(input.chatUnreadSummary);
  const allItems = [...notificationItems, ...chatItems, ...(workLogItem ? [workLogItem] : [])]
    .sort(compareAttentionItems);
  const items = allItems.slice(0, MAX_ATTENTION_ITEMS);
  const latestItem = items[0] ?? null;
  const count = attentionCount(allItems, input.chatUnreadSummary);
  const level = allItems.reduce<AttentionLevel>(
    (current, item) => maxAttentionLevel(current, item.level),
    count > 0 ? "badge" : "none",
  );
  const urgentCount = allItems.filter((item) => item.level === "urgent").length;
  const flashCount = allItems.filter((item) => item.level === "flash" || item.level === "urgent").length;
  const title = latestItem?.title ?? emptyAttentionState.title;
  const body = latestItem?.body ?? (count > 0 ? `${count} 条未读提醒` : emptyAttentionState.body);
  const reason = latestItem ? attentionReason(latestItem) : null;

  return {
    body,
    count,
    flashCount,
    items,
    latestEventId: latestItem?.eventId ?? null,
    latestTargetPath: latestItem?.targetPath ?? null,
    level,
    reason,
    signature: [
      level,
      count,
      urgentCount,
      flashCount,
      latestItem?.eventId ?? "none",
      latestItem?.targetPath ?? "none",
    ].join(":"),
    title,
    urgentCount,
  };
}

export function attentionToastIntentFromNotification(input: DesktopAttentionToastInput): AttentionToastIntent | null {
  if (input.notification.actorUserId === input.currentUserId) return null;
  if (input.notification.kind === "worklog.reminder") return null;
  const targetPath = normalizeAttentionTargetPath(input.notification.targetHref);
  if (!targetPath) return null;
  if (isCurrentAttentionTarget(targetPath, input.currentPath) && input.appAttentionState.activelyViewed) return null;
  const level = notificationAttentionLevel(input.notification.kind);
  if (level === "badge") return null;
  return {
    body: cleanAttentionText(input.notification.body, "你有一条新的提醒"),
    id: input.notification.id,
    level,
    targetPath,
    title: cleanAttentionText(input.notification.title, "ORF 提醒"),
  };
}

export function attentionToastIntentFromWorkLogReminder(
  reminder: WorkLogReminderState,
  input: Pick<BuildAttentionStateInput, "appAttentionState" | "currentPath">,
): AttentionToastIntent | null {
  if (reminder.status !== "active" || reminder.missingDates.length === 0 || !reminder.shouldRemindNow) return null;
  if (isCurrentAttentionTarget(WORK_LOG_TARGET_PATH, input.currentPath) && input.appAttentionState.activelyViewed) return null;
  return {
    body: `${reminder.missingDates.length} 天工作日志待补交`,
    id: `worklog-reminder-${reminder.id}-${reminder.updatedAt}`,
    level: "urgent",
    targetPath: WORK_LOG_TARGET_PATH,
    title: "工作日志待处理",
  };
}

export function normalizeAttentionTargetPath(targetHref: string | null | undefined) {
  const rawPath = typeof targetHref === "string" ? targetHref.trim() : "";
  if (!rawPath) return null;
  try {
    const url = new URL(rawPath, "https://orf.local");
    if (url.origin !== "https://orf.local") return null;
    const targetPath = `${url.pathname}${url.search}${url.hash}`;
    return isSafeAttentionTargetPath(targetPath) ? targetPath : null;
  } catch {
    return null;
  }
}

export function isSafeAttentionTargetPath(targetPath: string | null | undefined) {
  return typeof targetPath === "string"
    && /^\/(?!\/)[\w\-./~%]*(?:\?[^#\s]*)?(?:#[^\s]*)?$/.test(targetPath)
    && !targetPath.startsWith("/api/")
    && !targetPath.startsWith("/auth");
}

function attentionItemFromNotification(notification: AppNotification, input: BuildAttentionStateInput): AttentionItem | null {
  const targetPath = normalizeAttentionTargetPath(notification.targetHref);
  if (!targetPath) return null;
  return {
    body: cleanAttentionText(notification.body, "你有一条新的提醒"),
    createdAt: notification.createdAt,
    eventId: notification.id,
    kind: notification.kind,
    level: notificationDisplayLevel(notification.kind, targetPath, input),
    source: "notification",
    targetPath,
    title: cleanAttentionText(notification.title, "ORF 提醒"),
  };
}

function attentionItemsFromChatUnread(summary: ChatUnreadSummary): AttentionItem[] {
  if (summary.totalUnreadCount <= 0) return [];
  const createdAt = new Date(0).toISOString();
  if (summary.mentionCount > 0) {
    return [{
      body: `${summary.mentionCount} 条 @ 你的聊天消息`,
      createdAt,
      eventId: "chat-mention-unread",
      kind: "chat.mention",
      level: "flash",
      source: "chat",
      targetPath: "/chat",
      title: "聊天中有人提到你",
    }];
  }
  if (summary.threadUnreadCount > 0) {
    return [{
      body: `${summary.threadUnreadCount} 条线程回复未读`,
      createdAt,
      eventId: "chat-thread-unread",
      kind: "chat.thread",
      level: "toast",
      source: "chat",
      targetPath: "/chat",
      title: "聊天线程有新回复",
    }];
  }
  return [{
    body: `${summary.totalUnreadCount} 条聊天消息未读`,
    createdAt,
    eventId: "chat-message-unread",
    kind: "chat.unread",
    level: "badge",
    source: "chat",
    targetPath: "/chat",
    title: "聊天消息未读",
  }];
}

function attentionItemFromWorkLogReminder(
  reminder: WorkLogReminderState | null,
  input: BuildAttentionStateInput,
): AttentionItem | null {
  if (!reminder || reminder.status !== "active" || reminder.missingDates.length === 0) return null;
  return {
    body: `${reminder.missingDates.length} 天工作日志待补交`,
    createdAt: reminder.updatedAt,
    eventId: `worklog-reminder-${reminder.id}`,
    kind: "worklog.reminder",
    level: applyViewedTargetDowngrade("urgent", WORK_LOG_TARGET_PATH, input),
    source: "worklog",
    targetPath: WORK_LOG_TARGET_PATH,
    title: "工作日志待处理",
  };
}

function notificationDisplayLevel(kind: NotificationKind, targetPath: string, input: BuildAttentionStateInput): Exclude<AttentionLevel, "none"> {
  return applyViewedTargetDowngrade(notificationAttentionLevel(kind), targetPath, input);
}

function notificationAttentionLevel(kind: NotificationKind): Exclude<AttentionLevel, "none"> {
  if (urgentNotificationKinds.has(kind)) return "urgent";
  if (flashNotificationKinds.has(kind)) return "flash";
  if (toastNotificationKinds.has(kind)) return "toast";
  if (badgeNotificationKinds.has(kind)) return "badge";
  return "toast";
}

function applyViewedTargetDowngrade(
  level: Exclude<AttentionLevel, "none">,
  targetPath: string,
  input: BuildAttentionStateInput,
): Exclude<AttentionLevel, "none"> {
  if (!input.appAttentionState.activelyViewed || !isCurrentAttentionTarget(targetPath, input.currentPath)) return level;
  return "badge";
}

function isCurrentAttentionTarget(targetPath: string, currentPath: string) {
  const normalizedTargetPath = normalizeComparablePath(targetPath);
  const normalizedCurrentPath = normalizeComparablePath(currentPath);
  if (!normalizedTargetPath || !normalizedCurrentPath) return false;
  if (targetPath.includes("#") && currentPath.includes("#")) {
    return normalizedTargetPath === normalizedCurrentPath;
  }
  if (normalizedTargetPath === "/chat") return normalizedCurrentPath.startsWith("/chat");
  if (normalizedTargetPath === "/work-logs") return normalizedCurrentPath === "/work-logs";
  if (normalizedCurrentPath === normalizedTargetPath) return true;
  return normalizedTargetPath !== "/" && normalizedCurrentPath.startsWith(`${normalizedTargetPath}/`);
}

function normalizeComparablePath(path: string) {
  const normalized = normalizeAttentionTargetPath(path);
  if (!normalized) return null;
  if (normalized.includes("#")) return normalized;
  return normalized.split("?")[0] ?? null;
}

function attentionCount(items: AttentionItem[], summary: ChatUnreadSummary) {
  const nonChatItemCount = items.filter((item) => item.source !== "chat").length;
  return Math.max(summary.totalUnreadCount, nonChatItemCount);
}

function compareAttentionItems(left: AttentionItem, right: AttentionItem) {
  const levelDelta = attentionLevelRank[right.level] - attentionLevelRank[left.level];
  if (levelDelta !== 0) return levelDelta;
  return Date.parse(right.createdAt) - Date.parse(left.createdAt);
}

function maxAttentionLevel(left: AttentionLevel, right: AttentionLevel): AttentionLevel {
  return attentionLevelRank[right] > attentionLevelRank[left] ? right : left;
}

function attentionReason(item: AttentionItem) {
  return `${item.source}:${item.kind ?? "unknown"}`;
}

function cleanAttentionText(value: string | null | undefined, fallback: string) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
}
