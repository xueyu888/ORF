import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Archive, ArrowLeft, Bell, BellOff, Bookmark, EyeOff, Folder, Inbox, Info, MoreHorizontal, Pin, Reply, Search, Star, Trash2, UserPlus, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { IconButton, actionButtonClassName } from "../../components/ui";
import { isChatConversation } from "../../domain/chatConversation";
import type { ChatChannel, ChatUser } from "../../types/orf";
import { ChatIntegrationBrandMark, chatChannelIntegrationBrand } from "./chatIntegrationBrand";
import { channelIcon, chatChannelDisplayLabel, chatChannelInfoLabel, chatChannelMemberNamePreview } from "./chatChannelPresentation";
import { currentMembership } from "./chatModels";
import type { ActivePanel } from "./chatPanelTypes";

type ChatHeaderProps = {
  activePanel: ActivePanel;
  canManage: boolean;
  channel: ChatChannel;
  currentUserId?: string;
  hasDraft: boolean;
  onArchive: () => void;
  onClearDraft: () => void;
  onInfo: () => void;
  onFiles: () => void;
  onMarkUnread: () => void;
  onMemberSearch: () => void;
  onMobileBack?: () => void;
  onPins: () => void;
  projectFeedbackHref?: string;
  onSaved: () => void;
  onSearch: () => void;
  onThreads: () => void;
  onToggleFavorite: () => void;
  onToggleMuted: () => void;
  usersById: Map<string, ChatUser>;
};

