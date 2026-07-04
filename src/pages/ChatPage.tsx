import { clsx } from "clsx";
import { Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ChatComposer } from "../features/chat/ChatComposer";
import { Button } from "../components/ui";
import { AttachmentPreview, ChannelModal, ConversationModal, DeleteMessageDialog } from "../features/chat/ChatDialogs";
import { ChatHeader } from "../features/chat/ChatHeader";
import {
  createChatAttachmentPreviewState,
  type ChatAttachmentFilePreviewState,
  type ChatAttachmentPreviewHandler,
} from "../features/chat/chatAttachmentPreview";
import { useChatFloatingImagePreview } from "../features/chat/ChatFloatingImagePreview";
import { matchesChatShortcutKey } from "../features/chat/chatKeyboardShortcuts";
import { ChatMessageFeed } from "../features/chat/ChatMessageFeed";
import { ChatRightPanel } from "../features/chat/ChatRightPanel";
import { ChatSidebar, type ChatSidebarCreateCommand } from "../features/chat/ChatSidebar";
import { ChatTypingLine } from "../features/chat/ChatTypingLine";
import type { ChatDriveResourceLinkTarget, ChatDriveResourceSelectionRequest } from "../features/chat/chatDriveResourceLinks";
import { chatPresenceProtocolUpgradeMessage, hasChatPresenceProtocolMismatch } from "../features/chat/chatPresence";
import { resetChatNativeNotificationViewState, setChatNativeNotificationViewState } from "../features/chat/chatNativeNotificationViewState";
import { requestClientUpdateCenterOpen } from "../features/client-updates/clientUpdateCenterEvents";
import { feedbackIssueIdsFromText } from "../features/feedback/model/feedbackIssue";
import {
  chatMessageCopyText,
  chatMessageDeliveryStatus,
  chatMessagePendingSend,
  createPendingChatMessage,
  findMatchingPendingChatMessage,
  type ChatSendInput,
  currentMembership,
  hasStoredDraftForChannel,
  optimisticSetChatMessagePinned,
  optimisticSetChatMessageSaved,
  optimisticToggleChatReaction,
  selectChatFeedPrefetchChannelIds,
  serializeDraft,
  sortChannels,
  storedDraftChannelIds,
  upsertChannel,
} from "../features/chat/chatModels";
import { useChatFeedState } from "../features/chat/useChatFeedState";
import { useChatMobileViewport } from "../features/chat/useChatMobileViewport";
import { useChatPanelState } from "../features/chat/useChatPanelState";
import { useChatRealtimeEvents } from "../features/chat/useChatRealtimeEvents";
import { useChatThreadState } from "../features/chat/useChatThreadState";
import { useChatTypingState } from "../features/chat/useChatTypingState";
import { readModelInvalidationKey } from "../features/realtime/readModelInvalidations";
import {
  addChatChannelMembersRequest,
  archiveChatChannelRequest,
  createChatChannel,
  deleteChatMessageRequest,
  getChatBootstrap,
  getFeedbackReferences,
  markChatChannelReadRequest,
  openChatConversation,
  removeChatChannelMemberRequest,
  sendChatMessageRequest,
  setChatReactionRequest,
  setChatMessagePinRequest,
  setChatMessageSavedRequest,
  setChatThreadFollowRequest,
  updateChatChannelRequest,
  updateChatMessageRequest,
} from "../state/apiClient";
import { useOrf } from "../state/OrfProvider";
import {
  SYSTEM_CONVERSATION_DEFINITIONS,
  isSystemConversationId,
  type ChatBootstrap,
  type ChatChannel,
  type ChatMessage,
  type ChatSearchResult,
  type ChatThread,
  type ChatThreadSummary,
  type ChatUser,
  type Feedback,
} from "../types/orf";

const chatFeedPrefetchDelayMs = 250;
const chatLocatedMessageHighlightMs = 3_200;

function isChatGlobalShortcutEditableTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest("input, textarea, select, [contenteditable]"));
}

function mentionableUsersForChannel(channel: ChatChannel | null, users: ChatUser[] | undefined) {
  if (!channel) return [];
  if (channel.systemKind) return [];
  const allUsers = users ?? [];
  if (channel.type === "public") return allUsers;
  const memberIds = new Set(channel.members.map((member) => member.userId));
  return allUsers.filter((user) => memberIds.has(user.id));
}

type FeedbackReference = Pick<Feedback, "id" | "phenomenon">;

function addFeedbackIdsFromMessage(ids: Set<string>, message: ChatMessage | null | undefined) {
  if (!message?.body) return;
  for (const feedbackId of feedbackIssueIdsFromText(message.body)) {
    ids.add(feedbackId);
  }
}

function collectFeedbackIdsFromSearchResults(ids: Set<string>, results: readonly ChatSearchResult[]) {
  for (const result of results) {
    addFeedbackIdsFromMessage(ids, result.message);
  }
}

function collectFeedbackIdsFromThread(ids: Set<string>, thread: ChatThread | null) {
  if (!thread) return;
  addFeedbackIdsFromMessage(ids, thread.rootMessage);
  for (const reply of thread.replies) {
    addFeedbackIdsFromMessage(ids, reply);
  }
}

function collectFeedbackIdsFromThreadSummaries(ids: Set<string>, summaries: readonly ChatThreadSummary[]) {
  for (const summary of summaries) {
    addFeedbackIdsFromMessage(ids, summary.rootMessage);
  }
}

function mergeFeedbackReferences(...groups: Array<readonly FeedbackReference[]>) {
  const byId = new Map<string, FeedbackReference>();
  for (const group of groups) {
    for (const item of group) {
      byId.set(item.id, { id: item.id, phenomenon: item.phenomenon });
    }
  }
  return Array.from(byId.values());
}

