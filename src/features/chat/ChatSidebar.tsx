import { clsx } from "clsx";
import type { LucideIcon } from "lucide-react";
import { Bell, CheckCheck, ChevronDown, Hash, Megaphone, MessageSquare, Plus, Reply, Search } from "lucide-react";
import type { KeyboardEvent } from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { isChatConversation } from "../../domain/chatConversation";
import type { ChatChannel, ChatUser } from "../../types/orf";
import { chatChannelDisplayLabel, chatChannelSearchText, chatDirectPeer } from "./chatChannelPresentation";
import { formatPresence } from "./chatPresence";
import { currentMembership, isUnreadChannel, sortUnreadChannels } from "./chatModels";
import { ChatGroupAvatar } from "./ChatGroupAvatar";
import { ChatPresenceAvatar } from "./ChatPresenceAvatar";
import { searchChatUsers } from "./chatUserSearch";

export type ChatSidebarCreateCommand = {
  kind: "channel" | "conversation";
  onSelect: () => void;
};

type ChatSidebarProps = {
  activeChannelId: string | null;
  channels: ChatChannel[];
  createCommands: ChatSidebarCreateCommand[];
  currentUserId?: string;
  draftChannelIds: Set<string>;
  onOpenConversationWithUser: (userId: string) => void;
  onMarkUnreadChannelsRead: (channelIds: string[]) => void;
  onOpenChannel: (channelId: string) => void;
  onPreviewChannel: (channelId: string) => void;
  query: string;
  setQuery: (value: string) => void;
  markingUnreadChannelsRead: boolean;
  users: ChatUser[];
};

export function ChatSidebar({
  activeChannelId,
  channels,
  createCommands,
  currentUserId,
  draftChannelIds,
  onOpenConversationWithUser,
  onMarkUnreadChannelsRead,
  onOpenChannel,
  onPreviewChannel,
  query,
  setQuery,
  markingUnreadChannelsRead,
  users,
}: ChatSidebarProps) {
  const normalizedQuery = query.trim().toLowerCase();
  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const visibleChannels = channels.filter((channel) => chatChannelSearchText(channel, currentUserId, usersById).toLowerCase().includes(normalizedQuery));
  const filteredSystemChannels = visibleChannels.filter((channel) => channel.systemKind);
  const filteredChannels = visibleChannels.filter((channel) => !channel.systemKind);
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
  const conversations = uncategorizedChannels.filter((channel) => channel.type === "direct");
  const channelGroups: Array<{ channels: ChatChannel[]; title: string }> = [
    { title: "未读", channels: unreadChannels },
    { title: "收藏", channels: favorites },
    { title: "公开频道", channels: publicChannels },
    { title: "私有频道", channels: privateChannels },
    { title: "私信", channels: conversations },
  ];

  return (
    <aside className="orf-chat-sidebar" aria-label="聊天列表">
      <div className="orf-chat-sidebar-header">
        <div>
          <span>{users.length} 位成员</span>
        </div>
        <ChatSidebarCreateMenu commands={createCommands} />
      </div>
      <label className="orf-chat-search-box">
        <Search className="h-4 w-4" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索频道、私信或成员" />
      </label>
      <div className="orf-chat-channel-groups">
        <SystemChannelGroup
          activeChannelId={activeChannelId}
          channels={filteredSystemChannels}
          currentUserId={currentUserId}
          onOpenChannel={onOpenChannel}
          onPreviewChannel={onPreviewChannel}
          usersById={usersById}
        />
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
        {normalizedQuery && filteredSystemChannels.length === 0 && filteredChannels.length === 0 && matchedUsers.length === 0 && (
          <div className="orf-chat-sidebar-empty">没有匹配的频道、私信或成员</div>
        )}
      </div>
    </aside>
  );
}

const chatSidebarCreateCommandPresentation: Record<ChatSidebarCreateCommand["kind"], { description: string; icon: LucideIcon; label: string }> = {
  channel: {
    description: "公开或私有频道",
    icon: Hash,
    label: "新建频道",
  },
  conversation: {
    description: "选择成员开始私聊",
    icon: MessageSquare,
    label: "打开私信",
  },
};

