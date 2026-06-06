import { Check, Clock3 } from "lucide-react";
import { clsx } from "clsx";
import { Avatar } from "../../components/ui";
import type { ChatUser } from "../../types/orf";
import { chatPresenceState, formatPresence } from "./chatPresence";

type ChatPresenceAvatarProps = {
  avatarUrl?: string | null;
  className?: string;
  currentUserId?: string;
  name: string;
  size?: "sm" | "md" | "lg";
  user?: ChatUser;
};

export function ChatPresenceAvatar({
  avatarUrl,
  className,
  currentUserId,
  name,
  size = "md",
  user,
}: ChatPresenceAvatarProps) {
  const presence = formatPresence(user, currentUserId);
  const state = chatPresenceState(user, currentUserId);
  return (
    <span
      className={clsx("orf-chat-presence-avatar", `orf-chat-presence-avatar-${size}`, className)}
      title={`${name} · ${presence}`}
    >
      <Avatar avatarUrl={avatarUrl ?? user?.avatarUrl} name={name} size={size} />
      <span
        aria-label={presence}
        className={clsx("orf-chat-presence-badge", `orf-chat-presence-badge-${state}`)}
      >
        {state === "online" && <Check aria-hidden="true" />}
        {state === "away" && <Clock3 aria-hidden="true" />}
      </span>
    </span>
  );
}
