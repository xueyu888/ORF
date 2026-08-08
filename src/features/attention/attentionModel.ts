import type {
  AppNotification,
  ChatUnreadSummary,
  WorkLogReminderState,
} from "../../types/orf";
import type { AppAttentionState } from "../interaction/appAttentionState";
import type { ChatRealtimeAttentionIntent } from "../chat/chatNativeNotificationModel";
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
  chatRealtimeAttentionIntents?: ChatRealtimeAttentionIntent[];
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
  sender?: {
    avatarUrl?: string | null;
    name: string;
    userId?: string | null;
  };
  level: Extract<AttentionLevel, "toast" | "flash" | "urgent">;
  targetPath: string;
  title: string;
};

const MAX_ATTENTION_ITEMS = 8;
const SYSTEM_NOTIFICATION_TARGET_PATH = "/chat/system/personalNotifications";
const WORK_LOG_TARGET_PATH = "/work-logs";

const urgentNotificationKinds = new Set<string>([
  "data.sync.conflict",
  "objective.alignment.requested",
  "objective.loot.submitted",
  "objective.peerReview.requested",
  "objective.recruitment.created",
  "objective.reinforcement.added",
  "objective.revision.required",
  "worklog.reminder",
]);

const flashNotificationKinds = new Set<string>([
  "comment.mention.created",
]);

const toastNotificationKinds = new Set<string>([
  "challenge.application.approved",
  "challenge.application.created",
  "challenge.application.rejected",
  "comment.reply.created",
  "comment.thread.status.changed",
  "objective.alignment.reviewed",
  "objective.challenge.accepted",
]);

const badgeNotificationKinds = new Set<string>([
  "objective.published",
  "objective.settled",
  "objective.settlement.updated",
  "worklog.submitted",
]);

