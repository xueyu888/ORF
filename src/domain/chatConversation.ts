import type { ChatChannel, ChatChannelMember, ChatChannelType, ChatUser } from "../types/orf";

export const CHAT_DIRECT_MEMBER_COUNT = 2;

type ChatConversationMemberUser = Pick<ChatUser, "id" | "name">;

export function isChatConversationType(type: ChatChannelType) {
  return type === "direct";
}

export function isChatConversation(channel: Pick<ChatChannel, "type">) {
  return isChatConversationType(channel.type);
}

export function chatConversationDisplayName(input: {
  currentUserId?: string | null;
  fallbackDisplayName?: string;
  members: readonly ChatChannelMember[];
  type: ChatChannelType;
  usersById: ReadonlyMap<string, ChatConversationMemberUser>;
}) {
  if (!isChatConversationType(input.type)) return input.fallbackDisplayName?.trim() || "频道";

  const visibleMembers = chatConversationVisibleMembers({
    currentUserId: input.currentUserId,
    members: input.members,
    type: input.type,
    usersById: input.usersById,
  });
  const names = visibleMembers.map((user) => user.name.trim()).filter(Boolean);
  if (names.length > 0) return names.join(", ");

  const fallback = input.fallbackDisplayName?.trim();
  if (fallback) return fallback;
  return "私聊";
}

export function chatConversationVisibleMembers(input: {
  currentUserId?: string | null;
  members: readonly ChatChannelMember[];
  type: ChatChannelType;
  usersById: ReadonlyMap<string, ChatConversationMemberUser>;
}) {
  const members = input.members
    .map((member) => input.usersById.get(member.userId))
    .filter((user): user is ChatConversationMemberUser => user !== undefined);
  const others = members.filter((user) => user.id !== input.currentUserId);
  const visibleMembers = others.length > 0 ? others : members;
  return visibleMembers.slice(0, 1);
}

export function chatConversationSearchText(input: {
  currentUserId?: string | null;
  fallbackDisplayName?: string;
  members: readonly ChatChannelMember[];
  type: ChatChannelType;
  usersById: ReadonlyMap<string, ChatConversationMemberUser>;
}) {
  if (!isChatConversationType(input.type)) return input.fallbackDisplayName?.trim() || "";
  const memberNames = input.members
    .map((member) => input.usersById.get(member.userId)?.name.trim())
    .filter((name): name is string => Boolean(name));
  return [
    chatConversationDisplayName(input),
    input.fallbackDisplayName?.trim() ?? "",
    ...memberNames,
  ].filter(Boolean).join(" ");
}
