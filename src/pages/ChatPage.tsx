import { clsx } from "clsx";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ChatComposer } from "../features/chat/ChatComposer";
import { AttachmentPreview, ChannelModal, ConversationModal, EditMessageDialog } from "../features/chat/ChatDialogs";
import { ChatHeader } from "../features/chat/ChatHeader";
import { ChatMessageFeed } from "../features/chat/ChatMessageFeed";
import type { ActivePanel, ChatSearchScope, ChatSearchTypeFilter } from "../features/chat/chatPanelTypes";
import { ChatRightPanel } from "../features/chat/ChatRightPanel";
import { ChatSidebar } from "../features/chat/ChatSidebar";
import { ChatTypingLine } from "../features/chat/ChatTypingLine";
import {
  type ChatDraft,
  applyThreadSummaryMessage,
  currentMembership,
  draftFromStoredBody,
  hasStoredDraftForChannel,
  serializeDraft,
  sortChannels,
  storedDraftChannelIds,
  upsertChannel,
  upsertMessage,
} from "../features/chat/chatModels";
import { type ChatFeedThreadTarget, useChatFeedState } from "../features/chat/useChatFeedState";
import { useChatRealtimeEvents } from "../features/chat/useChatRealtimeEvents";
import { useChatTypingState } from "../features/chat/useChatTypingState";
import {
  addChatChannelMembersRequest,
  archiveChatChannelRequest,
  createChatChannel,
  deleteChatMessageRequest,
  getChatBootstrap,
  getChatThread,
  getChatThreads,
  getPinnedChatMessages,
  getSavedChatMessages,
  openChatConversation,
  removeChatChannelMemberRequest,
  searchChat,
  sendChatMessageRequest,
  setChatReactionRequest,
  setChatMessagePinRequest,
  setChatMessageSavedRequest,
  setChatThreadFollowRequest,
  updateChatChannelRequest,
  updateChatMessageRequest,
} from "../state/apiClient";
import { useOrf } from "../state/OrfProvider";
import type { ChatAttachment, ChatBootstrap, ChatChannel, ChatMessage, ChatSearchResult, ChatThread, ChatThreadSummary, ChatUser } from "../types/orf";

