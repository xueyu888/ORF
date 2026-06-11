import type { ChatUser } from "../../types/orf";

function normalizeChatUserQuery(query: string) {
  return query.trim().toLowerCase();
}

export function matchesChatUser(user: ChatUser, query: string) {
  const normalized = normalizeChatUserQuery(query);
  if (!normalized) return true;
  return user.name.toLowerCase().includes(normalized) || user.email.toLowerCase().includes(normalized);
}

export function searchChatUsers(users: ChatUser[], query: string, options: { excludeUserId?: string } = {}) {
  const normalized = normalizeChatUserQuery(query);
  if (!normalized) return [];
  return users
    .filter((user) => user.id !== options.excludeUserId)
    .filter((user) => matchesChatUser(user, normalized));
}