export function ChatHeader({
  activePanel,
  canManage,
  channel,
  currentUserId,
  hasDraft,
  onArchive,
  onClearDraft,
  onInfo,
  onFiles,
  onMarkUnread,
  onMemberSearch,
  onMobileBack,
  onPins,
  projectFeedbackHref,
  onSaved,
  onSearch,
  onThreads,
  onToggleFavorite,
  onToggleMuted,
  usersById,
}: ChatHeaderProps) {
  const Icon = channelIcon(channel);
  const integrationBrand = chatChannelIntegrationBrand(channel);
  const membership = currentMembership(channel, currentUserId);
  const canManageMembership = canManage && channel.type === "private";
  const canUseChatDrive = !channel.systemKind && (channel.type === "public" || channel.type === "private");
  const infoLabel = chatChannelInfoLabel(channel);
  const title = chatChannelDisplayLabel(channel, currentUserId, usersById);
  const headerText = channel.header.trim();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);
  const showThreadShortcut = channel.threadUnreadCount > 0;
  const memberNames = chatChannelMemberNamePreview(channel, usersById, 4);

  useEffect(() => {
    if (!moreOpen) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && moreMenuRef.current?.contains(target)) return;
      setMoreOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [moreOpen]);

  const runMenuAction = (handler: () => void) => {
    setMoreOpen(false);
    handler();
  };
  const focusMoreTrigger = () => {
    window.setTimeout(() => moreMenuRef.current?.querySelector<HTMLButtonElement>("button[aria-haspopup='menu']")?.focus(), 0);
  };
  const handleMoreKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!moreOpen) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setMoreOpen(false);
      focusMoreTrigger();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = Array.from(moreMenuRef.current?.querySelectorAll<HTMLButtonElement>("[role='menuitem']") ?? [])
      .filter((item) => !item.disabled && item.offsetParent !== null);
    if (items.length === 0) return;
    event.preventDefault();
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End" || (event.key === "ArrowUp" && currentIndex < 0)
        ? items.length - 1
        : event.key === "ArrowDown"
          ? currentIndex < 0 ? 0 : (currentIndex + 1) % items.length
          : (currentIndex - 1 + items.length) % items.length;
    items[nextIndex]?.focus();
  };

  return (
    <header className="orf-chat-header">
      {onMobileBack && (
        <IconButton className="orf-chat-header-back" icon={ArrowLeft} label="返回聊天列表" onClick={onMobileBack} />
      )}
      <button type="button" className="orf-chat-header-title" onClick={onInfo}>
        {integrationBrand ? (
          <ChatIntegrationBrandMark brand={integrationBrand} className="orf-chat-header-brand-mark" />
        ) : (
          <Icon className="h-5 w-5" />
        )}
        <span>{title}</span>
      </button>
      <div className="orf-chat-header-meta">
        <span className="orf-chat-header-member-count">
          <Users className="h-3.5 w-3.5" />
          <span>{channel.memberCount}</span>
        </span>
        {headerText && <span className="orf-chat-header-description truncate" title={headerText}>{headerText}</span>}
        {memberNames && <span className="orf-chat-header-member-names truncate">{memberNames}</span>}
      </div>
      <div className="orf-chat-header-actions">
        {canUseChatDrive && (
          <IconButton
            aria-pressed={activePanel === "files"}
            className="orf-chat-header-resource-action"
            data-active={activePanel === "files" ? "true" : undefined}
            icon={Folder}
            label="群聊资源"
            onClick={onFiles}
          />
        )}
        {channel.projectId && projectFeedbackHref && (
          <Link
            aria-label="项目反馈"
            className={actionButtonClassName({ className: "orf-chat-header-action-secondary", iconOnly: true, variant: "ghost" })}
            title="项目反馈"
            to={projectFeedbackHref}
          >
            <Inbox className="h-4 w-4" />
          </Link>
        )}
        <IconButton
          aria-pressed={activePanel === "search"}
          data-active={activePanel === "search" ? "true" : undefined}
          icon={Search}
          label="搜索消息"
          onClick={onSearch}
        />
        {hasDraft && (
          <IconButton
            className="orf-chat-header-action-secondary"
            icon={Trash2}
            label="清空草稿"
            onClick={onClearDraft}
          />
        )}
        <IconButton
          aria-pressed={activePanel === "info"}
          className="orf-chat-header-action-secondary"
          data-active={activePanel === "info" ? "true" : undefined}
          icon={Info}
          label={infoLabel}
          onClick={onInfo}
        />
        <IconButton
          className={membership?.favorite ? "orf-chat-header-action-secondary orf-chat-starred" : "orf-chat-header-action-secondary"}
          icon={Star}
          label={membership?.favorite ? "取消收藏" : "收藏频道"}
          onClick={onToggleFavorite}
        />
        <IconButton className="orf-chat-header-action-secondary" icon={EyeOff} label="标记未读" onClick={onMarkUnread} />
        <IconButton
          className={membership?.muted ? "orf-chat-header-action-secondary orf-chat-muted" : "orf-chat-header-action-secondary"}
          icon={membership?.muted ? BellOff : Bell}
          label={membership?.muted ? "取消静音" : "静音频道"}
          onClick={onToggleMuted}
        />
        {canManageMembership && <IconButton className="orf-chat-header-action-secondary" icon={UserPlus} label="添加成员" onClick={onMemberSearch} />}
        {showThreadShortcut && (
          <button
            type="button"
            className={actionButtonClassName({ className: "orf-chat-header-thread-action", iconOnly: true, variant: "ghost" })}
            title={`话题收件箱，${channel.threadUnreadCount} 条未读`}
            aria-label={`话题收件箱，${channel.threadUnreadCount} 条未读`}
            onClick={onThreads}
          >
            <Reply className="h-4 w-4" />
            <span>{channel.threadUnreadCount}</span>
          </button>
        )}
        <div className="orf-chat-header-more" ref={moreMenuRef} onKeyDown={handleMoreKeyDown}>
          <IconButton
            icon={MoreHorizontal}
            label="更多频道操作"
            aria-expanded={moreOpen}
            aria-haspopup="menu"
            onClick={() => setMoreOpen((value) => !value)}
          />
          {moreOpen && (
            <div className="orf-chat-header-more-menu" role="menu">
              <button type="button" className="orf-chat-header-mobile-menu-item" role="menuitem" onClick={() => runMenuAction(onInfo)}>
                <Info className="h-4 w-4" />
                {infoLabel}
              </button>
              <button type="button" className="orf-chat-header-mobile-menu-item" role="menuitem" onClick={() => runMenuAction(onToggleFavorite)}>
                <Star className="h-4 w-4" />
                {membership?.favorite ? "取消收藏" : "收藏频道"}
              </button>
              <button type="button" className="orf-chat-header-mobile-menu-item" role="menuitem" onClick={() => runMenuAction(onMarkUnread)}>
                <EyeOff className="h-4 w-4" />
                标记未读
              </button>
              {hasDraft && (
                <button type="button" className="orf-chat-header-mobile-menu-item" role="menuitem" onClick={() => runMenuAction(onClearDraft)}>
                  <Trash2 className="h-4 w-4" />
                  清空草稿
                </button>
              )}
              <button type="button" className="orf-chat-header-mobile-menu-item" role="menuitem" onClick={() => runMenuAction(onToggleMuted)}>
                {membership?.muted ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                {membership?.muted ? "取消静音" : "静音频道"}
              </button>
              {canManageMembership && (
                <button type="button" className="orf-chat-header-mobile-menu-item" role="menuitem" onClick={() => runMenuAction(onMemberSearch)}>
                  <UserPlus className="h-4 w-4" />
                  添加成员
                </button>
              )}
              {canUseChatDrive && (
                <button type="button" role="menuitem" onClick={() => runMenuAction(onFiles)}>
                  <Folder className="h-4 w-4" />
                  群聊资源
                </button>
              )}
              <button type="button" role="menuitem" onClick={() => runMenuAction(onPins)}>
                <Pin className="h-4 w-4" />
                固定消息
              </button>
              <button type="button" role="menuitem" onClick={() => runMenuAction(onSaved)}>
                <Bookmark className="h-4 w-4" />
                已保存消息
              </button>
              {!showThreadShortcut && (
                <button type="button" role="menuitem" onClick={() => runMenuAction(onThreads)}>
                  <Reply className="h-4 w-4" />
                  话题收件箱
                </button>
              )}
              {canManage && !isChatConversation(channel) && channel.name !== "orf-town-square" && (
                <button type="button" className="is-danger" role="menuitem" onClick={() => runMenuAction(onArchive)}>
                  <Archive className="h-4 w-4" />
                  归档频道
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
