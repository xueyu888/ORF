import { chatSyncMetadataKeysByEventType, type ChatSyncEventType } from "../../src/domain/chatSync";

type SafeMetadataValue = boolean | number | string | null;

export function sanitizeChatSyncMetadata(
  eventType: ChatSyncEventType,
  metadata: unknown,
): Record<string, SafeMetadataValue> {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  const source = metadata as Record<string, unknown>;
  const safe: Record<string, SafeMetadataValue> = {};
  for (const key of chatSyncMetadataKeysByEventType[eventType]) {
    const value = source[key];
    if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
      safe[key] = value;
    }
  }
  return safe;
}

export function isPrivateChatSyncEvent(eventType: ChatSyncEventType) {
  return eventType === "channel.preference.changed"
    || eventType === "channel.read.changed"
    || eventType === "message.save.changed"
    || eventType === "thread.follow.changed"
    || eventType === "thread.read.changed";
}
