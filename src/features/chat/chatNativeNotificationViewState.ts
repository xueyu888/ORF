export type ChatNativeNotificationViewState = {
  activeChannelId: string | null;
  activeThreadRootMessageId: string | null;
};

const emptyChatNativeNotificationViewState: ChatNativeNotificationViewState = {
  activeChannelId: null,
  activeThreadRootMessageId: null,
};

let currentChatNativeNotificationViewState: ChatNativeNotificationViewState = emptyChatNativeNotificationViewState;

export function setChatNativeNotificationViewState(next: ChatNativeNotificationViewState) {
  currentChatNativeNotificationViewState = next;
}

export function resetChatNativeNotificationViewState() {
  currentChatNativeNotificationViewState = emptyChatNativeNotificationViewState;
}

export function getChatNativeNotificationViewState() {
  return currentChatNativeNotificationViewState;
}
