import type { ChatRealtimeEvent } from "../../types/realtime";

type ChatRealtimeEventListener = (event: ChatRealtimeEvent) => void;

const chatEventListeners = new Set<ChatRealtimeEventListener>();

export function publishChatRealtimeEvent(event: ChatRealtimeEvent) {
  for (const listener of Array.from(chatEventListeners)) {
    try {
      listener(event);
    } catch {
      // View-level listeners must not block app-level notification delivery.
    }
  }
}

export function subscribeChatRealtimeEvents(listener: ChatRealtimeEventListener) {
  chatEventListeners.add(listener);

  return () => {
    chatEventListeners.delete(listener);
  };
}
