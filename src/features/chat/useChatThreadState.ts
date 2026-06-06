import { useCallback, useEffect, useRef, useState } from "react";
import { getChatThread } from "../../state/apiClient";
import type { ChatChannel, ChatMessage, ChatThread } from "../../types/orf";
import { upsertMessage } from "./chatModels";
import type { ChatFeedThreadTarget } from "./useChatFeedState";

type UseChatThreadStateInput = {
  notify: (message: string) => void;
  onActivateThreadPanel: () => void;
  onChannelUpdate: (channel: ChatChannel) => void;
};

export type ChatOpenThreadOptions = {
  focusComposer?: boolean;
  focusMessageId?: string | null;
};

export function useChatThreadState({ notify, onActivateThreadPanel, onChannelUpdate }: UseChatThreadStateInput) {
  const [thread, setThread] = useState<ChatThread | null>(null);
  const [threadFocusMessageId, setThreadFocusMessageId] = useState<string | null>(null);
  const [threadComposerFocusSignal, setThreadComposerFocusSignal] = useState(0);
  const [threadLoading, setThreadLoading] = useState(false);
  const [pendingThreadTarget, setPendingThreadTarget] = useState<ChatFeedThreadTarget | null>(null);
  const threadRequestIdRef = useRef(0);

  const openThread = useCallback(
    async (rootMessageId: string, options: ChatOpenThreadOptions = {}) => {
      const requestId = threadRequestIdRef.current + 1;
      threadRequestIdRef.current = requestId;
      onActivateThreadPanel();
      setThreadFocusMessageId(options.focusMessageId ?? null);
      if (options.focusComposer) {
        setThreadComposerFocusSignal((signal) => signal + 1);
      }
      setThread((item) => item?.rootMessage.id === rootMessageId ? item : null);
      setThreadLoading(true);
      try {
        const response = await getChatThread(rootMessageId);
        if (threadRequestIdRef.current !== requestId) return;
        if (response.channel) onChannelUpdate(response.channel);
        setThread(response.thread);
      } catch (error) {
        if (threadRequestIdRef.current !== requestId) return;
        setThread(null);
        setThreadFocusMessageId(null);
        notify(error instanceof Error ? error.message : "加载线程失败");
      } finally {
        if (threadRequestIdRef.current === requestId) setThreadLoading(false);
      }
    },
    [notify, onActivateThreadPanel, onChannelUpdate],
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

  return {
    appendThreadReply,
    applyThreadMessage,
    openThread,
    requestThreadTarget: setPendingThreadTarget,
    setThread,
    thread,
    threadComposerFocusSignal,
    threadFocusMessageId,
    threadLoading,
  };
}
