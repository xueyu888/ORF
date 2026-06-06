import { useEffect, useRef } from "react";
import type { ChatRealtimeEvent } from "../../types/realtime";

export function parseChatRealtimeEvent(raw: string): ChatRealtimeEvent | null {
  try {
    const event = JSON.parse(raw) as ChatRealtimeEvent;
    return event.kind === "chat.event" ? event : null;
  } catch {
    return null;
  }
}

export function useChatRealtimeEvents(onEvent: (event: ChatRealtimeEvent) => void) {
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (typeof EventSource === "undefined") return undefined;
    const source = new EventSource("/api/events", { withCredentials: true });
    const handleChatEvent = (event: MessageEvent<string>) => {
      const payload = parseChatRealtimeEvent(event.data);
      if (payload) onEventRef.current(payload);
    };
    source.addEventListener("chat.event", handleChatEvent);
    return () => {
      source.removeEventListener("chat.event", handleChatEvent);
      source.close();
    };
  }, []);
}
