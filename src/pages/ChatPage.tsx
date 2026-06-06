import { clsx } from "clsx";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ChatComposer } from "../features/chat/ChatComposer";
import { AttachmentPreview, ChannelModal, ConversationModal, DeleteMessageDialog } from "../features/chat/ChatDialogs";
import { ChatHeader } from "../features/chat/ChatHeader";
import { ChatMessageFeed } from "../features/chat/ChatMessageFeed";
import { ChatRightPanel } from "../features/chat/ChatRightPanel";
import { ChatSidebar } from "../features/chat/ChatSidebar";
import { ChatTypingLine } from "../features/chat/ChatTypingLine";
import {
  type ChatSendInput,
  currentMembership,
  hasStoredDraftForChannel,
  selectChatFeedPrefetchChannelIds,
  serializeDraft,
  sortChannels,
  storedDraftChannelIds,
  upsertChannel,
} from "../features/chat/chatModels";
import { useChatFeedState } from "../features/chat/useChatFeedState";
import { useChatPanelState } from "../features/chat/useChatPanelState";
import { useChatRealtimeEvents } from "../features/chat/useChatRealtimeEvents";
import { useChatThreadState } from "../features/chat/useChatThreadState";
import { useChatTypingState } from "../features/chat/useChatTypingState";
import {
  addChatChannelMembersRequest,
  archiveChatChannelRequest,
  createChatChannel,
  deleteChatMessageRequest,
  getChatBootstrap,
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
import type { ChatAttachment, ChatBootstrap, ChatChannel, ChatMessage, ChatUser } from "../types/orf";

export function ChatPage() {
  const { channelId: routeChannelId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { currentUser, notify } = useOrf();
  const [bootstrap, setBootstrap] = useState<ChatBootstrap | null>(null);
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [channelQuery, setChannelQuery] = useState("");
  const [modal, setModal] = useState<"channel" | "conversation" | null>(null);
  const [draftChannelIds, setDraftChannelIds] = useState<Set<string>>(new Set());
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [deletingMessage, setDeletingMessage] = useState<ChatMessage | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [markingUnreadChannelsRead, setMarkingUnreadChannelsRead] = useState(false);
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
  const canManageChannel = useCallback((channel: ChatChannel | null) => {
    const membership = currentMembership(channel, currentUser?.id);
    return (
      Boolean(bootstrap?.permissions.canManageAnyChannel || bootstrap?.permissions.canManageAnyMembers) ||
      membership?.role === "owner" ||
      membership?.role === "admin"
    );
  }, [bootstrap?.permissions.canManageAnyChannel, bootstrap?.permissions.canManageAnyMembers, currentUser?.id]);
  const canManageActiveChannel = canManageChannel(activeChannel);

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
    reconcilePinnedCollection,
    reconcileSavedCollection,
    searchLoading,
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

  const {
    appendThreadReply,
    applyThreadMessage,
    openThread,
    requestThreadTarget,
    setThread,
    thread,
    threadComposerFocusSignal,
    threadFocusMessageId,
    threadLoading,
  } = useChatThreadState({
    notify,
    onActivateThreadPanel: activateThreadPanel,
    onChannelUpdate: applyChannel,
  });

  const threadChannel = useMemo(() => {
    if (!thread) return null;
    return channels.find((channel) => channel.id === thread.rootMessage.channelId) ?? null;
  }, [channels, thread]);
  const rightPanelChannel = activePanel === "thread" && threadChannel ? threadChannel : activeChannel;
  const rightPanelMentionableUsers = useMemo(() => {
    if (!rightPanelChannel) return [];
    const memberIds = new Set(rightPanelChannel.members.map((member) => member.userId));
    return (bootstrap?.users ?? []).filter((user) => memberIds.has(user.id));
  }, [rightPanelChannel, bootstrap?.users]);
  const canManageRightPanelChannel = canManageChannel(rightPanelChannel);

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
    olderMessagesLoading,
    pendingNewMessageCount,
    prefetchChannelMessages,
    requestScrollToLatest,
    syncLatestMessagesIfFollowing,
    unreadAnchor,
  } = useChatFeedState({
    activeChannel,
    currentUserId: currentUser?.id,
    notify,
    onChannelUpdate: applyChannel,
    onRequestedMessageConsumed: consumeRequestedMessage,
    onRequestedMessageRedirect: redirectRequestedMessage,
    onThreadTarget: requestThreadTarget,
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
    }, index * 80));
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [feedPrefetchChannelKey, prefetchChannelMessages]);

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
          .map((channelId) => markChatChannelReadRequest(channelId)),
      );
      applyChannels(responses.map((response) => response.channel));
      notify(`${uniqueChannelIds.length} 个频道已标记已读`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "批量标记已读失败");
    } finally {
      setMarkingUnreadChannelsRead(false);
    }
  }, [activeChannel?.id, applyChannels, clearActiveChannelUnread, markingUnreadChannelsRead, notify]);

  const handleOpenChannel = useCallback((channelId: string) => {
    if (channelId === activeChannel?.id) return;
    navigate(`/chat/${encodeURIComponent(channelId)}`);
  }, [activeChannel?.id, navigate]);

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

  const handleRealtimeConnectionRestored = useCallback(() => {
    void refreshBootstrap();
    syncLatestMessagesIfFollowing();
  }, [refreshBootstrap, syncLatestMessagesIfFollowing]);

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
        applyRealtimeMessageToFeed(payload.message, applyMessageEffects);
      }
      if (payload.eventType === "typing") applyTypingEvent(payload.channelId, payload.typing);
    },
    { onConnectionRestored: handleRealtimeConnectionRestored },
  );

  const handleSendMessage = useCallback(
    async ({ attachments, channelId, draft, parentMessageId, rootMessageId }: ChatSendInput) => {
      const response = await sendChatMessageRequest({
        channelId,
        body: serializeDraft(draft),
        attachmentIds: attachments.map((attachment) => attachment.id),
        rootMessageId,
        parentMessageId,
      });
      applyChannel(response.channel);
      if (rootMessageId) {
        applyMessage(response.message);
        appendThreadReply(response.message);
      } else if (activeChannel?.id === channelId) {
        if (hasNewerMessages) {
          await loadLatestMessages("auto");
        } else {
          applyMessage(response.message);
          requestScrollToLatest("auto");
        }
      } else {
        applyMessage(response.message);
      }
    },
    [activeChannel?.id, appendThreadReply, applyChannel, applyMessage, hasNewerMessages, loadLatestMessages, requestScrollToLatest],
  );

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

  const handleReaction = useCallback(
    async (message: ChatMessage, emojiName: string) => {
      const currentReaction = message.reactions.find((reaction) => reaction.emojiName === emojiName);
      const response = await setChatReactionRequest({
        channelId: message.channelId,
        messageId: message.id,
        emojiName,
        reacting: !currentReaction?.reactedByCurrentUser,
      });
      applyMessage(response.message);
    },
    [applyMessage],
  );

  const handlePinMessage = useCallback(
    async (message: ChatMessage) => {
      const response = await setChatMessagePinRequest({
        channelId: message.channelId,
        messageId: message.id,
        pinned: !message.pinnedAt,
      });
      applyMessage(response.message);
      reconcilePinnedCollection(response.message, Boolean(message.pinnedAt));
    },
    [applyMessage, reconcilePinnedCollection],
  );

  const handleSaveMessage = useCallback(
    async (message: ChatMessage) => {
      const response = await setChatMessageSavedRequest({
        channelId: message.channelId,
        messageId: message.id,
        saved: !message.savedByCurrentUser,
      });
      applyMessage(response.message);
      reconcileSavedCollection(response.message, message.savedByCurrentUser);
    },
    [applyMessage, reconcileSavedCollection],
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
        markingUnreadChannelsRead={markingUnreadChannelsRead}
        onCreateChannel={() => setModal("channel")}
        onMarkUnreadChannelsRead={handleMarkUnreadChannelsRead}
        onOpenChannel={handleOpenChannel}
        onOpenConversation={() => setModal("conversation")}
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
              onInfo={() => togglePanel("info")}
              onMarkUnread={() => void markActiveChannelUnread()}
              onPins={() => void loadPinnedMessages()}
              onSaved={() => void loadSavedMessages()}
              onSearch={() => togglePanel("search")}
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
              editingMessageId={editingMessage?.id ?? null}
              focusMessageId={focusMessageId}
              hasNewerMessages={hasNewerMessages}
              hasOlderMessages={hasOlderMessages}
              loadingMessages={messagesLoading}
              loadingOlderMessages={olderMessagesLoading}
              mentionableUsers={activeMentionableUsers}
              messages={messages}
              onAttachmentPreview={setAttachmentPreview}
              onCancelEdit={() => setEditingMessage(null)}
              onClearUnread={() => void clearActiveChannelUnread()}
              onCopyLink={handleCopyMessageLink}
              onDelete={setDeletingMessage}
              onEdit={setEditingMessage}
              onJumpUnread={jumpToUnread}
              onLoadLatest={loadLatestOrScroll}
              onLoadOlder={loadOlderMessages}
              onMarkUnread={markMessageUnread}
              onPin={handlePinMessage}
              onReaction={handleReaction}
              onSave={handleSaveMessage}
              onSaveEdit={handleEditMessage}
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
          canManage={canManageRightPanelChannel}
          channel={rightPanelChannel ?? activeChannel}
          currentUserId={currentUser?.id}
          editingMessageId={editingMessage?.id ?? null}
          onDraftStateChange={handleDraftStateChange}
          onAddMembers={async (userIds) => {
            const response = await addChatChannelMembersRequest(activeChannel.id, userIds);
            applyChannel(response.channel);
          }}
          onClose={closePanel}
          onCancelEdit={() => setEditingMessage(null)}
          collectionLoading={collectionLoading}
          collectionResults={collectionResults}
          threadSummaries={threadSummaries}
          threadSummariesLoading={threadSummariesLoading}
          onOpenResult={(result) => {
            navigate(`/chat/${encodeURIComponent(result.channel.id)}?message=${encodeURIComponent(result.message.id)}`);
          }}
          onOpenThreadSummary={(summary) => {
            navigate(`/chat/${encodeURIComponent(summary.channel.id)}?message=${encodeURIComponent(summary.rootMessage.id)}`);
            markThreadSummaryViewed(summary.rootMessage.id);
            void openThread(summary.rootMessage.id);
          }}
          onPin={handlePinMessage}
          onRemoveMember={async (userId) => {
            const response = await removeChatChannelMemberRequest(activeChannel.id, userId);
            if (response.channel) applyChannel(response.channel);
          }}
          onSearch={searchMessages}
          onSave={handleSaveMessage}
          onSaveEdit={handleEditMessage}
          onUpdateChannel={async (input) => {
            const response = await updateChatChannelRequest(activeChannel.id, input);
            applyChannel(response.channel);
          }}
          searchLoading={searchLoading}
          searchPerformed={searchPerformed}
          searchQuery={searchQuery}
          searchScope={searchScope}
          searchResults={searchResults}
          searchType={searchType}
          setSearchQuery={setSearchQuery}
          setSearchScope={setSearchScope}
          setSearchType={setSearchType}
          thread={thread}
          threadComposerFocusSignal={threadComposerFocusSignal}
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
          }}
          onAttachmentPreview={setAttachmentPreview}
          onReaction={handleReaction}
          onEdit={setEditingMessage}
          onMarkUnread={markMessageUnread}
          onDelete={setDeletingMessage}
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
      {deletingMessage && (
        <DeleteMessageDialog
          message={deletingMessage}
          onCancel={() => setDeletingMessage(null)}
          onConfirm={() => void confirmDeleteMessage()}
          submitting={deleteSubmitting}
        />
      )}
      {attachmentPreview && <AttachmentPreview attachment={attachmentPreview} onClose={() => setAttachmentPreview(null)} />}
    </div>
  );
}
