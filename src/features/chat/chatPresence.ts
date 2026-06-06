import type { ChatUser } from "../../types/orf";

export function isChatUserOnline(user: ChatUser | undefined, currentUserId?: string) {
  if (!user) return false;
  if (user.id === currentUserId) return true;
  const lastOnlineAt = user.lastOnlineAt ? Date.parse(user.lastOnlineAt) : 0;
  return Boolean(lastOnlineAt && Date.now() - lastOnlineAt < 5 * 60 * 1000);
}

export function formatPresence(user: ChatUser | undefined, currentUserId?: string) {
  if (!user) return "未知状态";
  if (user.id === currentUserId) return "当前在线";
  if (isChatUserOnline(user, currentUserId)) return "在线";
  const lastOnlineAt = user.lastOnlineAt ? Date.parse(user.lastOnlineAt) : 0;
  if (!lastOnlineAt) return "离线";
  const minutes = Math.max(1, Math.round((Date.now() - lastOnlineAt) / 60000));
  if (minutes < 60) return `${minutes} 分钟前在线`;
  const hours = Math.round(minutes / 60);
  return `${hours} 小时前在线`;
}
