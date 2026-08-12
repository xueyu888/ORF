import type { ChatMessage, ChatUser } from "../../types/orf";

const compactMessageWindowMs = 5 * 60 * 1000;

export type ChatMessageDisplayAuthor = {
  avatarUrl?: string | null;
  id: string;
  isAttributedSystemEvent: boolean;
  name: string;
  user?: ChatUser;
};

function attributedSystemActor(message: ChatMessage) {
  if (message.source !== "system") return null;
  const id = message.system?.actorUserId?.trim();
  const name = message.system?.actorName?.trim();
  return id && name ? { id, name } : null;
}

export function chatMessageDisplayAuthor(
  message: ChatMessage,
  usersById?: ReadonlyMap<string, ChatUser>,
): ChatMessageDisplayAuthor {
  const systemActor = attributedSystemActor(message);
  const id = systemActor?.id ?? message.authorUserId;
  const user = usersById?.get(id);
  return {
    avatarUrl: user?.avatarUrl ?? (systemActor ? null : message.authorAvatarUrl),
    id,
    isAttributedSystemEvent: Boolean(systemActor),
    name: user?.name.trim() || systemActor?.name || message.authorName,
    user,
  };
}

export function chatMessageDisplayBody(
  message: ChatMessage,
  renderMessageBody?: (message: ChatMessage) => string | null | undefined,
) {
  const body = renderMessageBody?.(message);
  return body === undefined ? message.body : body;
}

function chatMessageDisplayAuthorKey(message: ChatMessage) {
  const systemActor = attributedSystemActor(message);
  return systemActor ? `system:${systemActor.id}` : `${message.source}:${message.authorUserId}`;
}

export function shouldCompactChatMessage(previous: ChatMessage | undefined, current: ChatMessage) {
  if (!previous) return false;
  if (chatMessageDisplayAuthorKey(previous) !== chatMessageDisplayAuthorKey(current)) return false;
  if (previous.deletedAt || current.deletedAt) return false;
  if ((previous.rootMessageId ?? null) !== (current.rootMessageId ?? null)) return false;
  const previousTime = new Date(previous.createdAt).getTime();
  const currentTime = new Date(current.createdAt).getTime();
  if (!Number.isFinite(previousTime) || !Number.isFinite(currentTime)) return false;
  const gap = currentTime - previousTime;
  return gap >= 0 && gap <= compactMessageWindowMs;
}
