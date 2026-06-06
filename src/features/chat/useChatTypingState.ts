import { useCallback, useEffect, useRef, useState } from "react";
import { publishChatTypingRequest } from "../../state/apiClient";

const typingPublishThrottleMs = 2500;
const typingExpirySweepMs = 1000;

export type ChatTypingState = {
  expiresAt: string;
  userId: string;
  userName: string;
};

type UseChatTypingStateInput = {
  activeChannelId?: string | null;
  currentUserId?: string;
};

export function useChatTypingState({ activeChannelId, currentUserId }: UseChatTypingStateInput) {
  const [typingByUser, setTypingByUser] = useState<Map<string, ChatTypingState>>(new Map());
  const lastTypingSentAtRef = useRef(0);

  useEffect(() => {
    lastTypingSentAtRef.current = 0;
    setTypingByUser(new Map());
  }, [activeChannelId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      setTypingByUser((items) => {
        const next = new Map(items);
        for (const [userId, typing] of next) {
          if (new Date(typing.expiresAt).getTime() <= now) next.delete(userId);
        }
        return next;
      });
    }, typingExpirySweepMs);
    return () => window.clearInterval(timer);
  }, []);

  const publishTyping = useCallback(() => {
    if (!activeChannelId) return;
    const currentTime = Date.now();
    if (currentTime - lastTypingSentAtRef.current < typingPublishThrottleMs) return;
    lastTypingSentAtRef.current = currentTime;
    void publishChatTypingRequest(activeChannelId).catch(() => undefined);
  }, [activeChannelId]);

  const applyTypingEvent = useCallback(
    (channelId: string, typing?: ChatTypingState) => {
      if (!typing || channelId !== activeChannelId || typing.userId === currentUserId) return;
      setTypingByUser((items) => {
        const next = new Map(items);
        next.set(typing.userId, typing);
        return next;
      });
    },
    [activeChannelId, currentUserId],
  );

  return { applyTypingEvent, publishTyping, typingByUser };
}
