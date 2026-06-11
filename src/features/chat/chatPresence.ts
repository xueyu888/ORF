import type { ChatUser } from "../../types/orf";

export type ChatPresenceState = "away" | "offline" | "online" | "unknown";

const chatAwayPresenceWindowMs = 24 * 60 * 60 * 1000;
export const chatPresenceProtocolUpgradeMessage = "聊天在线状态协议已更新，请升级 ORF 前端和后端到同一最新版后再使用聊天。";

export function hasChatPresenceProtocol(user: ChatUser) {
  return typeof user.presence?.online === "boolean";
}

export function hasChatPresenceProtocolMismatch(users: ChatUser[] | undefined) {
  return Boolean(users?.some((user) => !hasChatPresenceProtocol(user)));
}

export function chatPresenceState(user: ChatUser | undefined, currentUserId?: string): ChatPresenceState {
  if (!user) return "unknown";
  if (user.id === currentUserId) return "online";
  if (!hasChatPresenceProtocol(user)) return "unknown";
  if (user.presence.online) return "online";
  const lastOnlineAt = user.lastOnlineAt ? Date.parse(user.lastOnlineAt) : 0;
  if (!lastOnlineAt) return "offline";
  const elapsedMs = Date.now() - lastOnlineAt;
  if (elapsedMs < chatAwayPresenceWindowMs) return "away";
  return "offline";
}

export function isChatUserOnline(user: ChatUser | undefined, currentUserId?: string) {
  return chatPresenceState(user, currentUserId) === "online";
}

export function formatPresence(user: ChatUser | undefined, currentUserId?: string) {
  if (!user) return "未知状态";
  if (user.id === currentUserId) return "当前在线";
  if (!hasChatPresenceProtocol(user)) return "在线状态需升级";
  if (isChatUserOnline(user, currentUserId)) return "在线";
  const lastOnlineAt = user.lastOnlineAt ? Date.parse(user.lastOnlineAt) : 0;
  if (!lastOnlineAt) return "离线";
  const minutes = Math.max(1, Math.round((Date.now() - lastOnlineAt) / 60000));
  if (minutes < 60) return `${minutes} 分钟前在线`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时前在线`;
  return `${Math.round(hours / 24)} 天前在线`;
}
