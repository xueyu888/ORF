import type { ChatChannel, ChatUser } from "../../types/orf";
import { chatChannelSearchText } from "./chatChannelPresentation";
import { currentMembership } from "./chatModels";
import { matchesChatUser } from "./chatUserSearch";

const chatSidebarUserCollator = new Intl.Collator("zh-Hans-CN", { numeric: true, sensitivity: "base" });

export type ChatSidebarChannelGroupId = "recent";
export type ChatSidebarAddressBookChannelSectionId = "favorites" | "public" | "private" | "direct";

export type ChatSidebarChannelGroup = {
  channels: ChatChannel[];
  id: ChatSidebarChannelGroupId;
  title: string;
};

export type ChatSidebarAddressBookChannelSection = {
  channels: ChatChannel[];
  id: ChatSidebarAddressBookChannelSectionId;
  title: string;
};

export type ChatSidebarAddressBook = {
  channelSections: ChatSidebarAddressBookChannelSection[];
  title: "通讯录";
  users: ChatUser[];
};

export type ChatSidebarNavigation = {
  addressBook: ChatSidebarAddressBook;
  hasResults: boolean;
  recent: ChatSidebarChannelGroup;
  systemChannels: ChatChannel[];
};

type BuildChatSidebarNavigationInput = {
  channels: ChatChannel[];
  currentUserId?: string;
  query?: string;
  users: ChatUser[];
};

export function buildChatSidebarNavigation({
  channels,
  currentUserId,
  query = "",
  users,
}: BuildChatSidebarNavigationInput): ChatSidebarNavigation {
  const normalizedQuery = normalizeChatSidebarQuery(query);
  const usersById = new Map(users.map((user) => [user.id, user]));
  const visibleChannels = channels.filter((channel) => {
    if (!normalizedQuery) return true;
    return chatChannelSearchText(channel, currentUserId, usersById).toLowerCase().includes(normalizedQuery);
  });
  const systemChannels = visibleChannels.filter((channel) => channel.systemKind);
  const regularChannels = visibleChannels.filter((channel) => !channel.systemKind);
  const recentChannels = sortRecentChatSessions(regularChannels.filter(hasChatSessionActivity));
  const addressBookChannels = regularChannels;
  const favoriteChannels = addressBookChannels.filter((channel) => currentMembership(channel, currentUserId)?.favorite);
  const favoriteChannelIds = new Set(favoriteChannels.map((channel) => channel.id));
  const directoryChannels = addressBookChannels.filter((channel) => !favoriteChannelIds.has(channel.id));
  const addressBookUsers = sortChatSidebarUsers(users
    .filter((user) => user.id !== currentUserId)
    .filter((user) => !normalizedQuery || matchesChatUser(user, normalizedQuery)));
  const channelSections: ChatSidebarAddressBookChannelSection[] = [
    { id: "favorites", title: "收藏频道", channels: favoriteChannels },
    { id: "public", title: "公开频道", channels: directoryChannels.filter((channel) => channel.type === "public") },
    { id: "private", title: "私有频道", channels: directoryChannels.filter((channel) => channel.type === "private") },
    { id: "direct", title: "私信", channels: directoryChannels.filter((channel) => channel.type === "direct") },
  ];
  const addressBook = {
    channelSections,
    title: "通讯录" as const,
    users: addressBookUsers,
  };
  const hasAddressBookEntries = addressBook.users.length > 0 || addressBook.channelSections.some((section) => section.channels.length > 0);
  return {
    addressBook,
    hasResults: systemChannels.length > 0 || recentChannels.length > 0 || hasAddressBookEntries,
    recent: { id: "recent", title: "最近会话", channels: recentChannels },
    systemChannels,
  };
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

function normalizeChatSidebarQuery(query: string) {
  return query.trim().toLowerCase();
}

function sortChatSidebarUsers(users: ChatUser[]) {
  return [...users].sort((left, right) => chatSidebarUserCollator.compare(left.name, right.name) || left.email.localeCompare(right.email) || left.id.localeCompare(right.id));
}
