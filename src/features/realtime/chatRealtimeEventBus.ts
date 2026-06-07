import type { ChatRealtimeEvent } from "../../types/realtime";

type ChatRealtimeEventListener = (event: ChatRealtimeEvent) => void;
type ChatRealtimeConnectionRestoredListener = () => void;

type ChatRealtimeSubscriptionOptions = {
  onConnectionRestored?: ChatRealtimeConnectionRestoredListener;
};

const chatEventListeners = new Set<ChatRealtimeEventListener>();
const chatConnectionRestoredListeners = new Set<ChatRealtimeConnectionRestoredListener>();

export function publishChatRealtimeEvent(event: ChatRealtimeEvent) {
  for (const listener of Array.from(chatEventListeners)) {
    try {
      listener(event);
    } catch {
      // View-level listeners must not block app-level notification delivery.
    }
  }
}

export function publishChatRealtimeConnectionRestored() {
  for (const listener of Array.from(chatConnectionRestoredListeners)) {
    try {
      listener();
    } catch {
      // A failed page refresh handler must not break the shared realtime connection.
    }
  }
}

export function subscribeChatRealtimeEvents(listener: ChatRealtimeEventListener, options: ChatRealtimeSubscriptionOptions = {}) {
  chatEventListeners.add(listener);
  if (options.onConnectionRestored) {
    chatConnectionRestoredListeners.add(options.onConnectionRestored);
  }

  return () => {
    chatEventListeners.delete(listener);
    if (options.onConnectionRestored) {
      chatConnectionRestoredListeners.delete(options.onConnectionRestored);
    }
  };
}
