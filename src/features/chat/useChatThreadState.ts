import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, getChatThread } from "../../state/apiClient";
import type { ChatChannel, ChatMessage, ChatThread } from "../../types/orf";
import {
  markPendingChatMessageFailed,
  markPendingChatMessageSending,
  removeMessageById,
  replacePendingMessage,
  updatePendingMessageDelivery,
  upsertMessage,
} from "./chatModels";
import type { ChatFeedThreadTarget } from "./useChatFeedState";

type UseChatThreadStateInput = {
  notify: (message: string) => void;
  onActivateThreadPanel: () => void;
  onChannelUpdate: (channel: ChatChannel) => void;
  onUnreadSummaryRefresh: () => Promise<void>;
  onThreadUnavailable?: () => void;
};

export type ChatOpenThreadOptions = {
  focusComposer?: boolean;
  focusMessageId?: string | null;
};

function chatThreadContainsMessage(thread: ChatThread, messageId: string | null | undefined) {
  if (!messageId) return true;
  return thread.rootMessage.id === messageId || thread.replies.some((reply) => reply.id === messageId);
}

export function useChatThreadState({ notify, onActivateThreadPanel, onChannelUpdate, onThreadUnavailable, onUnreadSummaryRefresh }: UseChatThreadStateInput) {
  const [thread, setThread] = useState<ChatThread | null>(null);
  const [threadFocusMessageId, setThreadFocusMessageId] = useState<string | null>(null);
  const [threadComposerFocusRootId, setThreadComposerFocusRootId] = useState<string | null>(null);
  const [threadComposerFocusSignal, setThreadComposerFocusSignal] = useState(0);
  const [threadLoading, setThreadLoading] = useState(false);
  const [pendingThreadTarget, setPendingThreadTarget] = useState<ChatFeedThreadTarget | null>(null);
  const loadingThreadRootIdRef = useRef<string | null>(null);
  const threadRef = useRef<ChatThread | null>(null);
  const threadRequestIdRef = useRef(0);

  useEffect(() => {
    threadRef.current = thread;
  }, [thread]);

  const openThread = useCallback(
    async (rootMessageId: string, options: ChatOpenThreadOptions = {}) => {
      onActivateThreadPanel();
      setThreadFocusMessageId(options.focusMessageId ?? null);
      if (options.focusComposer) {
        setThreadComposerFocusRootId(rootMessageId);
        setThreadComposerFocusSignal((signal) => signal + 1);
      } else {
        setThreadComposerFocusRootId(null);
      }
      const currentThread = threadRef.current;
      if (
        currentThread?.rootMessage.id === rootMessageId &&
        chatThreadContainsMessage(currentThread, options.focusMessageId)
      ) {
        setThreadLoading(false);
        return;
      }
      if (loadingThreadRootIdRef.current === rootMessageId) {
        setThreadLoading(true);
        return;
      }
      const requestId = threadRequestIdRef.current + 1;
      threadRequestIdRef.current = requestId;
      loadingThreadRootIdRef.current = rootMessageId;
      setThread((item) => item?.rootMessage.id === rootMessageId ? item : null);
      setThreadLoading(true);
      try {
        const response = await getChatThread(rootMessageId);
        if (threadRequestIdRef.current !== requestId) return;
        if (response.channel) {
          onChannelUpdate(response.channel);
          void onUnreadSummaryRefresh().catch(() => undefined);
        }
        setThread(response.thread);
      } catch (error) {
        if (threadRequestIdRef.current !== requestId) return;
        setThread(null);
        setThreadFocusMessageId(null);
        setThreadComposerFocusRootId(null);
        if (error instanceof ApiError && [403, 404, 410].includes(error.status)) {
          onThreadUnavailable?.();
        } else {
          notify(error instanceof Error ? error.message : "加载线程失败");
        }
      } finally {
        if (threadRequestIdRef.current === requestId) {
          loadingThreadRootIdRef.current = null;
          setThreadLoading(false);
        }
      }
    },
    [notify, onActivateThreadPanel, onChannelUpdate, onThreadUnavailable, onUnreadSummaryRefresh],
  );

  useEffect(() => {
    if (!pendingThreadTarget) return;
    void openThread(pendingThreadTarget.rootMessageId, { focusMessageId: pendingThreadTarget.focusMessageId });
    setPendingThreadTarget(null);
  }, [openThread, pendingThreadTarget]);

  const applyThreadMessage = useCallback((message: ChatMessage) => {
    setThread((item) => {
      if (!item) return item;
      const isOpenRoot = item.rootMessage.id === message.id;
      const isOpenReply = message.rootMessageId === item.rootMessage.id;
      if (!isOpenRoot && !isOpenReply) return item;
      return {
        ...item,
        rootMessage: isOpenRoot ? message : item.rootMessage,
        replies: isOpenReply
          ? upsertMessage(item.replies, message).filter((reply) => reply.rootMessageId === item.rootMessage.id)
          : item.replies,
      };
    });
  }, []);

  const reconcileOpenThread = useCallback(async () => {
    const rootMessageId = threadRef.current?.rootMessage.id;
    if (!rootMessageId) return;
    const requestId = threadRequestIdRef.current + 1;
    threadRequestIdRef.current = requestId;
    const response = await getChatThread(rootMessageId);
    if (threadRequestIdRef.current !== requestId || threadRef.current?.rootMessage.id !== rootMessageId) return;
    if (response.channel) onChannelUpdate(response.channel);
    setThread(response.thread);
  }, [onChannelUpdate]);

  const appendThreadReply = useCallback((message: ChatMessage) => {
    setThread((item) => {
      if (!item) return item;
      const nextReplies = upsertMessage(item.replies, message).filter((reply) => reply.rootMessageId === item.rootMessage.id);
      const replyExists = item.replies.some((reply) => reply.id === message.id);
      const lastReplyAt =
        !item.rootMessage.lastReplyAt || item.rootMessage.lastReplyAt < message.createdAt
          ? message.createdAt
          : item.rootMessage.lastReplyAt;
      return {
        ...item,
        rootMessage: {
          ...item.rootMessage,
          lastReplyAt,
          replyCount: replyExists ? item.rootMessage.replyCount : item.rootMessage.replyCount + 1,
        },
        replies: nextReplies,
      };
    });
  }, []);

  const resolveThreadPendingMessage = useCallback((pendingMessageId: string, message: ChatMessage) => {
    setThread((item) => {
      if (!item) return item;
      const isOpenRoot = item.rootMessage.id === message.id || item.rootMessage.id === pendingMessageId;
      const isOpenReply = message.rootMessageId === item.rootMessage.id;
      if (!isOpenRoot && !isOpenReply) return item;
      return {
        ...item,
        rootMessage: isOpenRoot ? message : item.rootMessage,
        replies: isOpenReply ? replacePendingMessage(item.replies, pendingMessageId, message) : item.replies,
      };
    });
  }, []);

  const markThreadPendingMessageSending = useCallback((pendingMessageId: string) => {
    setThread((item) => {
      if (!item) return item;
      return {
        ...item,
        rootMessage: item.rootMessage.id === pendingMessageId ? markPendingChatMessageSending(item.rootMessage) : item.rootMessage,
        replies: updatePendingMessageDelivery(item.replies, pendingMessageId, markPendingChatMessageSending),
      };
    });
  }, []);

  const markThreadPendingMessageFailed = useCallback((pendingMessageId: string, error: string) => {
    setThread((item) => {
      if (!item) return item;
      return {
        ...item,
        rootMessage: item.rootMessage.id === pendingMessageId ? markPendingChatMessageFailed(item.rootMessage, error) : item.rootMessage,
        replies: updatePendingMessageDelivery(item.replies, pendingMessageId, (message) => markPendingChatMessageFailed(message, error)),
      };
    });
  }, []);

  const removeThreadPendingMessage = useCallback((pendingMessageId: string) => {
    setThread((item) => {
      if (!item) return item;
      const removingReply = item.replies.some((reply) => reply.id === pendingMessageId);
      return {
        ...item,
        replies: removeMessageById(item.replies, pendingMessageId),
        rootMessage: removingReply
          ? {
              ...item.rootMessage,
              replyCount: Math.max(0, item.rootMessage.replyCount - 1),
            }
          : item.rootMessage,
      };
    });
  }, []);

  return {
    appendThreadReply,
    applyThreadMessage,
    markThreadPendingMessageFailed,
    markThreadPendingMessageSending,
    openThread,
    reconcileOpenThread,
    removeThreadPendingMessage,
    requestThreadTarget: setPendingThreadTarget,
    resolveThreadPendingMessage,
    setThread,
    thread,
    threadComposerFocusRootId,
    threadComposerFocusSignal,
    threadFocusMessageId,
    threadLoading,
  };
}
