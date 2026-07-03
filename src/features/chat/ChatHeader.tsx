import { Archive, ArrowLeft, Bell, BellOff, Bookmark, EyeOff, Folder, Info, Pin, Reply, Search, Star, UserPlus, Users } from "lucide-react";
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
  const memberNames = channel.members
    .slice(0, 4)
    .map((member) => usersById.get(member.userId)?.name)
    .filter(Boolean)
    .join(", ");

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
        <IconButton className={membership?.favorite ? "orf-chat-starred" : ""} icon={Star} label="收藏频道" onClick={onToggleFavorite} />
        <IconButton icon={EyeOff} label="标记未读" onClick={onMarkUnread} />
        <IconButton
          className={membership?.muted ? "orf-chat-muted" : ""}
          icon={membership?.muted ? BellOff : Bell}
          label={membership?.muted ? "取消静音" : "静音频道"}
          onClick={onToggleMuted}
        />
        {canManageMembership && <IconButton icon={UserPlus} label="添加成员" onClick={onMemberSearch} />}
        {canUseChatDrive && <IconButton icon={Folder} label="群聊云盘" onClick={onFiles} />}
        <IconButton icon={Pin} label="固定消息" onClick={onPins} />
        <IconButton icon={Bookmark} label="已保存消息" onClick={onSaved} />
        <button
          type="button"
          className={actionButtonClassName({ className: "orf-chat-header-thread-action", iconOnly: true, variant: "ghost" })}
          title={channel.threadUnreadCount > 0 ? `话题收件箱，${channel.threadUnreadCount} 条未读` : "话题收件箱"}
          aria-label={channel.threadUnreadCount > 0 ? `话题收件箱，${channel.threadUnreadCount} 条未读` : "话题收件箱"}
          onClick={onThreads}
        >
          <Reply className="h-4 w-4" />
          {channel.threadUnreadCount > 0 && <span>{channel.threadUnreadCount}</span>}
        </button>
        <IconButton icon={Search} label="搜索消息" onClick={onSearch} />
        <IconButton icon={Info} label={infoLabel} onClick={onInfo} />
        {canManage && !isChatConversation(channel) && channel.name !== "orf-town-square" && (
          <IconButton icon={Archive} label="归档频道" onClick={onArchive} />
        )}
      </div>
    </header>
  );
}
