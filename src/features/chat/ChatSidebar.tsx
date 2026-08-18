import { clsx } from "clsx";
import type { LucideIcon } from "lucide-react";
import { Bell, ChevronDown, ChevronRight, Hash, Megaphone, MessageSquare, Plus, Reply, Search } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ChatChannel, ChatUser } from "../../types/orf";
import { chatChannelDisplayLabel, chatDirectPeer } from "./chatChannelPresentation";
import { formatPresence } from "./chatPresence";
import { currentMembership } from "./chatModels";
import {
  buildChatSidebarNavigation,
  type ChatSidebarAddressBook,
  type ChatSidebarAddressBookChannelSection,
  type ChatSidebarChannelGroupId,
} from "./chatSidebarModel";
import { ChatGroupAvatar } from "./ChatGroupAvatar";
import { ChatPresenceAvatar } from "./ChatPresenceAvatar";

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
  onOpenChannel: (channelId: string) => void;
  onPreviewChannel: (channelId: string) => void;
  query: string;
  setQuery: (value: string) => void;
  users: ChatUser[];
};

type ChatSidebarGroupId = "system" | "addressBook" | ChatSidebarChannelGroupId;

export function ChatSidebar({
  activeChannelId,
  channels,
  createCommands,
  currentUserId,
  draftChannelIds,
  onOpenConversationWithUser,
  onOpenChannel,
  onPreviewChannel,
  query,
  setQuery,
  users,
}: ChatSidebarProps) {
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<ChatSidebarGroupId>>(() => new Set());
  const normalizedQuery = query.trim().toLowerCase();
  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const navigation = useMemo(() => buildChatSidebarNavigation({
    channels,
    currentUserId,
    query,
    users,
  }), [channels, currentUserId, query, users]);
  const toggleGroupCollapsed = (groupId: ChatSidebarGroupId) => {
    setCollapsedGroupIds((items) => {
      const next = new Set(items);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

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
          channels={navigation.systemChannels}
          collapsed={collapsedGroupIds.has("system")}
          currentUserId={currentUserId}
          onOpenChannel={onOpenChannel}
          onPreviewChannel={onPreviewChannel}
          onToggleCollapsed={toggleGroupCollapsed}
          usersById={usersById}
        />
        <ChannelGroup
          activeChannelId={activeChannelId}
          channels={navigation.recent.channels}
          collapsed={collapsedGroupIds.has("recent")}
          currentUserId={currentUserId}
          draftChannelIds={draftChannelIds}
          groupId={navigation.recent.id}
          onOpenChannel={onOpenChannel}
          onPreviewChannel={onPreviewChannel}
          onToggleCollapsed={toggleGroupCollapsed}
          title={navigation.recent.title}
          usersById={usersById}
        />
        <AddressBookGroup
          activeChannelId={activeChannelId}
          addressBook={navigation.addressBook}
          collapsed={collapsedGroupIds.has("addressBook")}
          currentUserId={currentUserId}
          draftChannelIds={draftChannelIds}
          onOpenChannel={onOpenChannel}
          onOpenConversationWithUser={onOpenConversationWithUser}
          onPreviewChannel={onPreviewChannel}
          onToggleCollapsed={toggleGroupCollapsed}
          usersById={usersById}
        />
        {normalizedQuery && !navigation.hasResults && (
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
  collapsed,
  currentUserId,
  onOpenChannel,
  onPreviewChannel,
  onToggleCollapsed,
  usersById,
}: {
  activeChannelId: string | null;
  channels: ChatChannel[];
  collapsed: boolean;
  currentUserId?: string;
  onOpenChannel: (channelId: string) => void;
  onPreviewChannel: (channelId: string) => void;
  onToggleCollapsed: (groupId: ChatSidebarGroupId) => void;
  usersById: Map<string, ChatUser>;
}) {
  if (channels.length === 0) return null;
  return (
    <ChatSidebarGroupSection collapsed={collapsed} groupId="system" title="系统" onToggleCollapsed={onToggleCollapsed}>
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
    </ChatSidebarGroupSection>
  );
}

function ChannelGroup({
  activeChannelId,
  channels,
  collapsed,
  currentUserId,
  draftChannelIds,
  groupId,
  onOpenChannel,
  onPreviewChannel,
  onToggleCollapsed,
  title,
  usersById,
}: {
  activeChannelId: string | null;
  channels: ChatChannel[];
  collapsed: boolean;
  currentUserId?: string;
  draftChannelIds: Set<string>;
  groupId: ChatSidebarGroupId;
  onOpenChannel: (channelId: string) => void;
  onPreviewChannel: (channelId: string) => void;
  onToggleCollapsed: (groupId: ChatSidebarGroupId) => void;
  title: string;
  usersById: Map<string, ChatUser>;
}) {
  if (channels.length === 0) return null;
  return (
    <ChatSidebarGroupSection
      collapsed={collapsed}
      groupId={groupId}
      title={title}
      onToggleCollapsed={onToggleCollapsed}
    >
      <ChannelRows
        activeChannelId={activeChannelId}
        channels={channels}
        currentUserId={currentUserId}
        draftChannelIds={draftChannelIds}
        onOpenChannel={onOpenChannel}
        onPreviewChannel={onPreviewChannel}
        usersById={usersById}
      />
    </ChatSidebarGroupSection>
  );
}

function ChannelRows({
  activeChannelId,
  channels,
  currentUserId,
  draftChannelIds,
  onOpenChannel,
  onPreviewChannel,
  usersById,
}: {
  activeChannelId: string | null;
  channels: ChatChannel[];
  currentUserId?: string;
  draftChannelIds: Set<string>;
  onOpenChannel: (channelId: string) => void;
  onPreviewChannel: (channelId: string) => void;
  usersById: Map<string, ChatUser>;
}) {
  return (
    <>
      {channels.map((channel) => {
        const membership = currentMembership(channel, currentUserId);
        const directPeer = chatDirectPeer(channel, currentUserId, usersById);
        const label = chatChannelDisplayLabel(channel, currentUserId, usersById);
        const hasUnreadBadge = channel.mentionCount > 0 || channel.unreadCount > 0 || channel.threadUnreadCount > 0;
        const hasDraft = draftChannelIds.has(channel.id);
        return (
          <button
            type="button"
            className={clsx(
              "orf-chat-channel-item",
              "orf-chat-channel-item-with-avatar",
              channel.id === activeChannelId && "orf-chat-channel-item-active",
              membership?.muted && "orf-chat-channel-item-muted",
            )}
            key={channel.id}
            onFocus={() => onPreviewChannel(channel.id)}
            onMouseEnter={() => onPreviewChannel(channel.id)}
            onClick={() => onOpenChannel(channel.id)}
          >
            {directPeer ? (
              <ChatPresenceAvatar className="orf-chat-channel-avatar" currentUserId={currentUserId} frame={false} name={directPeer.name} size="sm" user={directPeer} />
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
    </>
  );
}

function AddressBookGroup({
  activeChannelId,
  addressBook,
  collapsed,
  currentUserId,
  draftChannelIds,
  onOpenChannel,
  onOpenConversationWithUser,
  onPreviewChannel,
  onToggleCollapsed,
  usersById,
}: {
  activeChannelId: string | null;
  addressBook: ChatSidebarAddressBook;
  collapsed: boolean;
  currentUserId?: string;
  draftChannelIds: Set<string>;
  onOpenChannel: (channelId: string) => void;
  onOpenConversationWithUser: (userId: string) => void;
  onPreviewChannel: (channelId: string) => void;
  onToggleCollapsed: (groupId: ChatSidebarGroupId) => void;
  usersById: Map<string, ChatUser>;
}) {
  const channelCount = addressBook.channelSections.reduce((total, section) => total + section.channels.length, 0);
  if (addressBook.users.length === 0 && channelCount === 0) return null;
  return (
    <ChatSidebarGroupSection
      collapsed={collapsed}
      groupId="addressBook"
      summary={`${addressBook.users.length} 人 · ${channelCount} 个频道`}
      title={addressBook.title}
      onToggleCollapsed={onToggleCollapsed}
    >
      <div className="orf-chat-address-book">
        {addressBook.users.length > 0 && (
          <AddressBookSection title="成员">
            <UserRows
              currentUserId={currentUserId}
              onOpenConversationWithUser={onOpenConversationWithUser}
              users={addressBook.users}
            />
          </AddressBookSection>
        )}
        {addressBook.channelSections.map((section) => (
          <AddressBookChannelSection
            activeChannelId={activeChannelId}
            currentUserId={currentUserId}
            draftChannelIds={draftChannelIds}
            key={section.id}
            onOpenChannel={onOpenChannel}
            onPreviewChannel={onPreviewChannel}
            section={section}
            usersById={usersById}
          />
        ))}
      </div>
    </ChatSidebarGroupSection>
  );
}

function AddressBookChannelSection({
  activeChannelId,
  currentUserId,
  draftChannelIds,
  onOpenChannel,
  onPreviewChannel,
  section,
  usersById,
}: {
  activeChannelId: string | null;
  currentUserId?: string;
  draftChannelIds: Set<string>;
  onOpenChannel: (channelId: string) => void;
  onPreviewChannel: (channelId: string) => void;
  section: ChatSidebarAddressBookChannelSection;
  usersById: Map<string, ChatUser>;
}) {
  if (section.channels.length === 0) return null;
  return (
    <AddressBookSection title={section.title}>
      <ChannelRows
        activeChannelId={activeChannelId}
        channels={section.channels}
        currentUserId={currentUserId}
        draftChannelIds={draftChannelIds}
        onOpenChannel={onOpenChannel}
        onPreviewChannel={onPreviewChannel}
        usersById={usersById}
      />
    </AddressBookSection>
  );
}

function AddressBookSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <div className="orf-chat-address-book-section">
      <div className="orf-chat-address-book-section-title">{title}</div>
      <div className="orf-chat-address-book-section-items">{children}</div>
    </div>
  );
}

function UserRows({
  currentUserId,
  onOpenConversationWithUser,
  users,
}: {
  currentUserId?: string;
  onOpenConversationWithUser: (userId: string) => void;
  users: ChatUser[];
}) {
  return (
    <div className="orf-chat-user-results">
      {users.map((user) => (
        <button
          aria-label={`和 ${user.name} 私聊`}
          className="orf-chat-user-result"
          key={user.id}
          type="button"
          onClick={() => onOpenConversationWithUser(user.id)}
        >
          <ChatPresenceAvatar className="orf-chat-channel-avatar" currentUserId={currentUserId} frame={false} name={user.name} size="sm" user={user} />
          <span className="truncate">{user.name}</span>
          <small>{formatPresence(user, currentUserId)}</small>
          <MessageSquare className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}

function ChatSidebarGroupSection({
  children,
  collapsed,
  groupId,
  onToggleCollapsed,
  summary,
  title,
}: {
  children: ReactNode;
  collapsed: boolean;
  groupId: ChatSidebarGroupId;
  onToggleCollapsed: (groupId: ChatSidebarGroupId) => void;
  summary?: string;
  title: string;
}) {
  const contentId = useId();
  const expanded = !collapsed;
  const Icon = expanded ? ChevronDown : ChevronRight;
  return (
    <section className="orf-chat-channel-group" data-collapsed={collapsed ? "true" : "false"}>
      <div className="orf-chat-channel-group-title">
        <button
          type="button"
          className="orf-chat-channel-group-toggle"
          aria-controls={contentId}
          aria-expanded={expanded}
          title={expanded ? `收起${title}` : `展开${title}`}
          onClick={() => onToggleCollapsed(groupId)}
        >
          <Icon className="h-3.5 w-3.5" />
          <span className="truncate">{title}</span>
        </button>
        {summary && <span className="orf-chat-channel-group-summary">{summary}</span>}
      </div>
      <div className="orf-chat-channel-group-items" id={contentId} hidden={collapsed}>
        {children}
      </div>
    </section>
  );
}