export function buildAttentionState(input: BuildAttentionStateInput): AttentionState {
  if (!input.authenticated) return emptyAttentionState;

  const notificationCandidates = input.notifications
    .filter((notification) => !notification.readAt)
    .filter((notification) => notification.kind !== "worklog.reminder")
    .filter((notification) => notification.actorUserId !== input.currentUserId)
    .map((notification) => attentionItemFromNotification(notification, input))
    .filter((item) => item !== null);
  const notificationItems = notificationCandidates.filter((item) => item.level !== "badge");
  const notificationBadgeOnlyCount = notificationCandidates.length - notificationItems.length;
  const workLogItem = attentionItemFromWorkLogReminder(input.workLogReminderState, input);
  const realtimeChatItems = attentionItemsFromRealtimeChat(input.chatRealtimeAttentionIntents ?? []);
  const durableChatItems = attentionItemsFromActionableChatUnread(input.chatUnreadSummary);
  const realtimeChatKinds = new Set(realtimeChatItems.map((item) => item.kind));
  const chatItems = [
    ...realtimeChatItems,
    ...durableChatItems.filter((item) => !realtimeChatKinds.has(item.kind)),
  ];
  const allItems = [...notificationItems, ...chatItems, ...(workLogItem ? [workLogItem] : [])]
    .sort(compareAttentionItems);
  const items = allItems.slice(0, MAX_ATTENTION_ITEMS);
  const latestItem = items[0] ?? null;
  const count = attentionCount(allItems, input.chatUnreadSummary, realtimeChatItems.length);
  const badgeCount = attentionBadgeCount(count + notificationBadgeOnlyCount, input.chatUnreadSummary);
  const level = allItems.reduce<AttentionLevel>(
    (current, item) => maxAttentionLevel(current, item.level),
    badgeCount > 0 ? "badge" : "none",
  );
  const urgentCount = allItems.filter((item) => item.level === "urgent").length;
  const flashCount = allItems.filter((item) => item.level === "flash" || item.level === "urgent").length;
  const fallbackChatUnread = chatUnreadSummaryText(input.chatUnreadSummary);
  const fallbackChatTargetPath = input.chatUnreadSummary.nextTarget?.targetPath ?? "/chat";
  const fallbackBadgeNotification = notificationBadgeOnlyText(notificationBadgeOnlyCount);
  const fallbackBadgeText = fallbackChatUnread ?? fallbackBadgeNotification;
  const title = latestItem?.title ?? (fallbackChatUnread ? "聊天消息未读" : fallbackBadgeNotification ? "系统通知未读" : emptyAttentionState.title);
  const body = latestItem?.body ?? fallbackBadgeText ?? emptyAttentionState.body;
  const reason = latestItem ? attentionReason(latestItem) : fallbackChatUnread ? "chat.unread" : fallbackBadgeNotification ? "notification.unread" : null;

  return {
    badgeCount,
    body,
    count,
    flashCount,
    items,
    latestEventId: latestItem?.eventId ?? (fallbackChatUnread ? "chat-unread" : fallbackBadgeNotification ? "notification-unread" : null),
    latestTargetPath: latestItem?.targetPath ?? (fallbackChatUnread ? fallbackChatTargetPath : fallbackBadgeNotification ? SYSTEM_NOTIFICATION_TARGET_PATH : null),
    level,
    reason,
    signature: [
      level,
      count,
      badgeCount,
      urgentCount,
      flashCount,
      latestItem?.eventId ?? (fallbackChatUnread ? "chat-unread" : fallbackBadgeNotification ? "notification-unread" : "none"),
      latestItem?.targetPath ?? (fallbackChatUnread ? fallbackChatTargetPath : fallbackBadgeNotification ? SYSTEM_NOTIFICATION_TARGET_PATH : "none"),
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
  const level = notificationAttentionLevel(input.notification);
  if (level === "badge") return null;
  return {
    body: cleanAttentionText(input.notification.body, "你有一条新的提醒"),
    id: input.notification.id,
    sender: input.notification.actorUserId
      ? {
          avatarUrl: input.notification.actorAvatarUrl ?? null,
          name: cleanAttentionText(input.notification.actorName, "ORF"),
          userId: input.notification.actorUserId,
        }
      : undefined,
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
  const targetPath = workLogReminderTargetPath(reminder);
  if (isCurrentAttentionTarget(targetPath, input.currentPath) && input.appAttentionState.activelyViewed) return null;
  return {
    body: `${reminder.missingDates.length} 天工作日志待补交`,
    id: `worklog-reminder-${reminder.id}-${reminder.updatedAt}`,
    level: "urgent",
    targetPath,
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
    level: notificationDisplayLevel(notification, targetPath, input),
    source: "notification",
    targetPath,
    title: cleanAttentionText(notification.title, "ORF 提醒"),
  };
}

function attentionItemsFromActionableChatUnread(summary: ChatUnreadSummary): AttentionItem[] {
  if (chatActionableUnreadCount(summary) <= 0) return [];
  const createdAt = new Date(0).toISOString();
  const targetPath = summary.nextTarget?.targetPath ?? "/chat";
  const targetReason = summary.nextTarget?.reason;
  if (targetReason === "ack_required" || (!targetReason && summary.ackRequiredCount > 0)) {
    return [{
      body: `${summary.ackRequiredCount} 条聊天回执待回应`,
      createdAt,
      eventId: "chat-ack-required",
      kind: "chat.ack",
      level: "flash",
      source: "chat",
      targetPath,
      title: "聊天回执待处理",
    }];
  }
  if (targetReason === "mention_me" || targetReason === "mention_all" || (!targetReason && summary.mentionCount > 0)) {
    return [{
      body: `${summary.mentionCount} 条 @ 你的聊天消息`,
      createdAt,
      eventId: "chat-mention-unread",
      kind: "chat.mention",
      level: "flash",
      source: "chat",
      targetPath,
      title: "聊天中有人提到你",
    }];
  }
  if (targetReason === "direct" || (!targetReason && summary.directMessageUnreadCount > 0)) {
    return [{
      body: `${summary.directMessageUnreadCount} 条私聊消息未读`,
      createdAt,
      eventId: "chat-direct-unread",
      kind: "chat.direct",
      level: "flash",
      source: "chat",
      targetPath,
      title: "私聊消息未读",
    }];
  }
  if (summary.nextTarget?.threadRootMessageId || (!targetReason && summary.threadUnreadCount > 0)) {
    return [{
      body: `${summary.threadUnreadCount} 条线程回复未读`,
      createdAt,
      eventId: "chat-thread-unread",
      kind: "chat.thread",
      level: "toast",
      source: "chat",
      targetPath,
      title: "聊天线程有新回复",
    }];
  }
  return [{
    body: chatUnreadSummaryText(summary) ?? "聊天有新的未读消息",
    createdAt,
    eventId: "chat-actionable-unread",
    kind: "chat.unread",
    level: "toast",
    source: "chat",
    targetPath,
    title: "聊天消息未读",
  }];
}

function attentionItemsFromRealtimeChat(intents: ChatRealtimeAttentionIntent[]): AttentionItem[] {
  return intents.map((intent) => ({
    body: intent.body,
    createdAt: intent.createdAt,
    eventId: intent.eventId,
    kind: intent.kind,
    level: "flash" as const,
    source: "chat" as const,
    targetPath: intent.targetPath,
    title: intent.title,
  }));
}

function attentionItemFromWorkLogReminder(
  reminder: WorkLogReminderState | null,
  input: BuildAttentionStateInput,
): AttentionItem | null {
  if (!reminder || reminder.status !== "active" || reminder.missingDates.length === 0) return null;
  const targetPath = workLogReminderTargetPath(reminder);
  return {
    body: `${reminder.missingDates.length} 天工作日志待补交`,
    createdAt: reminder.updatedAt,
    eventId: `worklog-reminder-${reminder.id}`,
    kind: "worklog.reminder",
    level: applyViewedTargetDowngrade("urgent", targetPath, input),
    source: "worklog",
    targetPath,
    title: "工作日志待处理",
  };
}

function workLogReminderTargetPath(reminder: WorkLogReminderState) {
  const firstMissingDate = reminder.missingDates[0]?.trim();
  return firstMissingDate ? `${WORK_LOG_TARGET_PATH}?date=${encodeURIComponent(firstMissingDate)}&view=today` : WORK_LOG_TARGET_PATH;
}

function notificationDisplayLevel(notification: AppNotification, targetPath: string, input: BuildAttentionStateInput): Exclude<AttentionLevel, "none"> {
  return applyViewedTargetDowngrade(notificationAttentionLevel(notification), targetPath, input);
}

function notificationAttentionLevel(notification: AppNotification): Exclude<AttentionLevel, "none"> {
  const kind = notification.kind;
  if (urgentNotificationKinds.has(kind)) return "urgent";
  if (flashNotificationKinds.has(kind)) return "flash";
  if (toastNotificationKinds.has(kind)) return "toast";
  if (badgeNotificationKinds.has(kind)) return "badge";
  return notification.attentionLevel === "action_required" ? "urgent" : "toast";
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

function attentionCount(items: AttentionItem[], summary: ChatUnreadSummary, realtimeChatCount: number) {
  const nonChatItemCount = items.filter((item) => item.source !== "chat").length;
  return Math.max(chatActionableUnreadCount(summary), realtimeChatCount) + nonChatItemCount;
}

function attentionBadgeCount(unreadAttentionCount: number, summary: ChatUnreadSummary) {
  return Math.max(summary.totalUnreadCount, unreadAttentionCount);
}

function chatActionableUnreadCount(summary: ChatUnreadSummary) {
  return nonNegativeCount(summary.ackRequiredCount) + chatActionableMessageUnreadCount(summary) + Math.max(
    nonNegativeCount(summary.threadMentionCount),
    nonNegativeCount(summary.threadUnreadCount),
  );
}

function chatActionableMessageUnreadCount(summary: ChatUnreadSummary) {
  return Math.max(
    0,
    nonNegativeCount(summary.actionableMessageUnreadCount),
    nonNegativeCount(summary.directMessageUnreadCount),
    nonNegativeCount(summary.mainMentionCount),
  );
}

function chatUnreadSummaryText(summary: ChatUnreadSummary) {
  return summary.totalUnreadCount > 0 ? `${summary.totalUnreadCount} 条聊天消息未读` : null;
}

function notificationBadgeOnlyText(count: number) {
  return count > 0 ? `${count} 条系统通知未读` : null;
}

function nonNegativeCount(value: number | null | undefined) {
  const count = Number(value);
  return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
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
