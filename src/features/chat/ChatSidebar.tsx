import { clsx } from "clsx";
import { CheckCheck, ChevronDown, MessageSquare, Plus, Reply, Search } from "lucide-react";
import { IconButton } from "../../components/ui";
import type { ChatChannel, ChatUser } from "../../types/orf";
import { currentMembership, isUnreadChannel, sortUnreadChannels } from "./chatModels";
import { channelIcon } from "./chatChannelPresentation";

type ChatSidebarProps = {
  activeChannelId: string | null;
  channels: ChatChannel[];
  currentUserId?: string;
  draftChannelIds: Set<string>;
  onCreateChannel: () => void;
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
  onMarkUnreadChannelsRead,
  onOpenChannel,
  onOpenConversation,
  onPreviewChannel,
  query,
  setQuery,
  markingUnreadChannelsRead,
  users,
}: ChatSidebarProps) {
  const filteredChannels = channels.filter((channel) => channel.displayName.toLowerCase().includes(query.trim().toLowerCase()));
  const unreadChannels = sortUnreadChannels(filteredChannels.filter((channel) => isUnreadChannel(channel, currentUserId)));
  const unreadChannelIds = new Set(unreadChannels.map((channel) => channel.id));
  const regularChannels = unreadChannelIds.size > 0 ? filteredChannels.filter((channel) => !unreadChannelIds.has(channel.id)) : filteredChannels;
  const favorites = regularChannels.filter((channel) => currentMembership(channel, currentUserId)?.favorite);
  const publicChannels = regularChannels.filter((channel) => channel.type === "public");
  const privateChannels = regularChannels.filter((channel) => channel.type === "private");
  const conversations = regularChannels.filter((channel) => channel.type === "direct" || channel.type === "group");
  const channelGroups: Array<{ channels: ChatChannel[]; title: string }> = [
    { title: "未读", channels: unreadChannels },
    { title: "收藏", channels: favorites },
    { title: "公开频道", channels: publicChannels },
    { title: "私有频道", channels: privateChannels },
    { title: "私信", channels: conversations },
  ];

  return (
    <aside className="orf-chat-sidebar">
      <div className="orf-chat-sidebar-header">
        <div>
          <h2>聊天</h2>
          <span>{users.length} 位成员</span>
        </div>
        <IconButton icon={Plus} label="新建频道" onClick={onCreateChannel} />
      </div>
      <label className="orf-chat-search-box">
        <Search className="h-4 w-4" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="查找频道或私信" />
      </label>
      <button type="button" className="orf-chat-new-conversation" onClick={onOpenConversation}>
        <MessageSquare className="h-4 w-4" />
        新建私聊/群聊
      </button>
      <div className="orf-chat-channel-groups">
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
          />
        ))}
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
        const Icon = channelIcon(channel);
        const membership = currentMembership(channel, currentUserId);
        const hasUnreadBadge = channel.mentionCount > 0 || channel.unreadCount > 0 || channel.threadUnreadCount > 0;
        const hasDraft = draftChannelIds.has(channel.id);
        return (
          <button
            type="button"
            className={clsx(
              "orf-chat-channel-item",
              channel.id === activeChannelId && "orf-chat-channel-item-active",
              membership?.muted && "orf-chat-channel-item-muted",
            )}
            key={channel.id}
            onFocus={() => onPreviewChannel(channel.id)}
            onMouseEnter={() => onPreviewChannel(channel.id)}
            onClick={() => onOpenChannel(channel.id)}
          >
            <Icon className="h-4 w-4" />
            <span className="truncate">{channel.displayName}</span>
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
