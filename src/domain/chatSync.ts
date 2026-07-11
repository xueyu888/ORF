export const CHAT_SYNC_PROTOCOL_VERSION = 1 as const;
export const CHAT_SYNC_PAGE_SIZE = 500;
export const CHAT_SYNC_MAX_INCREMENTAL_EVENTS = 5_000;
const CHAT_SYNC_MAX_CURSOR = 9_223_372_036_854_775_807n;

export const chatSyncEventTypes = [
  "channel.created",
  "channel.updated",
  "channel.archived",
  "channel.member.changed",
  "channel.preference.changed",
  "channel.read.changed",
  "message.created",
  "message.updated",
  "message.deleted",
  "reaction.changed",
  "message.pin.changed",
  "message.save.changed",
  "thread.follow.changed",
  "thread.read.changed",
] as const;

export type ChatSyncEventType = (typeof chatSyncEventTypes)[number];
export const chatSyncMetadataKeysByEventType: Record<ChatSyncEventType, readonly string[]> = {
  "channel.archived": ["version"],
  "channel.created": ["version"],
  "channel.member.changed": ["membership", "role"],
  "channel.preference.changed": ["favorite", "muted"],
  "channel.read.changed": ["lastReadAt", "lastReadMessageId", "manuallyUnread"],
  "channel.updated": ["version"],
  "message.created": ["parentMessageId", "rootMessageId", "version"],
  "message.deleted": ["parentMessageId", "rootMessageId", "version"],
  "message.pin.changed": ["pinned"],
  "message.save.changed": ["saved"],
  "message.updated": ["parentMessageId", "rootMessageId", "version"],
  "reaction.changed": ["emojiName", "reacting"],
  "thread.follow.changed": ["following"],
  "thread.read.changed": ["lastViewedAt"],
};
export type ChatSyncObjectType = "channel" | "message" | "thread" | "user";
export type ChatSyncMode = "full" | "incremental";
export type ChatSyncFallbackReason =
  | "cursor_expired"
  | "cursor_gap"
  | "cursor_missing"
  | "event_window_too_large"
  | "permission_changed"
  | "protocol_mismatch";

export interface ChatSyncEvent {
  actorUserId: string | null;
  channelId: string;
  eventType: ChatSyncEventType;
  metadata: Record<string, boolean | number | string | null>;
  objectId: string;
  objectType: ChatSyncObjectType;
  occurredAt: string;
  seq: string;
}

export interface ChatSyncResponse {
  events: ChatSyncEvent[];
  fallbackReason: ChatSyncFallbackReason | null;
  hasMore: boolean;
  mode: ChatSyncMode;
  nextCursor: string;
  permissionFingerprint: string;
  protocolVersion: typeof CHAT_SYNC_PROTOCOL_VERSION;
  teamId: string;
}

export interface StoredChatSyncCursor {
  cursor: string;
  permissionFingerprint: string;
  protocolVersion: typeof CHAT_SYNC_PROTOCOL_VERSION;
  teamId: string;
}

export function isChatSyncCursor(value: unknown): value is string {
  if (typeof value !== "string" || !/^(0|[1-9]\d*)$/.test(value)) return false;
  return BigInt(value) <= CHAT_SYNC_MAX_CURSOR;
}

export function parseStoredChatSyncCursor(value: unknown): StoredChatSyncCursor | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<StoredChatSyncCursor>;
  if (candidate.protocolVersion !== CHAT_SYNC_PROTOCOL_VERSION) return null;
  if (typeof candidate.teamId !== "string" || candidate.teamId.length === 0) return null;
  if (typeof candidate.permissionFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(candidate.permissionFingerprint)) return null;
  if (!isChatSyncCursor(candidate.cursor)) return null;
  return candidate as StoredChatSyncCursor;
}
