import type { ChatRealtimeEvent } from "../../types/realtime";

export type ChatNativeNotificationSkipReason =
  | "active_channel"
  | "active_thread"
  | "missing_current_user"
  | "missing_notification"
  | "not_message_created"
  | "own_message";

export type ChatNativeNotificationFocusState = {
  activeChannelId?: string | null;
  activeThreadRootMessageId?: string | null;
  appFocused: boolean;
};

export type ChatNativeNotificationPayload = {
  body: string;
  channelId: string;
  createdAt: string;
  id: string;
  messageId: string;
  sender?: {
    avatarUrl?: string | null;
    name: string;
    userId?: string | null;
  };
  targetPath: string;
  title: string;
};

export type ChatRealtimeAttentionIntent = {
  body: string;
  createdAt: string;
  eventId: string;
  kind: "chat.direct" | "chat.mention";
  targetPath: string;
  title: string;
};

export type ChatNativeNotificationDecision =
  | { action: "notify"; notification: ChatNativeNotificationPayload }
  | { action: "skip"; reason: ChatNativeNotificationSkipReason };

export function buildChatRealtimeAttentionIntent(input: {
  currentUserId?: string | null;
  event: ChatRealtimeEvent;
  focus: ChatNativeNotificationFocusState;
}): ChatRealtimeAttentionIntent | null {
  const { currentUserId, event, focus } = input;
  if (event.eventType !== "message.created" || !currentUserId || !event.messageId || !event.attention) return null;
  if (event.actorUserId === currentUserId || isChatRealtimeEventActivelyViewed(event, focus)) return null;

  const mention = event.attention.reason === "mention_me" || event.attention.reason === "mention_all";
  return {
    body: event.notification?.body ?? (mention ? "你有一条新的聊天提及" : "你有一条新的私聊消息"),
    createdAt: event.createdAt,
    eventId: event.messageId,
    kind: mention ? "chat.mention" : "chat.direct",
    targetPath: event.attention.targetPath,
    title: event.notification?.title ?? (mention ? "聊天中有人提到你" : "私聊消息"),
  };
}

export function buildChatNativeNotificationDecision(input: {
  currentUserId?: string | null;
  event: ChatRealtimeEvent;
  focus: ChatNativeNotificationFocusState;
}): ChatNativeNotificationDecision {
  const { currentUserId, event, focus } = input;
  if (event.eventType !== "message.created") return { action: "skip", reason: "not_message_created" };
  if (!currentUserId) return { action: "skip", reason: "missing_current_user" };
  if (event.actorUserId === currentUserId) return { action: "skip", reason: "own_message" };
  if (!event.notification || !event.messageId) return { action: "skip", reason: "missing_notification" };
  if (isChatRealtimeEventActivelyViewed(event, focus)) {
    return event.rootMessageId
      ? { action: "skip", reason: "active_thread" }
      : { action: "skip", reason: "active_channel" };
  }
  return {
    action: "notify",
    notification: {
      body: event.notification.body,
      channelId: event.channelId,
      createdAt: event.createdAt,
      id: event.id,
      messageId: event.messageId,
      sender: event.notification.sender ?? {
        avatarUrl: null,
        name: event.notification.title,
        userId: event.actorUserId ?? null,
      },
      targetPath: event.notification.targetPath,
      title: event.notification.title,
    },
  };
}

function isChatRealtimeEventActivelyViewed(event: ChatRealtimeEvent, focus: ChatNativeNotificationFocusState) {
  if (!focus.appFocused) return false;
  if (event.rootMessageId) return focus.activeThreadRootMessageId === event.rootMessageId;
  return focus.activeChannelId === event.channelId;
}
