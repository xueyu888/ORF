import { clsx } from "clsx";
import { CheckCheck, ChevronDown, MessageSquare, Plus, Reply, Search } from "lucide-react";
import { useMemo } from "react";
import { IconButton } from "../../components/ui";
import { isChatConversation } from "../../domain/chatConversation";
import type { ChatChannel, ChatUser } from "../../types/orf";
import { chatChannelDisplayLabel, chatChannelSearchText, chatDirectPeer } from "./chatChannelPresentation";
import { formatPresence } from "./chatPresence";
import { currentMembership, isUnreadChannel, sortUnreadChannels } from "./chatModels";
import { ChatGroupAvatar } from "./ChatGroupAvatar";
import { ChatPresenceAvatar } from "./ChatPresenceAvatar";
import { searchChatUsers } from "./chatUserSearch";

type ChatSidebarProps = {
  activeChannelId: string | null;
  channels: ChatChannel[];
  currentUserId?: string;
  draftChannelIds: Set<string>;
  onCreateChannel: () => void;
  onOpenConversationWithUser: (userId: string) => void;
  onMarkUnreadChannelsRead: (channelIds: string[]) => void;
  onOpenChannel: (channelId: string) => void;
  onOpenConversation: () => void;
  onPreviewChannel: (channelId: string) => void;
  query: string;
  setQuery: (value: string) => void;
  markingUnreadChannelsRead: boolean;
  users: ChatUser[];
};

export function ChatSidebar({
  activeChannelId,
  channels,
  currentUserId,
  draftChannelIds,
  onCreateChannel,
  onOpenConversationWithUser,
  onMarkUnreadChannelsRead,
  onOpenChannel,
  onOpenConversation,
  onPreviewChannel,
  query,
  setQuery,
  markingUnreadChannelsRead,
  users,
}: ChatSidebarProps) {
  const normalizedQuery = query.trim().toLowerCase();
  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const filteredChannels = channels.filter((channel) => chatChannelSearchText(channel, currentUserId, usersById).toLowerCase().includes(normalizedQuery));
  const matchedUsers = searchChatUsers(users, query, { excludeUserId: currentUserId });
  const unreadChannels = sortUnreadChannels(filteredChannels.filter((channel) => isUnreadChannel(channel, currentUserId)));
  const unreadChannelIds = new Set(unreadChannels.map((channel) => channel.id));
  const regularChannels = unreadChannelIds.size > 0 ? filteredChannels.filter((channel) => !unreadChannelIds.has(channel.id)) : filteredChannels;
  const favorites = regularChannels.filter((channel) => currentMembership(channel, currentUserId)?.favorite);
  const favoriteChannelIds = new Set(favorites.map((channel) => channel.id));
  const uncategorizedChannels = favoriteChannelIds.size > 0
    ? regularChannels.filter((channel) => !favoriteChannelIds.has(channel.id))
    : regularChannels;
  const publicChannels = uncategorizedChannels.filter((channel) => channel.type === "public");
  const privateChannels = uncategorizedChannels.filter((channel) => channel.type === "private");
  const groupChannels = uncategorizedChannels.filter((channel) => channel.type === "group");
  const conversations = uncategorizedChannels.filter((channel) => channel.type === "direct");
  const channelGroups: Array<{ channels: ChatChannel[]; title: string }> = [
    { title: "未读", channels: unreadChannels },
    { title: "收藏", channels: favorites },
    { title: "公开频道", channels: publicChannels },
    { title: "私有频道", channels: privateChannels },
    { title: "群聊", channels: groupChannels },
    { title: "私信", channels: conversations },
  ];

  return (
    <aside className="orf-chat-sidebar">
      <div className="orf-chat-sidebar-header">
        <div>
          <h2>聊天</h2>
          <span>{users.length} 位成员</span>
        </div>
        <div className="orf-chat-sidebar-actions">
          <IconButton icon={MessageSquare} label="新建私聊/群聊" onClick={onOpenConversation} />
          <IconButton icon={Plus} label="新建频道" onClick={onCreateChannel} />
        </div>
      </div>
      <label className="orf-chat-search-box">
        <Search className="h-4 w-4" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索频道、私信或成员" />
      </label>
      <button type="button" className="orf-chat-new-conversation" onClick={onOpenConversation}>
        <MessageSquare className="h-4 w-4" />
        新建私聊/群聊
      </button>
      <div className="orf-chat-channel-groups">
        {matchedUsers.length > 0 && (
          <UserResultGroup
            currentUserId={currentUserId}
            onOpenConversationWithUser={onOpenConversationWithUser}
            title="成员"
            users={matchedUsers}
          />
        )}
        {channelGroups.map((group) => (
          <ChannelGroup
            activeChannelId={activeChannelId}
            channels={group.channels}
            currentUserId={currentUserId}
            draftChannelIds={draftChannelIds}
            key={group.title}
            markingAllRead={group.title === "未读" && markingUnreadChannelsRead}
            onMarkAllRead={group.title === "未读" ? () => onMarkUnreadChannelsRead(unreadChannels.map((channel) => channel.id)) : undefined}
            onOpenChannel={onOpenChannel}
            onPreviewChannel={onPreviewChannel}
            title={group.title}
            usersById={usersById}
          />
        ))}
        {normalizedQuery && filteredChannels.length === 0 && matchedUsers.length === 0 && (
          <div className="orf-chat-sidebar-empty">没有匹配的频道、私信或成员</div>
        )}
      </div>
    </aside>
  );
}

