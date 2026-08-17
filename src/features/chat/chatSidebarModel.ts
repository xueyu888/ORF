import type { ChatChannel } from "../../types/orf";
import { currentMembership } from "./chatModels";

export type ChatSidebarChannelGroupId = "recent" | "favorites" | "public" | "private" | "direct";

export type ChatSidebarChannelGroup = {
  channels: ChatChannel[];
  id: ChatSidebarChannelGroupId;
  title: string;
};

export function buildChatSidebarChannelGroups(channels: ChatChannel[], currentUserId?: string): ChatSidebarChannelGroup[] {
  const regularChannels = channels.filter((channel) => !channel.systemKind);
  const recentChannels = sortRecentChatSessions(regularChannels.filter(hasChatSessionActivity));
  const recentChannelIds = new Set(recentChannels.map((channel) => channel.id));
  const discoverableChannels = regularChannels.filter((channel) => !recentChannelIds.has(channel.id));
  const favoriteChannels = discoverableChannels.filter((channel) => currentMembership(channel, currentUserId)?.favorite);
  const favoriteChannelIds = new Set(favoriteChannels.map((channel) => channel.id));
  const directoryChannels = discoverableChannels.filter((channel) => !favoriteChannelIds.has(channel.id));
  return [
    { id: "recent", title: "最近会话", channels: recentChannels },
    { id: "favorites", title: "收藏", channels: favoriteChannels },
    { id: "public", title: "公开频道", channels: directoryChannels.filter((channel) => channel.type === "public") },
    { id: "private", title: "私有频道", channels: directoryChannels.filter((channel) => channel.type === "private") },
    { id: "direct", title: "私信", channels: directoryChannels.filter((channel) => channel.type === "direct") },
  ];
}

function hasChatSessionActivity(channel: ChatChannel) {
  return Boolean(channel.lastMessageAt);
}

function sortRecentChatSessions(channels: ChatChannel[]) {
  return [...channels].sort((left, right) => {
    const lastMessageOrder = (right.lastMessageAt ?? "").localeCompare(left.lastMessageAt ?? "");
    if (lastMessageOrder !== 0) return lastMessageOrder;
    return right.updatedAt.localeCompare(left.updatedAt);
  });
}