function ChatSidebarCreateMenu({ commands }: { commands: ChatSidebarCreateCommand[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();
  const menuItems = () => (
    Array.from(rootRef.current?.querySelectorAll<HTMLButtonElement>("[role='menuitem']") ?? [])
      .filter((item) => !item.disabled)
  );
  const focusTrigger = () => {
    const trigger = rootRef.current?.querySelector<HTMLButtonElement>(".orf-chat-sidebar-create-trigger");
    window.setTimeout(() => trigger?.focus(), 0);
  };
  const focusMenuItem = (index: number) => {
    const items = menuItems();
    if (items.length === 0) return;
    const nextIndex = (index + items.length) % items.length;
    items[nextIndex]?.focus();
  };
  const closeMenu = (restoreTriggerFocus = false) => {
    setOpen(false);
    if (restoreTriggerFocus) focusTrigger();
  };
  const runCommand = (command: ChatSidebarCreateCommand) => {
    setOpen(false);
    command.onSelect();
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    const items = menuItems();
    const currentIndex = items.findIndex((item) => item === target);
    if (event.key === "Escape") {
      if (!open) return;
      event.preventDefault();
      event.stopPropagation();
      closeMenu(true);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      event.stopPropagation();
      if (!open) {
        setOpen(true);
        return;
      }
      focusMenuItem(currentIndex >= 0 ? currentIndex + 1 : 0);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      if (!open) {
        setOpen(true);
        return;
      }
      focusMenuItem(currentIndex >= 0 ? currentIndex - 1 : items.length - 1);
      return;
    }
    if (open && event.key === "Home") {
      event.preventDefault();
      event.stopPropagation();
      focusMenuItem(0);
      return;
    }
    if (open && event.key === "End") {
      event.preventDefault();
      event.stopPropagation();
      focusMenuItem(items.length - 1);
      return;
    }
    if (open && target?.getAttribute("role") === "menuitem" && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      event.stopPropagation();
      target.click();
    }
  };

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!rootRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const timer = window.setTimeout(() => menuItems()[0]?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  if (commands.length === 0) return null;

  return (
    <div className="orf-chat-sidebar-create" ref={rootRef} onKeyDown={handleKeyDown}>
      <button
        aria-controls={open ? menuId : undefined}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="新建"
        className="orf-chat-sidebar-create-trigger"
        title="新建"
        type="button"
        onClick={() => setOpen((value) => !value)}
      >
        <Plus className="h-5 w-5" />
      </button>
      {open && (
        <div className="orf-chat-sidebar-create-menu" id={menuId} role="menu" aria-label="新建聊天内容">
          {commands.map((command) => {
            const presentation = chatSidebarCreateCommandPresentation[command.kind];
            const Icon = presentation.icon;
            return (
              <button key={command.kind} type="button" role="menuitem" onClick={() => runCommand(command)}>
                <Icon className="h-4 w-4" />
                <span>
                  <strong>{presentation.label}</strong>
                  <small>{presentation.description}</small>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SystemChannelGroup({
  activeChannelId,
  channels,
  currentUserId,
  onOpenChannel,
  onPreviewChannel,
  usersById,
}: {
  activeChannelId: string | null;
  channels: ChatChannel[];
  currentUserId?: string;
  onOpenChannel: (channelId: string) => void;
  onPreviewChannel: (channelId: string) => void;
  usersById: Map<string, ChatUser>;
}) {
  if (channels.length === 0) return null;
  return (
    <section className="orf-chat-channel-group">
      <div className="orf-chat-channel-group-title">
        <span>
          <ChevronDown className="h-3.5 w-3.5" />
          系统
        </span>
      </div>
      {channels.map((channel) => {
        const Icon = channel.systemKind === "teamAnnouncement" ? Megaphone : Bell;
        const label = chatChannelDisplayLabel(channel, currentUserId, usersById);
        const unreadCount = channel.unreadCount + channel.threadUnreadCount;
        const badgeText = unreadCount > 99 ? "99+" : String(unreadCount);
        return (
          <button
            type="button"
            className={clsx(
              "orf-chat-channel-item",
              "orf-chat-system-conversation-item",
              channel.id === activeChannelId && "orf-chat-channel-item-active",
            )}
            key={channel.id}
            onFocus={() => onPreviewChannel(channel.id)}
            onMouseEnter={() => onPreviewChannel(channel.id)}
            onClick={() => onOpenChannel(channel.id)}
          >
            <Icon className="h-4 w-4" />
            <span className="truncate">{label}</span>
            {unreadCount > 0 && (
              <span className="orf-chat-channel-badges">
                <b>{badgeText}</b>
              </span>
            )}
          </button>
        );
      })}
    </section>
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
