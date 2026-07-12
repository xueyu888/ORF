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
  targetPath: string;
  title: string;
};

export type ChatNativeNotificationDecision =
  | { action: "notify"; notification: ChatNativeNotificationPayload }
  | { action: "skip"; reason: ChatNativeNotificationSkipReason };

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
  if (focus.appFocused) {
    if (event.rootMessageId && focus.activeThreadRootMessageId === event.rootMessageId) {
      return { action: "skip", reason: "active_thread" };
    }
    if (!event.rootMessageId && focus.activeChannelId === event.channelId) {
      return { action: "skip", reason: "active_channel" };
    }
  }
  return {
    action: "notify",
    notification: {
      body: event.notification.body,
      channelId: event.channelId,
      createdAt: event.createdAt,
      id: event.id,
      messageId: event.messageId,
      targetPath: event.notification.targetPath,
      title: event.notification.title,
    },
  };
}
