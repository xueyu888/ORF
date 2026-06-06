import { Archive, Bell, BellOff, Bookmark, EyeOff, Info, Pin, Reply, Search, Star, Users } from "lucide-react";
import { IconButton } from "../../components/ui";
import type { ChatChannel, ChatUser } from "../../types/orf";
import { channelIcon } from "./chatChannelPresentation";
import { currentMembership } from "./chatModels";

type ChatHeaderProps = {
  canManage: boolean;
  channel: ChatChannel;
  currentUserId?: string;
  onArchive: () => void;
  onInfo: () => void;
  onMarkUnread: () => void;
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
  onMarkUnread,
  onPins,
  onSaved,
  onSearch,
  onThreads,
  onToggleFavorite,
  onToggleMuted,
  usersById,
}: ChatHeaderProps) {
  const Icon = channelIcon(channel);
  const membership = currentMembership(channel, currentUserId);
  const memberNames = channel.members
    .slice(0, 4)
    .map((member) => usersById.get(member.userId)?.name)
    .filter(Boolean)
    .join(", ");

  return (
    <header className="orf-chat-header">
      <button type="button" className="orf-chat-header-title" onClick={onInfo}>
        <Icon className="h-5 w-5" />
        <span>{channel.displayName}</span>
      </button>
      <div className="orf-chat-header-meta">
        <Users className="h-4 w-4" />
        <span>{channel.memberCount}</span>
        {memberNames && <span className="truncate">{memberNames}</span>}
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
        <IconButton icon={Pin} label="固定消息" onClick={onPins} />
        <IconButton icon={Bookmark} label="已保存消息" onClick={onSaved} />
        <button
          type="button"
          className="orf-control orf-ghost-action orf-chat-header-thread-action inline-flex h-9 w-9 items-center justify-center transition"
          title={channel.threadUnreadCount > 0 ? `话题收件箱，${channel.threadUnreadCount} 条未读` : "话题收件箱"}
          aria-label={channel.threadUnreadCount > 0 ? `话题收件箱，${channel.threadUnreadCount} 条未读` : "话题收件箱"}
          onClick={onThreads}
        >
          <Reply className="h-4 w-4" />
          {channel.threadUnreadCount > 0 && <span>{channel.threadUnreadCount}</span>}
        </button>
        <IconButton icon={Search} label="搜索消息" onClick={onSearch} />
        <IconButton icon={Info} label="频道信息" onClick={onInfo} />
        {canManage && channel.type !== "direct" && channel.type !== "group" && channel.name !== "orf-town-square" && (
          <IconButton icon={Archive} label="归档频道" onClick={onArchive} />
        )}
      </div>
    </header>
  );
}
