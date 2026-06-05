import type { AppNotification } from "../../src/types/orf";
import type { ChatRealtimeEvent, OrfReadModelInvalidation, RealtimeEvent, SystemBroadcast } from "../../src/types/realtime";

type RealtimeSubscriber = {
  id: string;
  teamId: string;
  userId: string;
  send: (event: RealtimeEvent) => void;
};

const subscribersByUser = new Map<string, Map<string, RealtimeSubscriber>>();
const subscribersByTeam = new Map<string, Map<string, RealtimeSubscriber>>();

const nowIso = () => new Date().toISOString();
const makeEventId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

function subscriberKey(teamId: string, userId: string) {
  return `${teamId}:${userId}`;
}

function removeSubscriber(subscriber: RealtimeSubscriber) {
  const userSubscribers = subscribersByUser.get(subscriberKey(subscriber.teamId, subscriber.userId));
  userSubscribers?.delete(subscriber.id);
  if (userSubscribers?.size === 0) {
    subscribersByUser.delete(subscriberKey(subscriber.teamId, subscriber.userId));
  }

  const teamSubscribers = subscribersByTeam.get(subscriber.teamId);
  teamSubscribers?.delete(subscriber.id);
  if (teamSubscribers?.size === 0) {
    subscribersByTeam.delete(subscriber.teamId);
  }
}

function deliverRealtimeEvent(subscriber: RealtimeSubscriber, event: RealtimeEvent) {
  try {
    subscriber.send(event);
  } catch {
    removeSubscriber(subscriber);
  }
}

export function subscribeRealtimeEvents(input: {
  id?: string;
  teamId: string;
  userId: string;
  send: (event: RealtimeEvent) => void;
}) {
  const subscriber: RealtimeSubscriber = {
    id: input.id ?? makeEventId("realtime-subscriber"),
    teamId: input.teamId,
    userId: input.userId,
    send: input.send,
  };
  const key = subscriberKey(subscriber.teamId, subscriber.userId);
  const userSubscribers = subscribersByUser.get(key) ?? new Map<string, RealtimeSubscriber>();
  userSubscribers.set(subscriber.id, subscriber);
  subscribersByUser.set(key, userSubscribers);
  const teamSubscribers = subscribersByTeam.get(subscriber.teamId) ?? new Map<string, RealtimeSubscriber>();
  teamSubscribers.set(subscriber.id, subscriber);
  subscribersByTeam.set(subscriber.teamId, teamSubscribers);

  return () => removeSubscriber(subscriber);
}

export function publishRealtimeNotification(teamId: string, notification: AppNotification) {
  publishRealtimeEventToUser(teamId, notification.recipientUserId, {
    id: makeEventId("notification-event"),
    kind: "notification.created",
    createdAt: nowIso(),
    notification,
  });
}

export function publishRealtimeSystemBroadcast(teamId: string, broadcast: SystemBroadcast) {
  publishRealtimeEventToTeam(teamId, {
    id: makeEventId("system-broadcast-event"),
    kind: "system.broadcast",
    createdAt: nowIso(),
    broadcast,
  });
}

export function publishRealtimeReadModelInvalidation(
  teamId: string,
  invalidation: Omit<OrfReadModelInvalidation, "createdAt" | "id"> & Partial<Pick<OrfReadModelInvalidation, "createdAt" | "id">>,
) {
  const createdAt = invalidation.createdAt ?? nowIso();
  const id = invalidation.id ?? makeEventId("orf-read-model-invalidation");
  publishRealtimeEventToTeam(teamId, {
    id,
    kind: "orf.read-model.invalidated",
    createdAt,
    invalidation: {
      ...invalidation,
      id,
      createdAt,
    },
  });
}

export function publishRealtimeChatEvent(teamId: string, recipientUserIds: string[], event: Omit<ChatRealtimeEvent, "createdAt" | "id" | "kind"> & Partial<Pick<ChatRealtimeEvent, "createdAt" | "id">>) {
  const createdAt = event.createdAt ?? nowIso();
  const id = event.id ?? makeEventId("chat-event");
  const payload: ChatRealtimeEvent = {
    ...event,
    id,
    kind: "chat.event",
    createdAt,
  };
  for (const userId of Array.from(new Set(recipientUserIds))) {
    publishRealtimeEventToUser(teamId, userId, payload);
  }
}

export function publishRealtimeEventToUser(teamId: string, userId: string, event: RealtimeEvent) {
  const subscribers = subscribersByUser.get(subscriberKey(teamId, userId));
  if (!subscribers) return;

  for (const subscriber of Array.from(subscribers.values())) {
    deliverRealtimeEvent(subscriber, event);
  }
}

export function publishRealtimeEventToTeam(teamId: string, event: RealtimeEvent) {
  const subscribers = subscribersByTeam.get(teamId);
  if (!subscribers) return;

  for (const subscriber of Array.from(subscribers.values())) {
    deliverRealtimeEvent(subscriber, event);
  }
}

export function realtimeSubscriberCount() {
  return Array.from(subscribersByTeam.values()).reduce((sum, subscribers) => sum + subscribers.size, 0);
}
