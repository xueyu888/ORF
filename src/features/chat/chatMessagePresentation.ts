import type { ChatMessage } from "../../types/orf";

const compactMessageWindowMs = 5 * 60 * 1000;

export function shouldCompactChatMessage(previous: ChatMessage | undefined, current: ChatMessage) {
  if (!previous) return false;
  if (previous.authorUserId !== current.authorUserId) return false;
  if (previous.deletedAt || current.deletedAt) return false;
  if ((previous.rootMessageId ?? null) !== (current.rootMessageId ?? null)) return false;
  const previousTime = new Date(previous.createdAt).getTime();
  const currentTime = new Date(current.createdAt).getTime();
  if (!Number.isFinite(previousTime) || !Number.isFinite(currentTime)) return false;
  const gap = currentTime - previousTime;
  return gap >= 0 && gap <= compactMessageWindowMs;
}
