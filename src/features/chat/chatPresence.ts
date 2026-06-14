import type { ChatUser } from "../../types/orf";

export type ChatPresenceDisplayState = "active" | "idle" | "recent" | "offline" | "unknown";

const chatRecentPresenceWindowMs = 24 * 60 * 60 * 1000;
export const chatPresenceProtocolUpgradeMessage = "聊天在线状态协议已更新，请升级 ORF 前端和后端到同一最新版后再使用聊天。";

export function hasChatPresenceProtocol(user: ChatUser) {
  return (
    typeof user.presence?.active === "boolean" &&
    typeof user.presence?.connected === "boolean" &&
    typeof user.presence?.online === "boolean" &&
    typeof user.presence?.state === "string"
  );
}

export function hasChatPresenceProtocolMismatch(users: ChatUser[] | undefined) {
  return Boolean(users?.some((user) => !hasChatPresenceProtocol(user)));
}

export function chatPresenceState(user: ChatUser | undefined, currentUserId?: string): ChatPresenceDisplayState {
  void currentUserId;
  if (!user) return "unknown";
  if (!hasChatPresenceProtocol(user)) return "unknown";
  if (user.presence.state === "active") return "active";
  if (user.presence.state === "idle") return "idle";
  if (user.presence.state === "recent") return "recent";

  const lastOnlineAt = user.lastOnlineAt ? Date.parse(user.lastOnlineAt) : 0;
  if (!lastOnlineAt) return "offline";
  return Date.now() - lastOnlineAt < chatRecentPresenceWindowMs ? "recent" : "offline";
}

export function chatPresenceBadgeState(state: ChatPresenceDisplayState) {
  if (state === "active") return "online";
  if (state === "idle" || state === "recent") return "away";
  return state;
}

export function isChatUserOnline(user: ChatUser | undefined, currentUserId?: string) {
  return chatPresenceState(user, currentUserId) === "active";
}

export function formatPresence(user: ChatUser | undefined, currentUserId?: string) {
  if (!user) return "未知状态";
  if (!hasChatPresenceProtocol(user)) return "在线状态需升级";

  const state = chatPresenceState(user, currentUserId);
  if (state === "active") return user.id === currentUserId ? "当前活跃" : "活跃在线";

  const lastActiveAt = Date.parse(user.presence.lastActiveAt ?? user.lastOnlineAt ?? "");
  if (state === "idle") {
    return lastActiveAt ? `已连接，${formatElapsedTime(lastActiveAt)}未活动` : "已连接，暂时离开";
  }
  if (state === "recent") {
    return lastActiveAt ? `${formatElapsedTime(lastActiveAt)}在线` : "最近在线";
  }
  return "离线";
}

function formatElapsedTime(timestamp: number) {
  const minutes = Math.max(1, Math.round((Date.now() - timestamp) / 60000));
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.round(hours / 24)} 天前`;
}
