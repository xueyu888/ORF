import { Hash, Lock, MessageSquare } from "lucide-react";
import {
  chatConversationDisplayName,
  chatConversationSearchText,
  chatConversationVisibleMembers,
  isChatConversation,
} from "../../domain/chatConversation";
import type { ChatChannel, ChatUser } from "../../types/orf";

export function channelIcon(channel: ChatChannel) {
  if (channel.type === "public") return Hash;
  if (channel.type === "private") return Lock;
  return MessageSquare;
}

export function chatChannelDisplayLabel(channel: ChatChannel, currentUserId: string | undefined, usersById: ReadonlyMap<string, ChatUser>) {
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
  if (!isChatConversation(channel)) return `${channel.displayName} ${channel.name ?? ""}`.trim();
  return chatConversationSearchText({
    currentUserId,
    fallbackDisplayName: channel.displayName,
    members: channel.members,
    type: channel.type,
    usersById,
  });
}

export function chatConversationAvatarUsers(channel: ChatChannel, currentUserId: string | undefined, usersById: ReadonlyMap<string, ChatUser>) {
  const visibleMembers = chatConversationVisibleMembers({
    currentUserId,
    members: channel.members,
    type: channel.type,
    usersById,
  });
  return visibleMembers
    .map((user) => usersById.get(user.id))
    .filter((user): user is ChatUser => user !== undefined)
    .slice(0, 3);
}

export function chatDirectPeer(channel: ChatChannel, currentUserId: string | undefined, usersById: ReadonlyMap<string, ChatUser>) {
  if (channel.type !== "direct") return null;
  return chatConversationAvatarUsers(channel, currentUserId, usersById)[0] ?? null;
}

export function chatChannelInfoLabel(channel: ChatChannel) {
  if (channel.type === "group") return "群聊信息";
  if (channel.type === "direct") return "私聊信息";
  return "频道信息";
}
