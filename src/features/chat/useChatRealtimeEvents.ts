import { useEffect, useRef } from "react";
import type { ChatRealtimeEvent } from "../../types/realtime";
import { subscribeChatRealtimeEvents } from "../realtime/chatRealtimeEventBus";

export function useChatRealtimeEvents(onEvent: (event: ChatRealtimeEvent) => void) {
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    return subscribeChatRealtimeEvents((event) => onEventRef.current(event));
  }, []);
}
