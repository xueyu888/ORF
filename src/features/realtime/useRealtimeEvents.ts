import { useEffect, useRef } from "react";
import type { AppNotification } from "../../types/orf";
import type { RealtimeEvent, SystemBroadcast } from "../../types/realtime";

type RealtimeEventOptions = {
  enabled: boolean;
  onBroadcast: (broadcast: SystemBroadcast) => void;
  onNotification: (notification: AppNotification) => void;
};

export function useRealtimeEvents({ enabled, onBroadcast, onNotification }: RealtimeEventOptions) {
  const onBroadcastRef = useRef(onBroadcast);
  const onNotificationRef = useRef(onNotification);

  useEffect(() => {
    onBroadcastRef.current = onBroadcast;
  }, [onBroadcast]);

  useEffect(() => {
    onNotificationRef.current = onNotification;
  }, [onNotification]);

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

    source.addEventListener("notification.created", handleNotification);
    source.addEventListener("system.broadcast", handleBroadcast);
    return () => {
      source.removeEventListener("notification.created", handleNotification);
      source.removeEventListener("system.broadcast", handleBroadcast);
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
