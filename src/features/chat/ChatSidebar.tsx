import { clsx } from "clsx";
import { ChevronDown, MessageSquare, Plus, Search } from "lucide-react";
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
  onOpenChannel: (channelId: string) => void;
  onOpenConversation: () => void;
  onPreviewChannel: (channelId: string) => void;
  query: string;
  setQuery: (value: string) => void;
  users: ChatUser[];
};

export function ChatSidebar({
  activeChannelId,
  channels,
  currentUserId,
  draftChannelIds,
  onCreateChannel,
  onOpenChannel,
  onOpenConversation,
  onPreviewChannel,
  query,
  setQuery,
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
  onOpenChannel,
  onPreviewChannel,
  title,
}: {
  activeChannelId: string | null;
  channels: ChatChannel[];
  currentUserId?: string;
  draftChannelIds: Set<string>;
  onOpenChannel: (channelId: string) => void;
  onPreviewChannel: (channelId: string) => void;
  title: string;
}) {
  if (channels.length === 0) return null;
  return (
    <section className="orf-chat-channel-group">
      <div className="orf-chat-channel-group-title">
        <ChevronDown className="h-3.5 w-3.5" />
        {title}
      </div>
      {channels.map((channel) => {
        const Icon = channelIcon(channel);
        const membership = currentMembership(channel, currentUserId);
        const unread = channel.unreadCount + channel.threadUnreadCount;
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
            {channel.mentionCount > 0 ? <strong>@{channel.mentionCount}</strong> : unread > 0 ? <b>{unread}</b> : null}
            {hasDraft && unread === 0 && channel.mentionCount === 0 ? <em>草稿</em> : null}
          </button>
        );
      })}
    </section>
  );
}
