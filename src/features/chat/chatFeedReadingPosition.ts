import type { ChatFeedScrollAnchor } from "./chatFeedScroll";

export type ChatFeedReadingPosition = {
  capturedAt: string;
  channelId: string;
  messageId: string;
  offsetTop: number;
  scrollTop: number;
};

type ChatFeedReadingPositionStore = {
  channels: Record<string, ChatFeedReadingPosition>;
  lastChannelId: string | null;
};

const memoryStores = new Map<string, ChatFeedReadingPositionStore>();
const chatFeedReadingOffsetLimitPx = 1_000_000;

function emptyStore(): ChatFeedReadingPositionStore {
  return { channels: {}, lastChannelId: null };
}

function storageKey(userId: string) {
  return `orf.chat.reading-position.${userId}`;
}

function normalizeStore(raw: unknown): ChatFeedReadingPositionStore {
  if (!raw || typeof raw !== "object") return emptyStore();
  const input = raw as Partial<ChatFeedReadingPositionStore>;
  const channels: Record<string, ChatFeedReadingPosition> = {};
  if (input.channels && typeof input.channels === "object") {
    for (const [channelId, position] of Object.entries(input.channels)) {
      if (!position || typeof position !== "object") continue;
      const item = position as Partial<ChatFeedReadingPosition>;
      if (
        typeof item.capturedAt === "string" &&
        typeof item.channelId === "string" &&
        typeof item.messageId === "string" &&
        typeof item.offsetTop === "number" &&
        typeof item.scrollTop === "number" &&
        item.channelId === channelId
      ) {
        if (!Number.isFinite(item.offsetTop) || !Number.isFinite(item.scrollTop)) continue;
        channels[channelId] = {
          capturedAt: item.capturedAt,
          channelId,
          messageId: item.messageId,
          offsetTop: Math.max(-chatFeedReadingOffsetLimitPx, Math.min(chatFeedReadingOffsetLimitPx, item.offsetTop)),
          scrollTop: Math.max(0, item.scrollTop),
        };
      }
    }
  }
  const lastChannelId = typeof input.lastChannelId === "string" ? input.lastChannelId : null;
  return { channels, lastChannelId };
}

function readStore(userId: string): ChatFeedReadingPositionStore {
  if (typeof window === "undefined") return memoryStores.get(userId) ?? emptyStore();
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    return normalizeStore(raw ? JSON.parse(raw) : null);
  } catch {
    return emptyStore();
  }
}

function writeStore(userId: string, store: ChatFeedReadingPositionStore) {
  const normalized = normalizeStore(store);
  memoryStores.set(userId, normalized);
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(normalized));
  } catch {
    // Reading position is optional UI state; storage failures must not block chat.
  }
}

export function readChatFeedReadingPosition(userId: string | undefined, channelId: string) {
  if (!userId) return null;
  return readStore(userId).channels[channelId] ?? null;
}

export function readChatLastChannelId(userId: string | undefined, validChannelIds: readonly string[]) {
  if (!userId) return null;
  const valid = new Set(validChannelIds);
  const lastChannelId = readStore(userId).lastChannelId;
  return lastChannelId && valid.has(lastChannelId) ? lastChannelId : null;
}

export function rememberChatLastChannel(input: {
  channelId: string;
  userId?: string;
}) {
  if (!input.userId) return;
  const store = readStore(input.userId);
  writeStore(input.userId, {
    channels: store.channels,
    lastChannelId: input.channelId,
  });
}

export function rememberChatFeedReadingPosition(input: {
  channelId: string;
  scrollAnchor: ChatFeedScrollAnchor;
  scrollTop: number;
  userId?: string;
}) {
  if (!input.userId) return;
  const store = readStore(input.userId);
  writeStore(input.userId, {
    channels: {
      ...store.channels,
      [input.channelId]: {
        capturedAt: new Date().toISOString(),
        channelId: input.channelId,
        messageId: input.scrollAnchor.messageId,
        offsetTop: input.scrollAnchor.offsetTop,
        scrollTop: Math.max(0, input.scrollTop),
      },
    },
    lastChannelId: store.lastChannelId,
  });
}

export function clearChatFeedReadingPosition(userId: string | undefined, channelId?: string) {
  if (!userId) return;
  if (!channelId) {
    writeStore(userId, emptyStore());
    return;
  }
  const store = readStore(userId);
  const channels = { ...store.channels };
  delete channels[channelId];
  writeStore(userId, {
    channels,
    lastChannelId: store.lastChannelId === channelId ? null : store.lastChannelId,
  });
}
