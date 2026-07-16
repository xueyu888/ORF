import {
  CHAT_SYNC_PROTOCOL_VERSION,
  parseStoredChatSyncCursor,
  type StoredChatSyncCursor,
} from "../../domain/chatSync";
import { getRealtimeClientId } from "../realtime/realtimeClientId";

const chatSyncCursorStoragePrefix = "orf.chat.syncCursor";

function storageKey(userId: string) {
  return `${chatSyncCursorStoragePrefix}:${userId}:${getRealtimeClientId()}`;
}

export function readChatSyncCursor(userId: string): StoredChatSyncCursor | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(storageKey(userId));
    return stored ? parseStoredChatSyncCursor(JSON.parse(stored)) : null;
  } catch {
    return null;
  }
}

export function writeChatSyncCursor(
  userId: string,
  input: { cursor: string; permissionFingerprint: string; teamId: string },
) {
  if (typeof window === "undefined") return;
  const record: StoredChatSyncCursor = {
    cursor: input.cursor,
    permissionFingerprint: input.permissionFingerprint,
    protocolVersion: CHAT_SYNC_PROTOCOL_VERSION,
    teamId: input.teamId,
  };
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(record));
  } catch {
    // Cursor persistence is an optimization. Recovery still falls back to full reconciliation.
  }
}
