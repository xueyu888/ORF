import { Check } from "lucide-react";
import { clsx } from "clsx";
import { UserAvatar } from "../../components/UserAvatar";
import type { ChatUser } from "../../types/orf";
import { chatPresenceBadgeState, chatPresenceState, formatPresence } from "./chatPresence";

type ChatPresenceAvatarProps = {
  avatarUrl?: string | null;
  className?: string;
  currentUserId?: string;
  frame?: boolean;
  name: string;
  size?: "sm" | "md" | "lg";
  user?: ChatUser;
};

export function ChatPresenceAvatar({
  avatarUrl,
  className,
  currentUserId,
  frame = true,
  name,
  size = "md",
  user,
}: ChatPresenceAvatarProps) {
  const presence = formatPresence(user, currentUserId);
  const state = chatPresenceState(user, currentUserId);
  const badgeState = chatPresenceBadgeState(state);
  return (
    <span
      className={clsx("orf-chat-presence-avatar", `orf-chat-presence-avatar-${size}`, className)}
      title={`${name} · ${presence}`}
    >
      <UserAvatar avatarUrl={avatarUrl ?? user?.avatarUrl} frame={frame} name={name} size={size} />
      <span
        aria-label={presence}
        className={clsx("orf-chat-presence-badge", `orf-chat-presence-badge-${badgeState}`)}
      >
        {state === "active" && <Check aria-hidden="true" />}
      </span>
    </span>
  );
}
