import { useEffect, useRef } from "react";
import type { AppNotification } from "../../types/orf";
import type { OrfReadModelInvalidation, RealtimeEvent, SystemBroadcast } from "../../types/realtime";

type RealtimeEventOptions = {
  enabled: boolean;
  onBroadcast: (broadcast: SystemBroadcast) => void;
  onReadModelInvalidation: (invalidation: OrfReadModelInvalidation) => void;
  onNotification: (notification: AppNotification) => void;
};

export function useRealtimeEvents({ enabled, onBroadcast, onNotification, onReadModelInvalidation }: RealtimeEventOptions) {
  const onBroadcastRef = useRef(onBroadcast);
  const onNotificationRef = useRef(onNotification);
  const onReadModelInvalidationRef = useRef(onReadModelInvalidation);

  useEffect(() => {
    onBroadcastRef.current = onBroadcast;
  }, [onBroadcast]);

  useEffect(() => {
    onNotificationRef.current = onNotification;
  }, [onNotification]);

  useEffect(() => {
    onReadModelInvalidationRef.current = onReadModelInvalidation;
  }, [onReadModelInvalidation]);

  useEffect(() => {
    if (!enabled || typeof EventSource === "undefined") {
      return undefined;
    }

    const source = new EventSource("/api/events", { withCredentials: true });
    const handleNotification = (event: MessageEvent<string>) => {
      const payload = parseRealtimeEvent(event.data);
      if (payload?.kind === "notification.created") {
        onNotificationRef.current(payload.notification);
      }
    };
    const handleBroadcast = (event: MessageEvent<string>) => {
      const payload = parseRealtimeEvent(event.data);
      if (payload?.kind === "system.broadcast") {
        onBroadcastRef.current(payload.broadcast);
      }
    };
    const handleReadModelInvalidation = (event: MessageEvent<string>) => {
      const payload = parseRealtimeEvent(event.data);
      if (payload?.kind === "orf.read-model.invalidated") {
        onReadModelInvalidationRef.current(payload.invalidation);
      }
    };

    source.addEventListener("notification.created", handleNotification);
    source.addEventListener("system.broadcast", handleBroadcast);
    source.addEventListener("orf.read-model.invalidated", handleReadModelInvalidation);
    return () => {
      source.removeEventListener("notification.created", handleNotification);
      source.removeEventListener("system.broadcast", handleBroadcast);
      source.removeEventListener("orf.read-model.invalidated", handleReadModelInvalidation);
      source.close();
    };
  }, [enabled]);
}

function parseRealtimeEvent(raw: string): RealtimeEvent | null {
  try {
    return JSON.parse(raw) as RealtimeEvent;
  } catch {
    return null;
  }
}
