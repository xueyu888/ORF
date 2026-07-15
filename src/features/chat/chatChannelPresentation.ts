import { Bell, Hash, Lock, Megaphone, MessageSquare } from "lucide-react";
import {
  chatConversationDisplayName,
  chatConversationSearchText,
  chatConversationVisibleMembers,
  isChatConversation,
} from "../../domain/chatConversation";
import type { ChatChannel, ChatUser } from "../../types/orf";

export function channelIcon(channel: ChatChannel) {
  if (channel.systemKind === "teamAnnouncement") return Megaphone;
  if (channel.systemKind === "personalNotification") return Bell;
  if (channel.type === "public") return Hash;
  if (channel.type === "private") return Lock;
  return MessageSquare;
}

export function chatChannelDisplayLabel(channel: ChatChannel, currentUserId: string | undefined, usersById: ReadonlyMap<string, ChatUser>) {
  if (channel.systemKind) return channel.displayName;
  if (!isChatConversation(channel)) return channel.displayName;
  return chatConversationDisplayName({
    currentUserId,
    fallbackDisplayName: channel.displayName,
    members: channel.members,
    type: channel.type,
    usersById,
  });
}

export function chatChannelSearchText(channel: ChatChannel, currentUserId: string | undefined, usersById: ReadonlyMap<string, ChatUser>) {
  if (channel.systemKind) return `${channel.displayName} ${channel.name ?? ""} ${channel.purpose}`.trim();
  if (!isChatConversation(channel)) return `${channel.displayName} ${channel.name ?? ""}`.trim();
  return chatConversationSearchText({
    currentUserId,
    fallbackDisplayName: channel.displayName,
    members: channel.members,
    type: channel.type,
    usersById,
  });
}

export function chatChannelAvatarUsers(channel: ChatChannel, currentUserId: string | undefined, usersById: ReadonlyMap<string, ChatUser>) {
  if (isChatConversation(channel)) return [];
  const members = channel.members
    .map((member) => usersById.get(member.userId))
    .filter((user): user is ChatUser => user !== undefined);
  const visibleMembers = members.filter((user) => user.id !== currentUserId);
  return sortChatChannelAvatarUsers(visibleMembers.length > 0 ? visibleMembers : members).slice(0, 3);
}

export function chatChannelMemberNamePreview(channel: ChatChannel, usersById: ReadonlyMap<string, ChatUser>, limit: number) {
  return channel.members
    .map((member) => usersById.get(member.userId)?.name)
    .filter((name): name is string => Boolean(name))
    .slice(0, limit)
    .join(", ");
}

export function chatDirectPeer(channel: ChatChannel, currentUserId: string | undefined, usersById: ReadonlyMap<string, ChatUser>) {
  if (channel.systemKind) return null;
  if (channel.type !== "direct") return null;
  const visibleMembers = chatConversationVisibleMembers({
    currentUserId,
    members: channel.members,
    type: channel.type,
    usersById,
  });
  const peer = visibleMembers[0];
  return peer ? usersById.get(peer.id) ?? null : null;
}

export function chatChannelInfoLabel(channel: ChatChannel) {
  if (channel.type === "direct") return "私聊信息";
  return "频道信息";
}

function sortChatChannelAvatarUsers(users: ChatUser[]) {
  return [...users].sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }) || left.id.localeCompare(right.id));
}
