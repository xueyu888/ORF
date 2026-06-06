import { useCallback, useEffect, useState } from "react";
import { getChatThread } from "../../state/apiClient";
import type { ChatMessage, ChatThread } from "../../types/orf";
import { upsertMessage } from "./chatModels";
import type { ChatFeedThreadTarget } from "./useChatFeedState";

type UseChatThreadStateInput = {
  notify: (message: string) => void;
  onActivateThreadPanel: () => void;
};

export function useChatThreadState({ notify, onActivateThreadPanel }: UseChatThreadStateInput) {
  const [thread, setThread] = useState<ChatThread | null>(null);
  const [threadFocusMessageId, setThreadFocusMessageId] = useState<string | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [pendingThreadTarget, setPendingThreadTarget] = useState<ChatFeedThreadTarget | null>(null);

  const openThread = useCallback(
    async (rootMessageId: string, focusMessageId?: string | null) => {
      onActivateThreadPanel();
      setThreadFocusMessageId(focusMessageId ?? null);
      setThreadLoading(true);
      try {
        const response = await getChatThread(rootMessageId);
        setThread(response.thread);
      } catch (error) {
        setThread(null);
        setThreadFocusMessageId(null);
        notify(error instanceof Error ? error.message : "加载线程失败");
      } finally {
        setThreadLoading(false);
      }
    },
    [notify, onActivateThreadPanel],
  );

  useEffect(() => {
    if (!pendingThreadTarget) return;
    void openThread(pendingThreadTarget.rootMessageId, pendingThreadTarget.focusMessageId);
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
    threadFocusMessageId,
    threadLoading,
  };
}
