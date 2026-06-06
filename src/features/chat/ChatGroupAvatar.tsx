import { clsx } from "clsx";
import { UsersRound } from "lucide-react";
import { UserAvatar } from "../../components/UserAvatar";
import type { ChatChannel, ChatUser } from "../../types/orf";

type ChatGroupAvatarProps = {
  channel: ChatChannel;
  className?: string;
  currentUserId?: string;
  usersById: Map<string, ChatUser>;
};

export function ChatGroupAvatar({ channel, className, currentUserId, usersById }: ChatGroupAvatarProps) {
  const members = channel.members
    .map((member) => usersById.get(member.userId))
    .filter((user): user is ChatUser => user !== undefined);
  const visibleMembers = (members.filter((user) => user.id !== currentUserId).length > 0
    ? members.filter((user) => user.id !== currentUserId)
    : members).slice(0, 3);

  return (
    <span className={clsx("orf-chat-group-avatar", className)} title={`${channel.displayName} · ${channel.memberCount} 位成员`}>
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
