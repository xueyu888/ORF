import { useEffect, useReducer, useRef } from "react";
import type { AppNotification } from "../../types/orf";
import type {
  ChatRealtimeEvent,
  ClientUpdateAvailable,
  OrfReadModelInvalidation,
  RealtimeEvent,
  SystemBroadcast,
  WorkLogReminderRequiredRealtimeEvent,
  WorkLogReminderResolvedRealtimeEvent,
} from "../../types/realtime";
import { getRealtimeClientId } from "./realtimeClientId";
import {
  initialRealtimeConnectionState,
  reduceRealtimeConnectionState,
} from "./realtimeRecoveryModel";

type RealtimeEventOptions = {
  enabled: boolean;
  onBroadcast: (broadcast: SystemBroadcast) => void;
  onChatEvent?: (event: ChatRealtimeEvent) => void;
  onClientUpdateAvailable?: (update: ClientUpdateAvailable) => void;
  onWorkLogReminderRequired?: (event: WorkLogReminderRequiredRealtimeEvent) => void;
  onWorkLogReminderResolved?: (event: WorkLogReminderResolvedRealtimeEvent) => void;
  onReadModelInvalidation: (invalidation: OrfReadModelInvalidation) => void;
  onNotification: (notification: AppNotification) => void;
};

export function useRealtimeEvents({
  enabled,
  onBroadcast,
  onChatEvent,
  onClientUpdateAvailable,
  onWorkLogReminderRequired,
  onWorkLogReminderResolved,
  onNotification,
  onReadModelInvalidation,
}: RealtimeEventOptions) {
  const onBroadcastRef = useRef(onBroadcast);
  const onChatEventRef = useRef(onChatEvent);
  const onClientUpdateAvailableRef = useRef(onClientUpdateAvailable);
  const [connectionState, dispatchConnection] = useReducer(
    reduceRealtimeConnectionState,
    initialRealtimeConnectionState,
  );
  const onWorkLogReminderRequiredRef = useRef(onWorkLogReminderRequired);
  const onWorkLogReminderResolvedRef = useRef(onWorkLogReminderResolved);
  const onNotificationRef = useRef(onNotification);
  const onReadModelInvalidationRef = useRef(onReadModelInvalidation);

  useEffect(() => {
    onBroadcastRef.current = onBroadcast;
  }, [onBroadcast]);

  useEffect(() => {
    onNotificationRef.current = onNotification;
  }, [onNotification]);

  useEffect(() => {
    onChatEventRef.current = onChatEvent;
  }, [onChatEvent]);

  useEffect(() => {
    onClientUpdateAvailableRef.current = onClientUpdateAvailable;
  }, [onClientUpdateAvailable]);

  useEffect(() => {
    onWorkLogReminderRequiredRef.current = onWorkLogReminderRequired;
  }, [onWorkLogReminderRequired]);

  useEffect(() => {
    onWorkLogReminderResolvedRef.current = onWorkLogReminderResolved;
  }, [onWorkLogReminderResolved]);

  useEffect(() => {
    onReadModelInvalidationRef.current = onReadModelInvalidation;
  }, [onReadModelInvalidation]);

  useEffect(() => {
    if (!enabled || typeof EventSource === "undefined") {
      dispatchConnection({ type: "disabled" });
      return undefined;
    }

    dispatchConnection({ type: "connecting" });
    const query = new URLSearchParams({ clientId: getRealtimeClientId() });
    const source = new EventSource(`/api/events?${query.toString()}`, { withCredentials: true });
    let closed = false;
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
    const handleChatEvent = (event: MessageEvent<string>) => {
      const payload = parseRealtimeEvent(event.data);
      if (payload?.kind === "chat.event") {
        onChatEventRef.current?.(payload);
      }
    };
    const handleClientUpdateAvailable = (event: MessageEvent<string>) => {
      const payload = parseRealtimeEvent(event.data);
      if (payload?.kind === "client.update.available") {
        onClientUpdateAvailableRef.current?.(payload.update);
      }
    };
    const handleReadModelInvalidation = (event: MessageEvent<string>) => {
      const payload = parseRealtimeEvent(event.data);
      if (payload?.kind === "orf.read-model.invalidated") {
        onReadModelInvalidationRef.current(payload.invalidation);
      }
    };
    const handleWorkLogReminderRequired = (event: MessageEvent<string>) => {
      const payload = parseRealtimeEvent(event.data);
      if (payload?.kind === "worklog.reminder.required") {
        onWorkLogReminderRequiredRef.current?.(payload);
      }
    };
    const handleWorkLogReminderResolved = (event: MessageEvent<string>) => {
      const payload = parseRealtimeEvent(event.data);
      if (payload?.kind === "worklog.reminder.resolved") {
        onWorkLogReminderResolvedRef.current?.(payload);
      }
    };
    const handleOpen = () => {
      if (closed) return;
      dispatchConnection({ type: "connected" });
    };
    const handleError = () => {
      if (closed) return;
      dispatchConnection({ type: "disconnected" });
    };

    source.addEventListener("open", handleOpen);
    source.addEventListener("error", handleError);
    source.addEventListener("notification.created", handleNotification);
    source.addEventListener("system.broadcast", handleBroadcast);
    source.addEventListener("chat.event", handleChatEvent);
    source.addEventListener("client.update.available", handleClientUpdateAvailable);
    source.addEventListener("orf.read-model.invalidated", handleReadModelInvalidation);
    source.addEventListener("worklog.reminder.required", handleWorkLogReminderRequired);
    source.addEventListener("worklog.reminder.resolved", handleWorkLogReminderResolved);
    return () => {
      closed = true;
      source.removeEventListener("open", handleOpen);
      source.removeEventListener("error", handleError);
      source.removeEventListener("notification.created", handleNotification);
      source.removeEventListener("system.broadcast", handleBroadcast);
      source.removeEventListener("chat.event", handleChatEvent);
      source.removeEventListener("client.update.available", handleClientUpdateAvailable);
      source.removeEventListener("orf.read-model.invalidated", handleReadModelInvalidation);
      source.removeEventListener("worklog.reminder.required", handleWorkLogReminderRequired);
      source.removeEventListener("worklog.reminder.resolved", handleWorkLogReminderResolved);
      source.close();
    };
  }, [enabled]);

  return connectionState;
}

function parseRealtimeEvent(raw: string): RealtimeEvent | null {
  try {
    return JSON.parse(raw) as RealtimeEvent;
  } catch {
    return null;
  }
}
