import { useCallback, useEffect, useRef, useState } from "react";
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
  const [searchPerformed, setSearchPerformed] = useState(false);
  const [searchFocusSignal, setSearchFocusSignal] = useState(0);
  const [collectionResults, setCollectionResults] = useState<ChatSearchResult[]>([]);
  const [collectionLoading, setCollectionLoading] = useState(false);
  const [threadSummaries, setThreadSummaries] = useState<ChatThreadSummary[]>([]);
  const [threadSummariesLoading, setThreadSummariesLoading] = useState(false);
  const collectionRequestIdRef = useRef(0);
  const searchRequestIdRef = useRef(0);
  const threadSummariesRequestIdRef = useRef(0);
  const pinnedCollectionChannelIdRef = useRef<string | null>(null);
  const currentSearchChannelIdRef = useRef<string | null>(null);

  const closePanel = useCallback(() => setActivePanel(null), []);

  const openSearchPanel = useCallback(() => {
    setActivePanel("search");
    setSearchFocusSignal((signal) => signal + 1);
  }, []);

  const updateSearchQuery = useCallback((value: string) => {
    searchRequestIdRef.current += 1;
    setSearchQuery(value);
    setSearchResults([]);
    setSearchPerformed(false);
    setSearchLoading(false);
  }, []);

  const togglePanel = useCallback((panel: Exclude<ActivePanel, null>) => {
    setActivePanel((current) => (current === panel ? null : panel));
  }, []);

  const activateThreadPanel = useCallback(() => {
    setActivePanel("thread");
  }, []);

  const loadPinnedMessages = useCallback(async () => {
    if (!activeChannelId) return;
    pinnedCollectionChannelIdRef.current = activeChannelId;
    const requestId = collectionRequestIdRef.current + 1;
    collectionRequestIdRef.current = requestId;
    setActivePanel("pins");
    setCollectionResults([]);
    setCollectionLoading(true);
    try {
      const response = await getPinnedChatMessages(activeChannelId);
      if (collectionRequestIdRef.current !== requestId) return;
      setCollectionResults(response.results);
    } catch (error) {
      if (collectionRequestIdRef.current === requestId) {
        notify(error instanceof Error ? error.message : "加载固定消息失败");
      }
    } finally {
      if (collectionRequestIdRef.current === requestId) setCollectionLoading(false);
    }
  }, [activeChannelId, notify]);

  const loadSavedMessages = useCallback(async () => {
    pinnedCollectionChannelIdRef.current = null;
    const requestId = collectionRequestIdRef.current + 1;
    collectionRequestIdRef.current = requestId;
    setActivePanel("saved");
    setCollectionLoading(true);
    try {
      const response = await getSavedChatMessages();
      if (collectionRequestIdRef.current !== requestId) return;
      setCollectionResults(response.results);
    } catch (error) {
      if (collectionRequestIdRef.current === requestId) {
        notify(error instanceof Error ? error.message : "加载已保存消息失败");
      }
    } finally {
      if (collectionRequestIdRef.current === requestId) setCollectionLoading(false);
    }
  }, [notify]);

  const loadThreadSummaries = useCallback(async () => {
    const requestId = threadSummariesRequestIdRef.current + 1;
    threadSummariesRequestIdRef.current = requestId;
    setActivePanel("threads");
    setThreadSummariesLoading(true);
    try {
      const response = await getChatThreads();
      if (threadSummariesRequestIdRef.current !== requestId) return;
      setThreadSummaries(response.threads);
    } catch (error) {
      if (threadSummariesRequestIdRef.current === requestId) {
        notify(error instanceof Error ? error.message : "加载话题收件箱失败");
      }
    } finally {
      if (threadSummariesRequestIdRef.current === requestId) setThreadSummariesLoading(false);
    }
  }, [notify]);

  const searchMessages = useCallback(
    async (input?: ChatSearchInput) => {
      const value = input?.query ?? searchQuery;
      const scope = input?.scope ?? searchScope;
      const type = input?.type ?? searchType;
      const requestId = searchRequestIdRef.current + 1;
      searchRequestIdRef.current = requestId;
      setActivePanel("search");
      if (scope === "current" && !activeChannelId) {
        currentSearchChannelIdRef.current = null;
        setSearchResults([]);
        setSearchPerformed(false);
        setSearchLoading(false);
        return;
      }
      if (!value.trim()) {
        currentSearchChannelIdRef.current = scope === "current" ? activeChannelId ?? null : null;
        setSearchResults([]);
        setSearchPerformed(false);
        setSearchLoading(false);
        return;
      }
      if (scope === "current") {
        setSearchResults([]);
        setSearchPerformed(false);
      }
      currentSearchChannelIdRef.current = scope === "current" ? activeChannelId ?? null : null;
      setSearchLoading(true);
      try {
        const response = await searchChat({
          q: value,
          channelId: scope === "current" ? activeChannelId ?? undefined : undefined,
          type: type === "all" ? undefined : type,
        });
        if (searchRequestIdRef.current !== requestId) return;
        setSearchResults(response.results);
        setSearchPerformed(true);
      } catch (error) {
        if (searchRequestIdRef.current === requestId) {
          notify(error instanceof Error ? error.message : "搜索聊天失败");
        }
      } finally {
        if (searchRequestIdRef.current === requestId) setSearchLoading(false);
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

  const reconcileThreadFollow = useCallback((rootMessageId: string, following: boolean) => {
    if (following) return;
    setThreadSummaries((items) => items.filter((item) => item.rootMessage.id !== rootMessageId));
  }, []);

  const markThreadSummaryViewed = useCallback((rootMessageId: string) => {
    setThreadSummaries((items) => items.map((item) => (
      item.rootMessage.id === rootMessageId ? { ...item, unreadCount: 0, lastViewedAt: new Date().toISOString() } : item
    )));
  }, []);

  useEffect(() => {
    if (activePanel !== "pins") return;
    const channelId = activeChannelId ?? null;
    if (pinnedCollectionChannelIdRef.current === channelId) return;
    if (activeChannelId) {
      void loadPinnedMessages();
      return;
    }
    pinnedCollectionChannelIdRef.current = null;
    collectionRequestIdRef.current += 1;
    setCollectionResults([]);
    setCollectionLoading(false);
  }, [activeChannelId, activePanel, loadPinnedMessages]);

  useEffect(() => {
    if (activePanel !== "search" || searchScope !== "current") return;
    const channelId = activeChannelId ?? null;
    if (currentSearchChannelIdRef.current === channelId) return;
    if (activeChannelId && searchQuery.trim()) {
      void searchMessages({ query: searchQuery, scope: "current", type: searchType });
      return;
    }
    currentSearchChannelIdRef.current = channelId;
    searchRequestIdRef.current += 1;
    setSearchResults([]);
    setSearchPerformed(false);
    setSearchLoading(false);
  }, [activeChannelId, activePanel, searchMessages, searchQuery, searchScope, searchType]);

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
    openSearchPanel,
    reconcilePinnedCollection,
    reconcileSavedCollection,
    reconcileThreadFollow,
    searchLoading,
    searchFocusSignal,
    searchMessages,
    searchPerformed,
    searchQuery,
    searchResults,
    searchScope,
    searchType,
    setSearchQuery: updateSearchQuery,
    setSearchScope,
    setSearchType,
    threadSummaries,
    threadSummariesLoading,
    togglePanel,
  };
}