export function ChatPage() {
  const { channelId: routeChannelId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { currentUser, notify } = useOrf();
  const [bootstrap, setBootstrap] = useState<ChatBootstrap | null>(null);
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [thread, setThread] = useState<ChatThread | null>(null);
  const [threadFocusMessageId, setThreadFocusMessageId] = useState<string | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [pendingThreadTarget, setPendingThreadTarget] = useState<ChatFeedThreadTarget | null>(null);
  const [loading, setLoading] = useState(true);
  const [channelQuery, setChannelQuery] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchScope, setSearchScope] = useState<ChatSearchScope>("all");
  const [searchType, setSearchType] = useState<ChatSearchTypeFilter>("all");
  const [modal, setModal] = useState<"channel" | "conversation" | null>(null);
  const [searchResults, setSearchResults] = useState<ChatSearchResult[]>([]);
  const [collectionResults, setCollectionResults] = useState<ChatSearchResult[]>([]);
  const [collectionLoading, setCollectionLoading] = useState(false);
  const [threadSummaries, setThreadSummaries] = useState<ChatThreadSummary[]>([]);
  const [threadSummariesLoading, setThreadSummariesLoading] = useState(false);
  const [draftChannelIds, setDraftChannelIds] = useState<Set<string>>(new Set());
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<ChatAttachment | null>(null);
  const activeChannel = routeChannelId ? channels.find((channel) => channel.id === routeChannelId) ?? null : channels[0] ?? null;
  const focusMessageId = searchParams.get("message");
  const usersById = useMemo(() => new Map((bootstrap?.users ?? []).map((user) => [user.id, user])), [bootstrap?.users]);
  const activeMentionableUsers = useMemo(() => {
    if (!activeChannel) return [];
    const memberIds = new Set(activeChannel.members.map((member) => member.userId));
    return (bootstrap?.users ?? []).filter((user) => memberIds.has(user.id));
  }, [activeChannel, bootstrap?.users]);
  const myMembership = currentMembership(activeChannel, currentUser?.id);
  const { applyTypingEvent, publishTyping, typingByUser } = useChatTypingState({
    activeChannelId: activeChannel?.id,
    currentUserId: currentUser?.id,
  });
  const canManageActiveChannel =
    Boolean(bootstrap?.permissions.canManageAnyChannel || bootstrap?.permissions.canManageAnyMembers) ||
    myMembership?.role === "owner" ||
    myMembership?.role === "admin";

  const applyChannel = useCallback((channel: ChatChannel) => {
    setChannels((items) => upsertChannel(items, channel, currentUser?.id));
  }, [currentUser?.id]);

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

  const {
    applyMessageToFeed,
    applyRealtimeMessageToFeed,
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
    olderMessagesLoading,
    pendingNewMessageCount,
    requestScrollToLatest,
    unreadAnchor,
  } = useChatFeedState({
    activeChannel,
    currentUserId: currentUser?.id,
    notify,
    onChannelUpdate: applyChannel,
    onRequestedMessageConsumed: consumeRequestedMessage,
    onRequestedMessageRedirect: redirectRequestedMessage,
    onThreadTarget: setPendingThreadTarget,
    requestedMessageId: focusMessageId,
  });

  const applyMessageEffects = useCallback((message: ChatMessage) => {
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
    setThreadSummaries((items) => applyThreadSummaryMessage(
      items,
      message,
      currentUser?.id,
      activePanel === "thread" ? thread?.rootMessage.id : null,
    ));
    setSearchResults((items) => items.map((result) => (result.message.id === message.id ? { ...result, message } : result)));
    setCollectionResults((items) => items.map((result) => (result.message.id === message.id ? { ...result, message } : result)));
  }, [activePanel, currentUser?.id, thread?.rootMessage.id]);

  const applyMessage = useCallback((message: ChatMessage) => {
    applyMessageToFeed(message);
    applyMessageEffects(message);
  }, [applyMessageEffects, applyMessageToFeed]);

  const refreshBootstrap = useCallback(async () => {
    const data = await getChatBootstrap();
    setBootstrap(data);
    setChannels(sortChannels(data.channels, currentUser?.id));
    return data;
  }, [currentUser?.id]);

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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void refreshBootstrap()
      .catch((error) => {
        if (!cancelled) notify(error instanceof Error ? error.message : "加载聊天失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [notify, refreshBootstrap]);

  useEffect(() => {
    if (loading || channels.length === 0) return;
    const routeChannelExists = routeChannelId ? channels.some((channel) => channel.id === routeChannelId) : false;
    if (!routeChannelId || !routeChannelExists) {
      navigate(`/chat/${encodeURIComponent(channels[0].id)}`, { replace: true });
    }
  }, [channels, loading, navigate, routeChannelId]);

  useEffect(() => {
    setDraftChannelIds(storedDraftChannelIds(channels));
  }, [channels]);

  useChatRealtimeEvents((payload) => {
    if (payload.channel) applyChannel(payload.channel);
    if (payload.eventType === "channel.archived") {
      setChannels((items) => items.filter((channel) => channel.id !== payload.channelId));
      if (payload.channelId === activeChannel?.id) navigate("/chat", { replace: true });
    }
    if (payload.eventType === "member.changed" && payload.channel) {
      applyChannel(payload.channel);
    }
    if (payload.message) {
      applyRealtimeMessageToFeed(payload.message, applyMessageEffects);
    }
    if (payload.eventType === "typing") applyTypingEvent(payload.channelId, payload.typing);
  });

  const openThread = useCallback(
    async (rootMessageId: string, focusMessageId?: string | null) => {
      setActivePanel("thread");
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
    [notify],
  );

  useEffect(() => {
    if (!pendingThreadTarget) return;
    void openThread(pendingThreadTarget.rootMessageId, pendingThreadTarget.focusMessageId);
    setPendingThreadTarget(null);
  }, [openThread, pendingThreadTarget]);

  const handleSendMessage = useCallback(
    async (draft: ChatDraft, attachments: ChatAttachment[], rootMessageId?: string | null, parentMessageId?: string | null) => {
      if (!activeChannel) return;
      const response = await sendChatMessageRequest({
        channelId: activeChannel.id,
        body: serializeDraft(draft),
        attachmentIds: attachments.map((attachment) => attachment.id),
        rootMessageId,
        parentMessageId,
      });
      applyChannel(response.channel);
      if (rootMessageId) {
        setThread((item) => item ? { ...item, replies: upsertMessage(item.replies, response.message) } : item);
      } else {
        if (hasNewerMessages) {
          await loadLatestMessages("smooth");
        } else {
          applyMessage(response.message);
          requestScrollToLatest("smooth");
        }
      }
    },
    [activeChannel, applyChannel, applyMessage, hasNewerMessages, loadLatestMessages, requestScrollToLatest],
  );

  const handleEditMessage = useCallback(
    async (body: string) => {
      if (!activeChannel || !editingMessage) return;
      const response = await updateChatMessageRequest({ channelId: activeChannel.id, messageId: editingMessage.id, body });
      applyMessage(response.message);
      setEditingMessage(null);
    },
    [activeChannel, applyMessage, editingMessage],
  );

  const handleDeleteMessage = useCallback(
    async (message: ChatMessage) => {
      if (!activeChannel) return;
      const response = await deleteChatMessageRequest({ channelId: activeChannel.id, messageId: message.id });
      applyMessage(response.message);
    },
    [activeChannel, applyMessage],
  );

  const handleCopyMessageLink = useCallback(async (message: ChatMessage) => {
    const url = `${window.location.origin}/chat/${encodeURIComponent(message.channelId)}?message=${encodeURIComponent(message.id)}`;
    try {
      await navigator.clipboard.writeText(url);
      notify("已复制消息链接");
    } catch {
      notify(url);
    }
  }, [notify]);

  const handleReaction = useCallback(
    async (message: ChatMessage, emojiName: string) => {
      if (!activeChannel) return;
      const currentReaction = message.reactions.find((reaction) => reaction.emojiName === emojiName);
      const response = await setChatReactionRequest({
        channelId: activeChannel.id,
        messageId: message.id,
        emojiName,
        reacting: !currentReaction?.reactedByCurrentUser,
      });
      applyMessage(response.message);
    },
    [activeChannel, applyMessage],
  );

  const handlePinMessage = useCallback(
    async (message: ChatMessage) => {
      const response = await setChatMessagePinRequest({
        channelId: message.channelId,
        messageId: message.id,
        pinned: !message.pinnedAt,
      });
      applyMessage(response.message);
      setCollectionResults((items) => {
        const updated = items.map((result) => (
          result.message.id === response.message.id ? { ...result, message: response.message } : result
        ));
        return activePanel === "pins" && message.pinnedAt ? updated.filter((result) => result.message.id !== message.id) : updated;
      });
    },
    [activePanel, applyMessage],
  );

  const handleSaveMessage = useCallback(
    async (message: ChatMessage) => {
      const response = await setChatMessageSavedRequest({
        channelId: message.channelId,
        messageId: message.id,
        saved: !message.savedByCurrentUser,
      });
      applyMessage(response.message);
      setCollectionResults((items) => {
        const updated = items.map((result) => (
          result.message.id === response.message.id ? { ...result, message: response.message } : result
        ));
        return activePanel === "saved" && message.savedByCurrentUser ? updated.filter((result) => result.message.id !== message.id) : updated;
      });
    },
    [activePanel, applyMessage],
  );

  const loadPinnedMessages = useCallback(async () => {
    if (!activeChannel) return;
    setActivePanel("pins");
    setCollectionLoading(true);
    try {
      const response = await getPinnedChatMessages(activeChannel.id);
      setCollectionResults(response.results);
    } catch (error) {
      notify(error instanceof Error ? error.message : "加载固定消息失败");
    } finally {
      setCollectionLoading(false);
    }
  }, [activeChannel, notify]);

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

  const handleSearch = useCallback(
    async (input?: { query?: string; scope?: ChatSearchScope; type?: ChatSearchTypeFilter }) => {
      const value = input?.query ?? searchQuery;
      const scope = input?.scope ?? searchScope;
      const type = input?.type ?? searchType;
      if (!value.trim()) {
        setSearchResults([]);
        return;
      }
      setActivePanel("search");
      const response = await searchChat({
        q: value,
        channelId: scope === "current" ? activeChannel?.id : undefined,
        type: type === "all" ? undefined : type,
      });
      setSearchResults(response.results);
    },
    [activeChannel?.id, searchQuery, searchScope, searchType],
  );

  if (loading) {
    return (
      <div className="orf-chat-loading" role="status">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span>正在打开聊天中心</span>
      </div>
    );
  }

  if (!bootstrap?.permissions.canRead) {
    return <div className="orf-chat-empty-page">当前账号没有聊天访问权限。</div>;
  }

  return (
    <div className={clsx("orf-chat-page", activePanel && "orf-chat-page-with-panel")}>
      <ChatSidebar
        activeChannelId={activeChannel?.id ?? null}
        channels={channels}
        currentUserId={currentUser?.id}
        draftChannelIds={draftChannelIds}
        onCreateChannel={() => setModal("channel")}
        onOpenChannel={(channelId) => navigate(`/chat/${encodeURIComponent(channelId)}`)}
        onOpenConversation={() => setModal("conversation")}
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
              onInfo={() => setActivePanel(activePanel === "info" ? null : "info")}
              onMarkUnread={() => void markActiveChannelUnread()}
              onPins={() => void loadPinnedMessages()}
              onSaved={() => void loadSavedMessages()}
              onSearch={() => setActivePanel(activePanel === "search" ? null : "search")}
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
              canPin={canManageActiveChannel}
              currentUserId={currentUser?.id}
              focusMessageId={focusMessageId}
              hasNewerMessages={hasNewerMessages}
              hasOlderMessages={hasOlderMessages}
              loadingMessages={messagesLoading}
              loadingOlderMessages={olderMessagesLoading}
              messages={messages}
              onAttachmentPreview={setAttachmentPreview}
              onCopyLink={handleCopyMessageLink}
              onDelete={handleDeleteMessage}
              onEdit={setEditingMessage}
              onJumpUnread={jumpToUnread}
              onLoadLatest={loadLatestOrScroll}
              onLoadOlder={loadOlderMessages}
              onMarkUnread={markMessageUnread}
              onPin={handlePinMessage}
              onReaction={handleReaction}
              onSave={handleSaveMessage}
              onScroll={handleMessageScroll}
              onThread={openThread}
              pendingNewMessageCount={pendingNewMessageCount}
              scrollRef={messageScrollRef}
              unreadAnchor={unreadAnchor?.channelId === activeChannel.id ? unreadAnchor : null}
              usersById={usersById}
            />
            <ChatTypingLine typingByUser={typingByUser} />
            <ChatComposer
              channelId={activeChannel.id}
              disabled={!bootstrap.permissions.canWrite}
              mentionableUsers={activeMentionableUsers}
              onDraftStateChange={handleDraftStateChange}
              onSend={handleSendMessage}
              onTyping={publishTyping}
            />
          </>
        ) : (
          <div className="orf-chat-empty-channel">还没有可用频道。</div>
        )}
      </section>
      {activeChannel && activePanel && (
        <ChatRightPanel
          activePanel={activePanel}
          allUsers={bootstrap.users}
          canManage={canManageActiveChannel}
          channel={activeChannel}
          currentUserId={currentUser?.id}
          onDraftStateChange={handleDraftStateChange}
          onAddMembers={async (userIds) => {
            const response = await addChatChannelMembersRequest(activeChannel.id, userIds);
            applyChannel(response.channel);
          }}
          onClose={() => setActivePanel(null)}
          collectionLoading={collectionLoading}
          collectionResults={collectionResults}
          threadSummaries={threadSummaries}
          threadSummariesLoading={threadSummariesLoading}
          onOpenResult={(result) => {
            navigate(`/chat/${encodeURIComponent(result.channel.id)}?message=${encodeURIComponent(result.message.id)}`);
          }}
          onOpenThreadSummary={(summary) => {
            navigate(`/chat/${encodeURIComponent(summary.channel.id)}?message=${encodeURIComponent(summary.rootMessage.id)}`);
            setThreadSummaries((items) => items.map((item) => (
              item.rootMessage.id === summary.rootMessage.id ? { ...item, unreadCount: 0, lastViewedAt: new Date().toISOString() } : item
            )));
            void openThread(summary.rootMessage.id);
          }}
          onPin={handlePinMessage}
          onRemoveMember={async (userId) => {
            const response = await removeChatChannelMemberRequest(activeChannel.id, userId);
            if (response.channel) applyChannel(response.channel);
          }}
          onSearch={handleSearch}
          onSave={handleSaveMessage}
          onUpdateChannel={async (input) => {
            const response = await updateChatChannelRequest(activeChannel.id, input);
            applyChannel(response.channel);
          }}
          searchQuery={searchQuery}
          searchScope={searchScope}
          searchResults={searchResults}
          searchType={searchType}
          setSearchQuery={setSearchQuery}
          setSearchScope={setSearchScope}
          setSearchType={setSearchType}
          thread={thread}
          threadFocusMessageId={threadFocusMessageId}
          threadLoading={threadLoading}
          users={activeMentionableUsers}
          usersById={usersById}
          onSendThreadReply={handleSendMessage}
          onTyping={publishTyping}
          onToggleFollow={async (following) => {
            if (!thread) return;
            const response = await setChatThreadFollowRequest(thread.rootMessage.id, following);
            setThread(response.thread);
          }}
          onAttachmentPreview={setAttachmentPreview}
          onReaction={handleReaction}
          onEdit={setEditingMessage}
          onMarkUnread={markMessageUnread}
          onDelete={handleDeleteMessage}
          onCopyLink={handleCopyMessageLink}
        />
      )}
      {modal === "channel" && (
        <ChannelModal
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
          onOpen={async (userIds) => {
            const response = await openChatConversation(userIds);
            applyChannel(response.channel);
            navigate(`/chat/${encodeURIComponent(response.channel.id)}`);
            setModal(null);
          }}
          users={bootstrap.users}
        />
      )}
      {editingMessage && (
        <EditMessageDialog
          draft={draftFromStoredBody(editingMessage.body, usersById)}
          onClose={() => setEditingMessage(null)}
          onSave={(draft) => handleEditMessage(serializeDraft(draft))}
        />
      )}
      {attachmentPreview && <AttachmentPreview attachment={attachmentPreview} onClose={() => setAttachmentPreview(null)} />}
    </div>
  );
}
