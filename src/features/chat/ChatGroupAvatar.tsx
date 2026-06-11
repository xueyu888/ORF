import { clsx } from "clsx";
import { UsersRound } from "lucide-react";
import { UserAvatar } from "../../components/UserAvatar";
import type { ChatChannel, ChatUser } from "../../types/orf";
import { chatChannelDisplayLabel, chatConversationAvatarUsers } from "./chatChannelPresentation";

type ChatGroupAvatarProps = {
  channel: ChatChannel;
  className?: string;
  currentUserId?: string;
  usersById: Map<string, ChatUser>;
};

export function ChatGroupAvatar({ channel, className, currentUserId, usersById }: ChatGroupAvatarProps) {
  const label = chatChannelDisplayLabel(channel, currentUserId, usersById);
  const visibleMembers = chatConversationAvatarUsers(channel, currentUserId, usersById);

  return (
    <span className={clsx("orf-chat-group-avatar", className)} title={`${label} · ${channel.memberCount} 位成员`}>
      {visibleMembers.length > 0 ? (
        <span className="orf-chat-group-avatar-stack" data-count={visibleMembers.length}>
          {visibleMembers.map((user, index) => (
            <span className="orf-chat-group-avatar-member-slot" data-index={index} key={user.id}>
              <UserAvatar avatarUrl={user.avatarUrl} className="orf-chat-group-avatar-member" frame={false} name={user.name} size="sm" />
            </span>
          ))}
        </span>
      ) : (
        <span className="orf-chat-group-avatar-fallback">
          <UsersRound aria-hidden="true" />
        </span>
      )}
    </span>
  );
}
