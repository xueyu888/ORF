import { clsx } from "clsx";
import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatUser } from "../../types/orf";
import { formatPresence } from "./chatPresence";
import { ChatPresenceAvatar } from "./ChatPresenceAvatar";
import { matchesChatUser } from "./chatUserSearch";

type ChatUserPickerProps = {
  className?: string;
  currentUserId?: string;
  disabledUserTitle?: string | ((user: ChatUser) => string);
  emptyLabel: string;
  focusSignal?: number;
  isUserDisabled?: (user: ChatUser) => boolean;
  onToggleUser: (userId: string) => void;
  placeholder: string;
  selectedUserIds: string[];
  users: ChatUser[];
};

export function ChatUserPicker({
  className,
  currentUserId,
  disabledUserTitle,
  emptyLabel,
  focusSignal,
  isUserDisabled,
  onToggleUser,
  placeholder,
  selectedUserIds,
  users,
}: ChatUserPickerProps) {
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const selectedIds = useMemo(() => new Set(selectedUserIds), [selectedUserIds]);
  const filteredUsers = useMemo(() => {
    const normalized = query.trim();
    return users.filter((user) => matchesChatUser(user, normalized));
  }, [query, users]);

  useEffect(() => {
    if (focusSignal === undefined) return;
    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
  }, [focusSignal]);

  return (
    <div className={clsx("orf-chat-user-picker", className)}>
      <label className="orf-chat-user-picker-search">
        <Search className="h-4 w-4" />
        <input ref={searchInputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={placeholder} />
      </label>
      <div className="orf-chat-user-picker-list">
        {filteredUsers.map((user) => {
          const disabled = !selectedIds.has(user.id) && Boolean(isUserDisabled?.(user));
          const title = disabled
            ? typeof disabledUserTitle === "function" ? disabledUserTitle(user) : disabledUserTitle
            : undefined;
          return (
            <button
              className={selectedIds.has(user.id) ? "selected" : ""}
              disabled={disabled}
              key={user.id}
              title={title}
              type="button"
              onClick={() => onToggleUser(user.id)}
            >
              <ChatPresenceAvatar className="orf-chat-member-avatar" currentUserId={currentUserId} name={user.name} size="sm" user={user} />
              <span>{user.name}</span>
              <small>{formatPresence(user, currentUserId)}</small>
            </button>
          );
        })}
        {filteredUsers.length === 0 && (
          <div className="orf-chat-member-empty">{query.trim() ? "没有匹配成员" : emptyLabel}</div>
        )}
      </div>
    </div>
  );
}
