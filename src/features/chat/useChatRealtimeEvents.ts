import { useEffect, useRef } from "react";
import type { ChatRealtimeEvent } from "../../types/realtime";
import { subscribeChatRealtimeEvents } from "../realtime/chatRealtimeEventBus";

type UseChatRealtimeEventsOptions = {
  onConnectionRestored?: () => void;
};

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
    return subscribeChatRealtimeEvents(
      (event) => onEventRef.current(event),
      { onConnectionRestored: () => onConnectionRestoredRef.current?.() },
    );
  }, []);
}
