import { useCallback, useState } from "react";
import {
  getChatThreads,
  getPinnedChatMessages,
  getSavedChatMessages,
  searchChat,
} from "../../state/apiClient";
import type { ChatMessage, ChatSearchResult, ChatThreadSummary } from "../../types/orf";
import { applyThreadSummaryMessage } from "./chatModels";
import type { ActivePanel, ChatSearchScope, ChatSearchTypeFilter } from "./chatPanelTypes";

type UseChatPanelStateInput = {
  activeChannelId?: string | null;
  currentUserId?: string;
  notify: (message: string) => void;
};

type ChatSearchInput = {
  query?: string;
  scope?: ChatSearchScope;
  type?: ChatSearchTypeFilter;
};

export function useChatPanelState({
  activeChannelId,
  currentUserId,
  notify,
}: UseChatPanelStateInput) {
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchScope, setSearchScope] = useState<ChatSearchScope>("all");
  const [searchType, setSearchType] = useState<ChatSearchTypeFilter>("all");
  const [searchResults, setSearchResults] = useState<ChatSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [collectionResults, setCollectionResults] = useState<ChatSearchResult[]>([]);
  const [collectionLoading, setCollectionLoading] = useState(false);
  const [threadSummaries, setThreadSummaries] = useState<ChatThreadSummary[]>([]);
  const [threadSummariesLoading, setThreadSummariesLoading] = useState(false);

  const closePanel = useCallback(() => setActivePanel(null), []);

  const togglePanel = useCallback((panel: Exclude<ActivePanel, null>) => {
    setActivePanel((current) => (current === panel ? null : panel));
  }, []);

  const activateThreadPanel = useCallback(() => {
    setActivePanel("thread");
  }, []);

  const loadPinnedMessages = useCallback(async () => {
    if (!activeChannelId) return;
    setActivePanel("pins");
    setCollectionLoading(true);
    try {
      const response = await getPinnedChatMessages(activeChannelId);
      setCollectionResults(response.results);
    } catch (error) {
      notify(error instanceof Error ? error.message : "加载固定消息失败");
    } finally {
      setCollectionLoading(false);
    }
  }, [activeChannelId, notify]);

  const loadSavedMessages = useCallback(async () => {
    setActivePanel("saved");
    setCollectionLoading(true);
    try {
      const response = await getSavedChatMessages();
      setCollectionResults(response.results);
    } catch (error) {
      notify(error instanceof Error ? error.message : "加载已保存消息失败");
    } finally {
      setCollectionLoading(false);
    }
  }, [notify]);

  const loadThreadSummaries = useCallback(async () => {
    setActivePanel("threads");
    setThreadSummariesLoading(true);
    try {
      const response = await getChatThreads();
      setThreadSummaries(response.threads);
    } catch (error) {
      notify(error instanceof Error ? error.message : "加载话题收件箱失败");
    } finally {
      setThreadSummariesLoading(false);
    }
  }, [notify]);

  const searchMessages = useCallback(
    async (input?: ChatSearchInput) => {
      const value = input?.query ?? searchQuery;
      const scope = input?.scope ?? searchScope;
      const type = input?.type ?? searchType;
      setActivePanel("search");
      if (!value.trim()) {
        setSearchResults([]);
        return;
      }
      setSearchLoading(true);
      try {
        const response = await searchChat({
          q: value,
          channelId: scope === "current" ? activeChannelId ?? undefined : undefined,
          type: type === "all" ? undefined : type,
        });
        setSearchResults(response.results);
      } catch (error) {
        notify(error instanceof Error ? error.message : "搜索聊天失败");
      } finally {
        setSearchLoading(false);
      }
    },
    [activeChannelId, notify, searchQuery, searchScope, searchType],
  );

  const applyPanelMessage = useCallback((message: ChatMessage, threadRootMessageId?: string | null) => {
    setThreadSummaries((items) => applyThreadSummaryMessage(
      items,
      message,
      currentUserId,
      activePanel === "thread" ? threadRootMessageId ?? null : null,
    ));
    setSearchResults((items) => items.map((result) => (result.message.id === message.id ? { ...result, message } : result)));
    setCollectionResults((items) => items.map((result) => (result.message.id === message.id ? { ...result, message } : result)));
  }, [activePanel, currentUserId]);

  const reconcilePinnedCollection = useCallback((message: ChatMessage, wasPinned: boolean) => {
    setCollectionResults((items) => {
      const updated = items.map((result) => (
        result.message.id === message.id ? { ...result, message } : result
      ));
      return activePanel === "pins" && wasPinned ? updated.filter((result) => result.message.id !== message.id) : updated;
    });
  }, [activePanel]);

  const reconcileSavedCollection = useCallback((message: ChatMessage, wasSaved: boolean) => {
    setCollectionResults((items) => {
      const updated = items.map((result) => (
        result.message.id === message.id ? { ...result, message } : result
      ));
      return activePanel === "saved" && wasSaved ? updated.filter((result) => result.message.id !== message.id) : updated;
    });
  }, [activePanel]);

  const markThreadSummaryViewed = useCallback((rootMessageId: string) => {
    setThreadSummaries((items) => items.map((item) => (
      item.rootMessage.id === rootMessageId ? { ...item, unreadCount: 0, lastViewedAt: new Date().toISOString() } : item
    )));
  }, []);

  return {
    activateThreadPanel,
    activePanel,
    applyPanelMessage,
    closePanel,
    collectionLoading,
    collectionResults,
    loadPinnedMessages,
    loadSavedMessages,
    loadThreadSummaries,
    markThreadSummaryViewed,
    reconcilePinnedCollection,
    reconcileSavedCollection,
    searchLoading,
    searchMessages,
    searchQuery,
    searchResults,
    searchScope,
    searchType,
    setSearchQuery,
    setSearchScope,
    setSearchType,
    threadSummaries,
    threadSummariesLoading,
    togglePanel,
  };
}
