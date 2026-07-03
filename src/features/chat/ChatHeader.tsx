import { useEffect, useRef, useState } from "react";
import { Archive, ArrowLeft, Bell, BellOff, Bookmark, EyeOff, Folder, Info, MoreHorizontal, Pin, Reply, Search, Star, UserPlus, Users } from "lucide-react";
import { IconButton, actionButtonClassName } from "../../components/ui";
import { isChatConversation } from "../../domain/chatConversation";
import type { ChatChannel, ChatUser } from "../../types/orf";
import { ChatIntegrationBrandMark, chatChannelIntegrationBrand } from "./chatIntegrationBrand";
import { channelIcon, chatChannelDisplayLabel, chatChannelInfoLabel } from "./chatChannelPresentation";
import { currentMembership } from "./chatModels";

type ChatHeaderProps = {
  canManage: boolean;
  channel: ChatChannel;
  currentUserId?: string;
  onArchive: () => void;
  onInfo: () => void;
  onFiles: () => void;
  onMarkUnread: () => void;
  onMemberSearch: () => void;
  onMobileBack?: () => void;
  onPins: () => void;
  onSaved: () => void;
  onSearch: () => void;
  onThreads: () => void;
  onToggleFavorite: () => void;
  onToggleMuted: () => void;
  usersById: Map<string, ChatUser>;
};

export function ChatHeader({
  canManage,
  channel,
  currentUserId,
  onArchive,
  onInfo,
  onFiles,
  onMarkUnread,
  onMemberSearch,
  onMobileBack,
  onPins,
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
  const memberNames = channel.members
    .slice(0, 4)
    .map((member) => usersById.get(member.userId)?.name)
    .filter(Boolean)
    .join(", ");

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
        <Users className="h-4 w-4" />
        <span>{channel.memberCount}</span>
        {headerText && <span className="orf-chat-header-description truncate" title={headerText}>{headerText}</span>}
        {memberNames && <span className="orf-chat-header-member-names truncate">{memberNames}</span>}
      </div>
      <div className="orf-chat-header-actions">
        {canUseChatDrive && <IconButton icon={Folder} label="群聊资源" onClick={onFiles} />}
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
        <IconButton icon={Search} label="搜索消息" onClick={onSearch} />
        <IconButton icon={Info} label={infoLabel} onClick={onInfo} />
        <div className="orf-chat-header-more" ref={moreMenuRef}>
          <IconButton
            icon={MoreHorizontal}
            label="更多频道操作"
            aria-expanded={moreOpen}
            aria-haspopup="menu"
            onClick={() => setMoreOpen((value) => !value)}
          />
          {moreOpen && (
            <div className="orf-chat-header-more-menu" role="menu">
              <button type="button" role="menuitem" onClick={() => runMenuAction(onToggleFavorite)}>
                <Star className="h-4 w-4" />
                {membership?.favorite ? "取消收藏" : "收藏频道"}
              </button>
              <button type="button" role="menuitem" onClick={() => runMenuAction(onMarkUnread)}>
                <EyeOff className="h-4 w-4" />
                标记未读
              </button>
              <button type="button" role="menuitem" onClick={() => runMenuAction(onToggleMuted)}>
                {membership?.muted ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                {membership?.muted ? "取消静音" : "静音频道"}
              </button>
              {canManageMembership && (
                <button type="button" role="menuitem" onClick={() => runMenuAction(onMemberSearch)}>
                  <UserPlus className="h-4 w-4" />
                  添加成员
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