function ChannelGroup({
  activeChannelId,
  channels,
  currentUserId,
  draftChannelIds,
  markingAllRead,
  onMarkAllRead,
  onOpenChannel,
  onPreviewChannel,
  title,
  usersById,
}: {
  activeChannelId: string | null;
  channels: ChatChannel[];
  currentUserId?: string;
  draftChannelIds: Set<string>;
  markingAllRead?: boolean;
  onMarkAllRead?: () => void;
  onOpenChannel: (channelId: string) => void;
  onPreviewChannel: (channelId: string) => void;
  title: string;
  usersById: Map<string, ChatUser>;
}) {
  if (channels.length === 0) return null;
  return (
    <section className="orf-chat-channel-group">
      <div className="orf-chat-channel-group-title">
        <span>
          <ChevronDown className="h-3.5 w-3.5" />
          {title}
        </span>
        {onMarkAllRead && (
          <button
            type="button"
            className="orf-chat-channel-group-action"
            disabled={markingAllRead}
            title="全部标记已读"
            aria-label="全部标记已读"
            onClick={onMarkAllRead}
          >
            <CheckCheck className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {channels.map((channel) => {
        const membership = currentMembership(channel, currentUserId);
        const directPeer = chatDirectPeer(channel, currentUserId, usersById);
        const isConversation = isChatConversation(channel);
        const label = chatChannelDisplayLabel(channel, currentUserId, usersById);
        const hasUnreadBadge = channel.mentionCount > 0 || channel.unreadCount > 0 || channel.threadUnreadCount > 0;
        const hasDraft = draftChannelIds.has(channel.id);
        return (
          <button
            type="button"
            className={clsx(
              "orf-chat-channel-item",
              channel.id === activeChannelId && "orf-chat-channel-item-active",
              isConversation && "orf-chat-channel-item-conversation",
              membership?.muted && "orf-chat-channel-item-muted",
            )}
            key={channel.id}
            onFocus={() => onPreviewChannel(channel.id)}
            onMouseEnter={() => onPreviewChannel(channel.id)}
            onClick={() => onOpenChannel(channel.id)}
          >
            {directPeer ? (
              <ChatPresenceAvatar className="orf-chat-channel-avatar" currentUserId={currentUserId} name={directPeer.name} size="sm" user={directPeer} />
            ) : (
              <ChatGroupAvatar channel={channel} className="orf-chat-channel-avatar" currentUserId={currentUserId} usersById={usersById} />
            )}
            <span className="truncate">{label}</span>
            {hasUnreadBadge ? (
              <span className="orf-chat-channel-badges">
                {channel.mentionCount > 0 && <strong>@{channel.mentionCount}</strong>}
                {channel.unreadCount > 0 && <b>{channel.unreadCount}</b>}
                {channel.threadUnreadCount > 0 && (
                  <small className="orf-chat-channel-thread-unread" title={`${channel.threadUnreadCount} 条话题未读`}>
                    <Reply className="h-3 w-3" />
                    {channel.threadUnreadCount}
                  </small>
                )}
              </span>
            ) : hasDraft ? <em>草稿</em> : null}
          </button>
        );
      })}
    </section>
  );
}

function UserResultGroup({
  currentUserId,
  onOpenConversationWithUser,
  title,
  users,
}: {
  currentUserId?: string;
  onOpenConversationWithUser: (userId: string) => void;
  title: string;
  users: ChatUser[];
}) {
  return (
    <section className="orf-chat-channel-group">
      <div className="orf-chat-channel-group-title">
        <span>
          <ChevronDown className="h-3.5 w-3.5" />
          {title}
        </span>
      </div>
      <div className="orf-chat-user-results">
        {users.map((user) => (
          <button
            aria-label={`和 ${user.name} 私聊`}
            className="orf-chat-user-result"
            key={user.id}
            type="button"
            onClick={() => onOpenConversationWithUser(user.id)}
          >
            <ChatPresenceAvatar className="orf-chat-channel-avatar" currentUserId={currentUserId} name={user.name} size="sm" user={user} />
            <span className="truncate">{user.name}</span>
            <small>{formatPresence(user, currentUserId)}</small>
            <MessageSquare className="h-4 w-4" />
          </button>
        ))}
      </div>
    </section>
  );
}