export function ChatPage() {
  const routeParams = useParams();
  const routeSystemConversationId = isSystemConversationId(routeParams.systemConversationId)
    ? routeParams.systemConversationId
    : null;
  const routeChannelId = routeSystemConversationId ? undefined : routeParams.channelId;
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { appAttentionState, currentUser, notify, readModelInvalidations, refreshChatUnreadSummary, state } = useOrf();
  const [bootstrap, setBootstrap] = useState<ChatBootstrap | null>(null);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [feedbackReferences, setFeedbackReferences] = useState<FeedbackReference[]>([]);
  const [loading, setLoading] = useState(true);
  const [channelQuery, setChannelQuery] = useState("");
  const [modal, setModal] = useState<"channel" | "conversation" | null>(null);
  const [draftChannelIds, setDraftChannelIds] = useState<Set<string>>(new Set());
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [deletingMessage, setDeletingMessage] = useState<ChatMessage | null>(null);
  const [reactionPickerRequest, setReactionPickerRequest] = useState<{ messageId: string | null; signal: number }>({
    messageId: null,
    signal: 0,
  });
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [markingUnreadChannelsRead, setMarkingUnreadChannelsRead] = useState(false);
  const [attachmentPreview, setAttachmentPreview] = useState<ChatAttachmentFilePreviewState | null>(null);
  const [driveSelectionRequest, setDriveSelectionRequest] = useState<ChatDriveResourceSelectionRequest | null>(null);
  const [locatedMessageId, setLocatedMessageId] = useState<string | null>(null);
  const [memberSearchFocusSignal, setMemberSearchFocusSignal] = useState(0);
  const driveSelectionRequestIdRef = useRef(0);
  const handledBootstrapInvalidationKeyRef = useRef("");
  const locatedMessageTimerRef = useRef<number | null>(null);
  const openChannelRequestIdRef = useRef(0);
  const { openImagePreview } = useChatFloatingImagePreview();
  const openAttachmentPreview = useCallback<ChatAttachmentPreviewHandler>((attachment, messageAttachments) => {
    const preview = createChatAttachmentPreviewState(messageAttachments, attachment);
    if (preview.kind === "image") {
      openImagePreview(preview);
      return;
    }
    setAttachmentPreview(preview);
  }, [openImagePreview]);
  const mobileViewport = useChatMobileViewport();
  const routeSystemChannel = routeSystemConversationId
    ? channels.find((channel) => channel.systemKind === SYSTEM_CONVERSATION_DEFINITIONS[routeSystemConversationId].stream) ?? null
    : null;
  const routeChannel = routeChannelId ? channels.find((channel) => channel.id === routeChannelId) ?? null : null;
  const activeChannel = routeSystemConversationId ? routeSystemChannel : routeChannel ?? (!mobileViewport && !routeChannelId ? channels[0] ?? null : null);
  const focusMessageId = searchParams.get("message");
  const usersById = useMemo(() => new Map((bootstrap?.users ?? []).map((user) => [user.id, user])), [bootstrap?.users]);
  const activeMentionableUsers = useMemo(() => {
    return mentionableUsersForChannel(activeChannel, bootstrap?.users);
  }, [activeChannel, bootstrap?.users]);
  const usersInvalidationKey = useMemo(() => readModelInvalidationKey(readModelInvalidations, "users"), [readModelInvalidations]);
  const settingsInvalidationKey = useMemo(() => readModelInvalidationKey(readModelInvalidations, "settings"), [readModelInvalidations]);
  const bootstrapInvalidationKey = `${usersInvalidationKey}|${settingsInvalidationKey}`;
  const myMembership = currentMembership(activeChannel, currentUser?.id);
  const { applyTypingEvent, publishTyping, typingByUser } = useChatTypingState({
    activeChannelId: activeChannel?.id,
    currentUserId: currentUser?.id,
  });
  const canManageChannel = useCallback((channel: ChatChannel | null) => {
    const membership = currentMembership(channel, currentUser?.id);
    return (
      Boolean(bootstrap?.permissions.canManageAnyChannel || bootstrap?.permissions.canManageAnyMembers) ||
      membership?.role === "owner" ||
      membership?.role === "admin"
    );
  }, [bootstrap?.permissions.canManageAnyChannel, bootstrap?.permissions.canManageAnyMembers, currentUser?.id]);
  const canManageActiveChannel = activeChannel?.systemKind ? false : canManageChannel(activeChannel);
  const sidebarCreateCommands = useMemo<ChatSidebarCreateCommand[]>(() => {
    if (!bootstrap?.permissions.canRead) return [];
    const commands: ChatSidebarCreateCommand[] = [];
    if (bootstrap.permissions.canCreatePrivateChannel || bootstrap.permissions.canCreatePublicChannel) {
      commands.push({ kind: "channel", onSelect: () => setModal("channel") });
    }
    commands.push({ kind: "conversation", onSelect: () => setModal("conversation") });
    return commands;
  }, [
    bootstrap?.permissions.canCreatePrivateChannel,
    bootstrap?.permissions.canCreatePublicChannel,
    bootstrap?.permissions.canRead,
  ]);

  const applyChannel = useCallback((channel: ChatChannel) => {
    setChannels((items) => upsertChannel(items, channel, currentUser?.id));
  }, [currentUser?.id]);

  const applyChannels = useCallback((nextChannels: ChatChannel[]) => {
    setChannels((items) => nextChannels.reduce((next, channel) => upsertChannel(next, channel, currentUser?.id), items));
  }, [currentUser?.id]);

  const {
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
    openFilesPanel,
    openInfoPanel,
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
    setSearchQuery,
    setSearchScope,
    setSearchType,
    threadSummaries,
    threadSummariesLoading,
    togglePanel,
  } = useChatPanelState({
    activeChannelId: activeChannel?.id,
    currentUserId: currentUser?.id,
    notify,
  });
  const chatMobileView = activePanel ? "panel" : activeChannel ? "channel" : "list";

  const handleOpenDriveResourceLink = useCallback((target: ChatDriveResourceLinkTarget) => {
    if (!activeChannel || activeChannel.systemKind) return;
    driveSelectionRequestIdRef.current += 1;
    setDriveSelectionRequest({
      ...target,
      requestId: driveSelectionRequestIdRef.current,
    });
    openFilesPanel();
  }, [activeChannel, openFilesPanel]);

  const handleDriveSelectionRequestHandled = useCallback((requestId: number) => {
    setDriveSelectionRequest((current) => (current?.requestId === requestId ? null : current));
  }, []);

  useEffect(() => {
    setDriveSelectionRequest(null);
  }, [activeChannel?.id]);

  const {
    appendThreadReply,
    applyThreadMessage,
    markThreadPendingMessageFailed,
    markThreadPendingMessageSending,
    openThread,
    removeThreadPendingMessage,
    requestThreadTarget,
    resolveThreadPendingMessage,
    setThread,
    thread,
    threadComposerFocusRootId,
    threadComposerFocusSignal,
    threadFocusMessageId,
    threadLoading,
  } = useChatThreadState({
    notify,
    onActivateThreadPanel: activateThreadPanel,
    onChannelUpdate: applyChannel,
    onUnreadSummaryRefresh: refreshChatUnreadSummary,
  });

  const threadChannel = useMemo(() => {
    if (!thread) return null;
    return channels.find((channel) => channel.id === thread.rootMessage.channelId) ?? null;
  }, [channels, thread]);
  const rightPanelChannel = activePanel === "thread" && threadChannel ? threadChannel : activeChannel;
  const rightPanelMentionableUsers = useMemo(() => {
    return mentionableUsersForChannel(rightPanelChannel, bootstrap?.users);
  }, [rightPanelChannel, bootstrap?.users]);
  const canManageRightPanelChannel = rightPanelChannel?.systemKind ? false : canManageChannel(rightPanelChannel);

  useEffect(() => {
    setChatNativeNotificationViewState({
      activeChannelId: activeChannel?.id ?? null,
      activeThreadRootMessageId: activePanel === "thread" ? thread?.rootMessage.id ?? null : null,
    });
    return resetChatNativeNotificationViewState;
  }, [activeChannel?.id, activePanel, thread?.rootMessage.id]);

  const consumeRequestedMessage = useCallback(() => {
    setSearchParams((params) => {
      params.delete("message");
      return params;
    }, { replace: true });
  }, [setSearchParams]);

  const redirectRequestedMessage = useCallback((messageId: string) => {
    setSearchParams((params) => {
      params.set("message", messageId);
      return params;
    }, { replace: true });
  }, [setSearchParams]);
  const holdLocatedMessageHighlight = useCallback((messageId: string) => {
    if (locatedMessageTimerRef.current !== null) {
      window.clearTimeout(locatedMessageTimerRef.current);
    }
    setLocatedMessageId(messageId);
    locatedMessageTimerRef.current = window.setTimeout(() => {
      setLocatedMessageId((current) => (current === messageId ? null : current));
      locatedMessageTimerRef.current = null;
    }, chatLocatedMessageHighlightMs);
  }, []);

  useEffect(() => {
    return () => {
      if (locatedMessageTimerRef.current !== null) {
        window.clearTimeout(locatedMessageTimerRef.current);
      }
    };
  }, []);

  const {
    applyMessageToFeed,
    applyPendingMessageToFeed,
    applyRealtimeMessageToFeed,
    clearActiveChannelUnread,
    handleMessageScroll,
    hasNewerMessages,
    hasOlderMessages,
    jumpToUnread,
    loadLatestMessages,
    loadLatestOrScroll,
    loadOlderMessages,
    markActiveChannelUnread,
    markMessageUnread,
    messageScrollRef,
    messages,
    messagesLoading,
    markPendingMessageFailedInFeed,
    markPendingMessageSendingInFeed,
    olderMessagesLoading,
    pendingNewMessageCount,
    prefetchChannelMessages,
    removePendingMessageFromFeed,
    requestScrollToLatest,
    resolvePendingMessageInFeed,
    syncLatestMessagesIfFollowing,
    unreadAnchor,
  } = useChatFeedState({
    activeChannel,
    appAttentionState,
    currentUserId: currentUser?.id,
    notify,
    onChannelUpdate: applyChannel,
    onRequestedMessageConsumed: consumeRequestedMessage,
    onRequestedMessageLocated: holdLocatedMessageHighlight,
    onRequestedMessageRedirect: redirectRequestedMessage,
    onThreadTarget: requestThreadTarget,
    onUnreadSummaryRefresh: refreshChatUnreadSummary,
    requestedMessageId: focusMessageId,
  });
  const feedPrefetchChannelIds = useMemo(
    () => selectChatFeedPrefetchChannelIds({
      activeChannelId: activeChannel?.id,
      channels,
      currentUserId: currentUser?.id,
    }),
    [activeChannel?.id, channels, currentUser?.id],
  );
  const feedPrefetchChannelKey = feedPrefetchChannelIds.join("\n");

  useEffect(() => {
    if (!feedPrefetchChannelKey) return undefined;
    const timers = feedPrefetchChannelKey.split("\n").map((channelId, index) => window.setTimeout(() => {
      void prefetchChannelMessages(channelId);
    }, index * chatFeedPrefetchDelayMs));
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [feedPrefetchChannelKey, prefetchChannelMessages]);

  const visibleFeedbackReferenceIds = useMemo(() => {
    const ids = new Set<string>();
    for (const message of messages) {
      addFeedbackIdsFromMessage(ids, message);
    }
    collectFeedbackIdsFromThread(ids, thread);
    collectFeedbackIdsFromSearchResults(ids, searchResults);
    collectFeedbackIdsFromSearchResults(ids, collectionResults);
    collectFeedbackIdsFromThreadSummaries(ids, threadSummaries);
    return Array.from(ids).sort();
  }, [collectionResults, messages, searchResults, thread, threadSummaries]);
  const visibleFeedbackReferenceKey = visibleFeedbackReferenceIds.join("\n");
  const feedbackLinkItems = useMemo(
    () => mergeFeedbackReferences(feedbackReferences, state.feedback),
    [feedbackReferences, state.feedback],
  );
  const feedbackLinkItemsById = useMemo(
    () => new Map(feedbackLinkItems.map((item) => [item.id, item])),
    [feedbackLinkItems],
  );

  useEffect(() => {
    if (!visibleFeedbackReferenceKey) return undefined;
    const missingFeedbackIds = visibleFeedbackReferenceIds.filter((feedbackId) => !feedbackLinkItemsById.has(feedbackId));
    if (missingFeedbackIds.length === 0) return undefined;

    let cancelled = false;
    void getFeedbackReferences(missingFeedbackIds)
      .then((response) => {
        if (cancelled || response.feedback.length === 0) return;
        setFeedbackReferences((items) => mergeFeedbackReferences(items, response.feedback));
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [feedbackLinkItemsById, visibleFeedbackReferenceIds, visibleFeedbackReferenceKey]);

  const applyMessageEffects = useCallback((message: ChatMessage) => {
    applyThreadMessage(message);
    applyPanelMessage(message, thread?.rootMessage.id);
  }, [applyPanelMessage, applyThreadMessage, thread?.rootMessage.id]);

  const applyMessage = useCallback((message: ChatMessage) => {
    applyMessageToFeed(message);
    applyMessageEffects(message);
  }, [applyMessageEffects, applyMessageToFeed]);

  const refreshBootstrap = useCallback(async () => {
    const data = await getChatBootstrap();
    if (hasChatPresenceProtocolMismatch(data.users)) {
      setBootstrap(null);
      setBootstrapError(chatPresenceProtocolUpgradeMessage);
      setChannels([]);
      requestClientUpdateCenterOpen({ notice: chatPresenceProtocolUpgradeMessage });
      throw new Error(chatPresenceProtocolUpgradeMessage);
    }
    setBootstrap(data);
    setBootstrapError(null);
    setChannels(sortChannels(data.channels, currentUser?.id));
    return data;
  }, [currentUser?.id]);

  useEffect(() => {
    if (!bootstrapInvalidationKey || bootstrapInvalidationKey === "|" || loading || bootstrapError) return;
    if (handledBootstrapInvalidationKeyRef.current === bootstrapInvalidationKey) return;
    handledBootstrapInvalidationKeyRef.current = bootstrapInvalidationKey;
    void refreshBootstrap().catch(() => undefined);
  }, [bootstrapError, bootstrapInvalidationKey, loading, refreshBootstrap]);

  const handleDraftStateChange = useCallback((channelId: string, hasDraft: boolean) => {
    setDraftChannelIds((items) => {
      const next = new Set(items);
      if (hasDraft) {
        next.add(channelId);
      } else if (!hasStoredDraftForChannel(channelId)) {
        next.delete(channelId);
      }
      return next;
    });
  }, []);

  const handleMarkUnreadChannelsRead = useCallback(async (channelIds: string[]) => {
    const uniqueChannelIds = [...new Set(channelIds)];
    if (uniqueChannelIds.length === 0 || markingUnreadChannelsRead) return;
    setMarkingUnreadChannelsRead(true);
    try {
      const activeChannelId = activeChannel?.id ?? null;
      if (activeChannelId && uniqueChannelIds.includes(activeChannelId)) {
        await clearActiveChannelUnread();
      }
      const responses = await Promise.all(
        uniqueChannelIds
          .filter((channelId) => channelId !== activeChannelId)
          .map((channelId) => markChatChannelReadRequest(channelId, { includeThreads: true })),
      );
      applyChannels(responses.map((response) => response.channel));
      await refreshChatUnreadSummary();
      notify(`${uniqueChannelIds.length} 个频道已标记已读`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "批量标记已读失败");
    } finally {
      setMarkingUnreadChannelsRead(false);
    }
  }, [activeChannel?.id, applyChannels, clearActiveChannelUnread, markingUnreadChannelsRead, notify, refreshChatUnreadSummary]);

  const handleOpenMemberSearch = useCallback(() => {
    openInfoPanel();
    setMemberSearchFocusSignal((signal) => signal + 1);
  }, [openInfoPanel]);

  const handleOpenChannel = useCallback((channelId: string) => {
    setLocatedMessageId(null);
    if (channelId === activeChannel?.id) {
      openChannelRequestIdRef.current += 1;
      return;
    }
    const requestId = openChannelRequestIdRef.current + 1;
    openChannelRequestIdRef.current = requestId;
    void prefetchChannelMessages(channelId).finally(() => {
      if (openChannelRequestIdRef.current !== requestId) return;
      navigate(`/chat/${encodeURIComponent(channelId)}`);
    });
  }, [activeChannel?.id, navigate, prefetchChannelMessages]);

  const handleOpenChatResult = useCallback((result: ChatSearchResult) => {
    applyChannel(result.channel);
    setLocatedMessageId(null);
    navigate(`/chat/${encodeURIComponent(result.channel.id)}?message=${encodeURIComponent(result.message.id)}`);
    if (mobileViewport) closePanel();
  }, [applyChannel, closePanel, mobileViewport, navigate]);

  const handleBackToChatList = useCallback(() => {
    openChannelRequestIdRef.current += 1;
    closePanel();
    navigate("/chat");
  }, [closePanel, navigate]);

  const handleOpenConversation = useCallback(async (userIds: string[]) => {
    try {
      const response = await openChatConversation(userIds);
      applyChannel(response.channel);
      navigate(`/chat/${encodeURIComponent(response.channel.id)}`);
      setModal(null);
    } catch (error) {
      notify(error instanceof Error ? error.message : "打开私聊失败");
      throw error;
    }
  }, [applyChannel, navigate, notify]);

  useEffect(() => {
    const handleSearchShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !activeChannel?.id) return;
      if (modal || attachmentPreview || deletingMessage || editingMessage) return;
      if (
        !(event.ctrlKey || event.metaKey) ||
        event.altKey ||
        event.shiftKey ||
        !matchesChatShortcutKey(event, { code: "KeyF", key: "f" })
      ) return;
      if (isChatGlobalShortcutEditableTarget(event.target)) return;
      event.preventDefault();
      openSearchPanel();
    };
    document.addEventListener("keydown", handleSearchShortcut);
    return () => document.removeEventListener("keydown", handleSearchShortcut);
  }, [activeChannel?.id, attachmentPreview, deletingMessage, editingMessage, modal, openSearchPanel]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (deletingMessage) {
        event.preventDefault();
        setDeletingMessage(null);
        return;
      }
      if (attachmentPreview) {
        event.preventDefault();
        setAttachmentPreview(null);
        return;
      }
      if (modal) {
        event.preventDefault();
        setModal(null);
        return;
      }
      if (editingMessage) {
        event.preventDefault();
        setEditingMessage(null);
        return;
      }
      if (activePanel) {
        event.preventDefault();
        closePanel();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [activePanel, attachmentPreview, closePanel, deletingMessage, editingMessage, modal]);

  useEffect(() => {
    if (routeSystemConversationId && activePanel) {
      closePanel();
    }
  }, [activePanel, closePanel, routeSystemConversationId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setBootstrapError(null);
    void refreshBootstrap()
      .catch((error) => {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : "加载聊天失败";
          setBootstrap(null);
          setChannels([]);
          setBootstrapError(message);
          notify(message);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [notify, refreshBootstrap]);

  const handleRetryBootstrap = useCallback(() => {
    setLoading(true);
    setBootstrapError(null);
    void refreshBootstrap()
      .catch((error) => {
        const message = error instanceof Error ? error.message : "加载聊天失败";
        setBootstrap(null);
        setChannels([]);
        setBootstrapError(message);
        notify(message);
      })
      .finally(() => setLoading(false));
  }, [notify, refreshBootstrap]);

  const handleOpenUpdateCenter = useCallback(() => {
    requestClientUpdateCenterOpen({ notice: chatPresenceProtocolUpgradeMessage });
  }, []);

  useEffect(() => {
    if (loading) return;
    if (routeParams.systemConversationId && !routeSystemConversationId) {
      navigate("/chat", { replace: true });
      return;
    }
    if (routeSystemConversationId) {
      if (routeSystemChannel) {
        navigate(`/chat/${encodeURIComponent(routeSystemChannel.id)}`, { replace: true });
      } else {
        navigate("/chat", { replace: true });
      }
      return;
    }
    if (channels.length === 0) {
      return;
    }
    const routeChannelExists = routeChannelId ? channels.some((channel) => channel.id === routeChannelId) : false;
    if (mobileViewport) {
      if (routeChannelId && !routeChannelExists) {
        navigate("/chat", { replace: true });
      }
      return;
    }
    if (!routeChannelId || !routeChannelExists) {
      navigate(`/chat/${encodeURIComponent(channels[0].id)}`, { replace: true });
    }
  }, [
    channels,
    loading,
    mobileViewport,
    navigate,
    routeChannelId,
    routeParams.systemConversationId,
    routeSystemConversationId,
    routeSystemChannel,
  ]);

  useEffect(() => {
    setDraftChannelIds(storedDraftChannelIds(channels));
  }, [channels]);

  const handleRealtimeConnectionRestored = useCallback(() => {
    void refreshBootstrap();
    syncLatestMessagesIfFollowing();
  }, [refreshBootstrap, syncLatestMessagesIfFollowing]);

  const resolveRealtimePendingMessage = useCallback(
    (message: ChatMessage) => {
      const pendingMessage = findMatchingPendingChatMessage(
        [
          ...messages,
          ...(thread ? [thread.rootMessage, ...thread.replies] : []),
        ],
        message,
      );
      if (!pendingMessage) return false;
      resolvePendingMessageInFeed(pendingMessage.id, message);
      resolveThreadPendingMessage(pendingMessage.id, message);
      return true;
    },
    [messages, resolvePendingMessageInFeed, resolveThreadPendingMessage, thread],
  );

  useChatRealtimeEvents(
    (payload) => {
      if (payload.channel) applyChannel(payload.channel);
      if (payload.eventType === "channel.archived") {
        setChannels((items) => items.filter((channel) => channel.id !== payload.channelId));
        if (payload.channelId === activeChannel?.id) navigate("/chat", { replace: true });
      }
      if (payload.eventType === "member.changed" && !payload.channel) {
        setChannels((items) => items.filter((channel) => channel.id !== payload.channelId));
        if (payload.channelId === activeChannel?.id) navigate("/chat", { replace: true });
      }
      if (payload.message) {
        if (!resolveRealtimePendingMessage(payload.message)) {
          applyRealtimeMessageToFeed(payload.message, applyMessageEffects);
        }
      }
      if (payload.eventType === "typing") applyTypingEvent(payload.channelId, payload.typing);
    },
    { onConnectionRestored: handleRealtimeConnectionRestored },
  );

  const submitPendingChatMessage = useCallback(
    (pendingMessage: ChatMessage, options: { loadLatestAfterSuccess?: boolean } = {}) => {
      const pendingSend = chatMessagePendingSend(pendingMessage);
      if (!pendingSend) return;
      markPendingMessageSendingInFeed(pendingSend.channelId, pendingMessage.id);
      markThreadPendingMessageSending(pendingMessage.id);
      void sendChatMessageRequest(pendingSend)
        .then((response) => {
          applyChannel(response.channel);
          resolvePendingMessageInFeed(pendingMessage.id, response.message);
          resolveThreadPendingMessage(pendingMessage.id, response.message);
          if (options.loadLatestAfterSuccess) {
            void loadLatestMessages("auto");
          } else if (!pendingSend.rootMessageId && activeChannel?.id === pendingSend.channelId) {
            requestScrollToLatest("auto");
          }
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : "发送消息失败";
          markPendingMessageFailedInFeed(pendingSend.channelId, pendingMessage.id, message);
          markThreadPendingMessageFailed(pendingMessage.id, message);
        });
    },
    [
      activeChannel?.id,
      applyChannel,
      loadLatestMessages,
      markPendingMessageFailedInFeed,
      markPendingMessageSendingInFeed,
      markThreadPendingMessageFailed,
      markThreadPendingMessageSending,
      requestScrollToLatest,
      resolvePendingMessageInFeed,
      resolveThreadPendingMessage,
    ],
  );

  const handleSendMessage = useCallback(
    async ({ attachments, channelId, draft, parentMessageId, rootMessageId }: ChatSendInput) => {
      if (!currentUser) {
        notify("当前用户不可用，无法发送消息");
        return;
      }
      const sendChannel = channels.find((channel) => channel.id === channelId) ?? null;
      if (sendChannel?.systemKind) {
        notify("系统频道不支持发送普通消息");
        return;
      }
      const body = serializeDraft(draft);
      const pendingSend = {
        channelId,
        body,
        attachmentIds: attachments.map((attachment) => attachment.id),
        rootMessageId,
        parentMessageId,
      };
      const now = new Date().toISOString();
      const pendingMessage = createPendingChatMessage({
        attachments,
        author: {
          ...currentUser,
          presence: {
            active: true,
            connected: true,
            lastActiveAt: now,
            online: true,
            source: "browser",
            state: "active",
          },
        },
        body,
        channelId,
        parentMessageId,
        pendingSend,
        rootMessageId,
      });
      if (rootMessageId) {
        appendThreadReply(pendingMessage);
      } else if (activeChannel?.id === channelId) {
        applyPendingMessageToFeed(pendingMessage);
        requestScrollToLatest("auto");
      } else {
        applyPendingMessageToFeed(pendingMessage);
      }
      submitPendingChatMessage(pendingMessage, {
        loadLatestAfterSuccess: !rootMessageId && activeChannel?.id === channelId && hasNewerMessages,
      });
    },
    [
      activeChannel?.id,
      appendThreadReply,
      applyPendingMessageToFeed,
      currentUser,
      channels,
      hasNewerMessages,
      notify,
      requestScrollToLatest,
      submitPendingChatMessage,
    ],
  );

  const handleRetryPendingMessage = useCallback(
    (message: ChatMessage) => {
      submitPendingChatMessage(message);
    },
    [submitPendingChatMessage],
  );

  const handleRemovePendingMessage = useCallback(
    (message: ChatMessage) => {
      removePendingMessageFromFeed(message.channelId, message.id);
      removeThreadPendingMessage(message.id);
    },
    [removePendingMessageFromFeed, removeThreadPendingMessage],
  );

  const handleReplyToLatestMessage = useCallback(() => {
    const latestRootMessage = [...messages]
      .reverse()
      .find((message) => !message.rootMessageId && !message.deletedAt && !chatMessageDeliveryStatus(message));
    if (latestRootMessage) {
      void openThread(latestRootMessage.id, { focusComposer: true });
    }
  }, [messages, openThread]);

  const handleEditLatestOwnMessage = useCallback(() => {
    const latestOwnRootMessage = [...messages]
      .reverse()
      .find((message) => (
        !message.rootMessageId &&
        !message.deletedAt &&
        !chatMessageDeliveryStatus(message) &&
        message.authorUserId === currentUser?.id
      ));
    if (!latestOwnRootMessage) {
      return;
    }
    requestScrollToLatest("auto");
    setEditingMessage(latestOwnRootMessage);
  }, [currentUser?.id, messages, requestScrollToLatest]);

  const handleReactToLatestMessage = useCallback(() => {
    const latestRootMessage = [...messages]
      .reverse()
      .find((message) => !message.rootMessageId && !message.deletedAt && !chatMessageDeliveryStatus(message));
    if (!latestRootMessage) {
      notify("当前没有可添加表情的消息");
      return;
    }
    requestScrollToLatest("auto");
    window.requestAnimationFrame(() => {
      setReactionPickerRequest((current) => ({
        messageId: latestRootMessage.id,
        signal: current.signal + 1,
      }));
    });
  }, [messages, notify, requestScrollToLatest]);

  const handleEditMessage = useCallback(
    async (message: ChatMessage, body: string) => {
      try {
        const response = await updateChatMessageRequest({ channelId: message.channelId, messageId: message.id, body });
        if (response.channel) applyChannel(response.channel);
        applyMessage(response.message);
        setEditingMessage(null);
      } catch (error) {
        notify(error instanceof Error ? error.message : "编辑消息失败");
        throw error;
      }
    },
    [applyChannel, applyMessage, notify],
  );

  const handleDeleteMessage = useCallback(
    async (message: ChatMessage) => {
      const response = await deleteChatMessageRequest({ channelId: message.channelId, messageId: message.id });
      if (response.channel) applyChannel(response.channel);
      applyMessage(response.message);
    },
    [applyChannel, applyMessage],
  );

  const confirmDeleteMessage = useCallback(async () => {
    if (!deletingMessage || deleteSubmitting) return;
    setDeleteSubmitting(true);
    try {
      await handleDeleteMessage(deletingMessage);
      setDeletingMessage(null);
    } catch (error) {
      notify(error instanceof Error ? error.message : "删除消息失败");
    } finally {
      setDeleteSubmitting(false);
    }
  }, [deleteSubmitting, deletingMessage, handleDeleteMessage, notify]);

  const handleCopyMessageLink = useCallback(async (message: ChatMessage) => {
    const url = `${window.location.origin}/chat/${encodeURIComponent(message.channelId)}?message=${encodeURIComponent(message.id)}`;
    try {
      await navigator.clipboard.writeText(url);
      notify("已复制消息链接");
    } catch {
      notify(url);
    }
  }, [notify]);

  const handleCopyMessage = useCallback(async (message: ChatMessage) => {
    const text = chatMessageCopyText(message);
    if (!text) {
      notify("没有可复制的消息内容");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      notify("已复制消息");
    } catch {
      notify(text);
    }
  }, [notify]);

  const handleReaction = useCallback(
    async (message: ChatMessage, emojiName: string) => {
      const currentReaction = message.reactions.find((reaction) => reaction.emojiName === emojiName);
      const optimisticMessage = optimisticToggleChatReaction(message, emojiName, currentUser?.id);
      applyMessage(optimisticMessage);
      try {
        const response = await setChatReactionRequest({
          channelId: message.channelId,
          messageId: message.id,
          emojiName,
          reacting: !currentReaction?.reactedByCurrentUser,
        });
        applyMessage(response.message);
      } catch (error) {
        applyMessage(message);
        notify(error instanceof Error ? error.message : "更新表情失败");
      }
    },
    [applyMessage, currentUser?.id, notify],
  );

  const handlePinMessage = useCallback(
    async (message: ChatMessage) => {
      const pinned = !message.pinnedAt;
      applyMessage(optimisticSetChatMessagePinned(message, pinned, currentUser?.id));
      try {
        const response = await setChatMessagePinRequest({
          channelId: message.channelId,
          messageId: message.id,
          pinned,
        });
        applyMessage(response.message);
        reconcilePinnedCollection(response.message, Boolean(message.pinnedAt));
      } catch (error) {
        applyMessage(message);
        notify(error instanceof Error ? error.message : "更新固定消息失败");
      }
    },
    [applyMessage, currentUser?.id, notify, reconcilePinnedCollection],
  );

  const handleSaveMessage = useCallback(
    async (message: ChatMessage) => {
      const saved = !message.savedByCurrentUser;
      applyMessage(optimisticSetChatMessageSaved(message, saved));
      try {
        const response = await setChatMessageSavedRequest({
          channelId: message.channelId,
          messageId: message.id,
          saved,
        });
        applyMessage(response.message);
        reconcileSavedCollection(response.message, message.savedByCurrentUser);
      } catch (error) {
        applyMessage(message);
        notify(error instanceof Error ? error.message : "更新保存消息失败");
      }
    },
    [applyMessage, notify, reconcileSavedCollection],
  );

  if (loading) {
    return (
      <div className="orf-chat-loading" role="status">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span>正在打开聊天中心</span>
      </div>
    );
  }

  if (!bootstrap) {
    return (
      <div className="orf-chat-empty-page">
        <span>{bootstrapError ?? "聊天中心加载失败。"}</span>
        {bootstrapError === chatPresenceProtocolUpgradeMessage && (
          <Button type="button" variant="secondary" onClick={handleOpenUpdateCenter}>
            <RefreshCw className="h-4 w-4" />
            打开版本与更新
          </Button>
        )}
        <Button type="button" variant="secondary" onClick={handleRetryBootstrap}>
          <RefreshCw className="h-4 w-4" />
          重新加载
        </Button>
      </div>
    );
  }

  return (
    <div className={clsx("orf-chat-page", activePanel && "orf-chat-page-with-panel")} data-chat-mobile-view={chatMobileView}>
      <ChatSidebar
        activeChannelId={activeChannel?.id ?? null}
        channels={channels}
        createCommands={sidebarCreateCommands}
        currentUserId={currentUser?.id}
        draftChannelIds={draftChannelIds}
        markingUnreadChannelsRead={markingUnreadChannelsRead}
        onMarkUnreadChannelsRead={handleMarkUnreadChannelsRead}
        onOpenChannel={handleOpenChannel}
        onOpenConversationWithUser={(userId) => void handleOpenConversation([userId])}
        onPreviewChannel={(channelId) => void prefetchChannelMessages(channelId)}
        query={channelQuery}
        setQuery={setChannelQuery}
        users={bootstrap.users}
      />
      <section className="orf-chat-main">
        {activeChannel ? (
          <>
            <ChatHeader
              canManage={canManageActiveChannel}
              channel={activeChannel}
              currentUserId={currentUser?.id}
              onArchive={async () => {
                await archiveChatChannelRequest(activeChannel.id);
                setChannels((items) => items.filter((channel) => channel.id !== activeChannel.id));
                navigate("/chat", { replace: true });
              }}
              onFiles={() => togglePanel("files")}
              onInfo={() => togglePanel("info")}
              onMarkUnread={() => void markActiveChannelUnread()}
              onMemberSearch={handleOpenMemberSearch}
              onMobileBack={handleBackToChatList}
              onPins={() => void loadPinnedMessages()}
              onSaved={() => void loadSavedMessages()}
              onSearch={openSearchPanel}
              onThreads={() => void loadThreadSummaries()}
              onToggleFavorite={async () => {
                const response = await updateChatChannelRequest(activeChannel.id, { favorite: !myMembership?.favorite });
                applyChannel(response.channel);
              }}
              onToggleMuted={async () => {
                const response = await updateChatChannelRequest(activeChannel.id, { muted: !myMembership?.muted });
                applyChannel(response.channel);
              }}
              usersById={usersById}
            />
            <ChatMessageFeed
              canDeleteAnyMessage={canManageActiveChannel}
              canPin={canManageActiveChannel}
              currentUserId={currentUser?.id}
              editingMessageId={editingMessage?.id ?? null}
              feedbackItems={feedbackLinkItems}
              focusMessageId={focusMessageId ?? locatedMessageId}
              hasNewerMessages={hasNewerMessages}
              hasOlderMessages={hasOlderMessages}
              loadingMessages={messagesLoading}
              loadingOlderMessages={olderMessagesLoading}
              mentionableUsers={activeMentionableUsers}
              messages={messages}
              onAttachmentPreview={openAttachmentPreview}
              onCancelEdit={() => setEditingMessage(null)}
              onClearUnread={() => void clearActiveChannelUnread()}
              onCopyLink={handleCopyMessageLink}
              onCopyMessage={handleCopyMessage}
              onDelete={setDeletingMessage}
              onDriveResourceLink={handleOpenDriveResourceLink}
              onEdit={setEditingMessage}
              onJumpUnread={jumpToUnread}
              onLoadLatest={loadLatestOrScroll}
              onLoadOlder={loadOlderMessages}
              onMarkUnread={markMessageUnread}
              onOpenThreadInbox={() => void loadThreadSummaries()}
              onPin={handlePinMessage}
              onReaction={handleReaction}
              onRemovePending={handleRemovePendingMessage}
              onRetryPending={handleRetryPendingMessage}
              onSave={handleSaveMessage}
              onSaveEdit={handleEditMessage}
              onScroll={handleMessageScroll}
              onThread={openThread}
              pendingNewMessageCount={pendingNewMessageCount}
              reactionPickerMessageId={reactionPickerRequest.messageId}
              reactionPickerSignal={reactionPickerRequest.signal}
              scrollRef={messageScrollRef}
              unreadAnchor={unreadAnchor?.channelId === activeChannel.id ? unreadAnchor : null}
              usersById={usersById}
            />
            <ChatTypingLine typingByUser={typingByUser} />
            <ChatComposer
              attachmentMaxBytes={bootstrap.settings.attachmentMaxBytes}
              channelId={activeChannel.id}
              disabled={!bootstrap.permissions.canWrite || Boolean(activeChannel.systemKind)}
              feedbackItems={feedbackLinkItems}
              mentionableUsers={activeMentionableUsers}
              onDraftStateChange={handleDraftStateChange}
              onEditLatest={handleEditLatestOwnMessage}
              onReactToLatest={handleReactToLatestMessage}
              onReplyToLatest={handleReplyToLatestMessage}
              onSend={handleSendMessage}
              onTyping={publishTyping}
            />
          </>
        ) : (
          <div className="orf-chat-empty-channel">选择一个频道、私信或系统会话。</div>
        )}
      </section>
      {activeChannel && activePanel && (
        <ChatRightPanel
          activePanel={activePanel}
          allUsers={bootstrap.users}
          attachmentMaxBytes={bootstrap.settings.attachmentMaxBytes}
          canDeleteAnyMessage={canManageRightPanelChannel}
          canManage={canManageRightPanelChannel}
          canWrite={bootstrap.permissions.canWrite && !Boolean((rightPanelChannel ?? activeChannel).systemKind)}
          channel={rightPanelChannel ?? activeChannel}
          currentUserId={currentUser?.id}
          driveSelectionRequest={driveSelectionRequest}
          editingMessageId={editingMessage?.id ?? null}
          feedbackItems={feedbackLinkItems}
          memberSearchFocusSignal={memberSearchFocusSignal}
          onDraftStateChange={handleDraftStateChange}
          onAddMembers={async (userIds) => {
            try {
              const response = await addChatChannelMembersRequest((rightPanelChannel ?? activeChannel).id, userIds);
              applyChannel(response.channel);
            } catch (error) {
              notify(error instanceof Error ? error.message : "添加成员失败");
              throw error;
            }
          }}
          onAnnouncementMessage={applyMessage}
          onChannelUpdated={applyChannel}
          onClose={closePanel}
          onCancelEdit={() => setEditingMessage(null)}
          onDriveResourceLink={handleOpenDriveResourceLink}
          onDriveSelectionRequestHandled={handleDriveSelectionRequestHandled}
          collectionLoading={collectionLoading}
          collectionResults={collectionResults}
          threadSummaries={threadSummaries}
          threadSummariesLoading={threadSummariesLoading}
          onOpenResult={handleOpenChatResult}
          onOpenThreadSummary={(summary) => {
            navigate(`/chat/${encodeURIComponent(summary.channel.id)}?message=${encodeURIComponent(summary.rootMessage.id)}`);
            markThreadSummaryViewed(summary.rootMessage.id);
            void openThread(summary.rootMessage.id);
          }}
          onPin={handlePinMessage}
          onRemoveMember={async (userId) => {
            try {
              const response = await removeChatChannelMemberRequest((rightPanelChannel ?? activeChannel).id, userId);
              if (response.channel) applyChannel(response.channel);
            } catch (error) {
              notify(error instanceof Error ? error.message : "移除成员失败");
              throw error;
            }
          }}
          onSearch={searchMessages}
          onSave={handleSaveMessage}
          onSaveEdit={handleEditMessage}
          onUpdateChannel={async (input) => {
            const response = await updateChatChannelRequest((rightPanelChannel ?? activeChannel).id, input);
            applyChannel(response.channel);
          }}
          notify={notify}
          projects={state.projects}
          searchLoading={searchLoading}
          searchFocusSignal={searchFocusSignal}
          searchPerformed={searchPerformed}
          searchQuery={searchQuery}
          searchScope={searchScope}
          searchResults={searchResults}
          searchType={searchType}
          setSearchQuery={setSearchQuery}
          setSearchScope={setSearchScope}
          setSearchType={setSearchType}
          thread={thread}
          threadComposerFocusSignal={threadComposerFocusRootId === thread?.rootMessage.id ? threadComposerFocusSignal : undefined}
          threadFocusMessageId={threadFocusMessageId}
          threadLoading={threadLoading}
          users={rightPanelMentionableUsers}
          usersById={usersById}
          onSendThreadReply={handleSendMessage}
          onTyping={publishTyping}
          onToggleFollow={async (following) => {
            if (!thread) return;
            const response = await setChatThreadFollowRequest(thread.rootMessage.id, following);
            if (response.channel) applyChannel(response.channel);
            setThread(response.thread);
            reconcileThreadFollow(thread.rootMessage.id, response.thread.following);
            await refreshChatUnreadSummary();
          }}
          onAttachmentPreview={openAttachmentPreview}
          onReaction={handleReaction}
          onRemovePending={handleRemovePendingMessage}
          onRetryPending={handleRetryPendingMessage}
          onEdit={setEditingMessage}
          onMarkUnread={markMessageUnread}
          onDelete={setDeletingMessage}
          onCopyLink={handleCopyMessageLink}
          onCopyMessage={handleCopyMessage}
        />
      )}
      {modal === "channel" && (
        <ChannelModal
          canCreatePrivate={bootstrap.permissions.canCreatePrivateChannel}
          canCreatePublic={bootstrap.permissions.canCreatePublicChannel}
          currentUserId={currentUser?.id}
          onClose={() => setModal(null)}
          onCreate={async (input) => {
            const response = await createChatChannel(input);
            applyChannel(response.channel);
            navigate(`/chat/${encodeURIComponent(response.channel.id)}`);
            setModal(null);
          }}
          users={bootstrap.users}
        />
      )}
      {modal === "conversation" && (
        <ConversationModal
          currentUserId={currentUser?.id}
          onClose={() => setModal(null)}
          onOpen={handleOpenConversation}
          users={bootstrap.users}
        />
      )}
      {deletingMessage && (
        <DeleteMessageDialog
          message={deletingMessage}
          onCancel={() => setDeletingMessage(null)}
          onConfirm={() => void confirmDeleteMessage()}
          submitting={deleteSubmitting}
        />
      )}
      {attachmentPreview && (
        <AttachmentPreview
          onClose={() => setAttachmentPreview(null)}
          preview={attachmentPreview}
        />
      )}
    </div>
  );
}
