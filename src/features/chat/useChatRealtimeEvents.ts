import { useEffect, useRef } from "react";
import type { ChatRealtimeEvent } from "../../types/realtime";

type UseChatRealtimeEventsOptions = {
  onConnectionRestored?: () => void;
};

export function parseChatRealtimeEvent(raw: string): ChatRealtimeEvent | null {
  try {
    const event = JSON.parse(raw) as ChatRealtimeEvent;
    return event.kind === "chat.event" ? event : null;
  } catch {
    return null;
  }
}

export function useChatRealtimeEvents(onEvent: (event: ChatRealtimeEvent) => void, options: UseChatRealtimeEventsOptions = {}) {
  const onEventRef = useRef(onEvent);
  const onConnectionRestoredRef = useRef(options.onConnectionRestored);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    onConnectionRestoredRef.current = options.onConnectionRestored;
  }, [options.onConnectionRestored]);

  useEffect(() => {
    if (typeof EventSource === "undefined") return undefined;
    const source = new EventSource("/api/events", { withCredentials: true });
    let connectionHadError = false;
    const handleChatEvent = (event: MessageEvent<string>) => {
      const payload = parseChatRealtimeEvent(event.data);
      if (payload) onEventRef.current(payload);
    };
    const handleOpen = () => {
      if (!connectionHadError) return;
      connectionHadError = false;
      onConnectionRestoredRef.current?.();
    };
    const handleError = () => {
      connectionHadError = true;
    };
    source.addEventListener("chat.event", handleChatEvent);
    source.addEventListener("open", handleOpen);
    source.addEventListener("error", handleError);
    return () => {
      source.removeEventListener("chat.event", handleChatEvent);
      source.removeEventListener("open", handleOpen);
      source.removeEventListener("error", handleError);
      source.close();
    };
  }, []);
}
