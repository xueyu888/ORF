import { clsx } from "clsx";
import { useEffect, useState } from "react";
import { Avatar, Button } from "../../components/ui";
import type { ChatChannel, ChatUser } from "../../types/orf";
import { formatPresence, isChatUserOnline } from "./chatPresence";

type ChatChannelInfoPanelProps = {
  canManage: boolean;
  channel: ChatChannel;
  currentUserId?: string;
  onAddMembers: (userIds: string[]) => Promise<void>;
  onRemoveMember: (userId: string) => Promise<void>;
  onUpdateChannel: (input: Partial<Pick<ChatChannel, "displayName" | "header" | "purpose">>) => Promise<void>;
  users: ChatUser[];
  usersById: Map<string, ChatUser>;
};

export function ChatChannelInfoPanel({
  canManage,
  channel,
  currentUserId,
  onAddMembers,
  onRemoveMember,
  onUpdateChannel,
  users,
  usersById,
}: ChatChannelInfoPanelProps) {
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [displayName, setDisplayName] = useState(channel.displayName);
  const [purpose, setPurpose] = useState(channel.purpose);
  const [header, setHeader] = useState(channel.header);
  const [savingDetails, setSavingDetails] = useState(false);
  const memberIds = new Set(channel.members.map((member) => member.userId));
  const candidates = users.filter((user) => !memberIds.has(user.id));
  const canEditMetadata = canManage && channel.type !== "direct" && channel.type !== "group";
  const detailsChanged = displayName !== channel.displayName || purpose !== channel.purpose || header !== channel.header;

  useEffect(() => {
    setDisplayName(channel.displayName);
    setPurpose(channel.purpose);
    setHeader(channel.header);
    setSavingDetails(false);
  }, [channel.displayName, channel.header, channel.id, channel.purpose]);

  const saveDetails = async () => {
    if (!canEditMetadata || !displayName.trim()) return;
    setSavingDetails(true);
    try {
      await onUpdateChannel({ displayName: displayName.trim(), purpose: purpose.trim(), header: header.trim() });
    } finally {
      setSavingDetails(false);
    }
  };
  const toggleSelectedUser = (userId: string) => {
    setSelectedUserIds((items) => items.includes(userId) ? items.filter((id) => id !== userId) : [...items, userId]);
  };
  const addSelectedMembers = async () => {
    await onAddMembers(selectedUserIds);
    setSelectedUserIds([]);
  };

  return (
    <div className="orf-chat-info-panel">
      {canEditMetadata ? (
        <div className="orf-chat-info-section">
          <label>频道设置</label>
          <div className="orf-chat-info-fields">
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="频道名" />
            <textarea value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="频道说明" rows={3} />
            <textarea value={header} onChange={(event) => setHeader(event.target.value)} placeholder="频道标题" rows={3} />
          </div>
          <Button disabled={!detailsChanged || !displayName.trim() || savingDetails} onClick={() => void saveDetails()} variant="secondary">
            {savingDetails ? "保存中" : "保存频道设置"}
          </Button>
        </div>
      ) : (
        <>
          <div className="orf-chat-info-section">
            <label>频道说明</label>
            <p>{channel.purpose || "暂无说明"}</p>
          </div>
          <div className="orf-chat-info-section">
            <label>频道标题</label>
            <p>{channel.header || "暂无标题"}</p>
          </div>
        </>
      )}
      {canManage && channel.type !== "public" && (
        <div className="orf-chat-info-section">
          <label>添加成员</label>
          {candidates.length > 0 ? (
            <>
              <div className="orf-chat-member-picker">
                {candidates.slice(0, 10).map((user) => (
                  <button
                    className={selectedUserIds.includes(user.id) ? "orf-chat-member-selected" : ""}
                    key={user.id}
                    type="button"
                    onClick={() => toggleSelectedUser(user.id)}
                  >
                    <span className="orf-chat-member-avatar">
                      <Avatar avatarUrl={user.avatarUrl} name={user.name} size="sm" />
                      <i className={clsx("orf-chat-presence-dot", isChatUserOnline(user, currentUserId) && "orf-chat-presence-online")} />
                    </span>
                    <span>{user.name}</span>
                    <small>{formatPresence(user, currentUserId)}</small>
                  </button>
                ))}
              </div>
              <Button disabled={selectedUserIds.length === 0} onClick={() => void addSelectedMembers()} variant="secondary">
                添加成员
              </Button>
            </>
          ) : (
            <div className="orf-chat-member-empty">没有可添加成员</div>
          )}
        </div>
      )}
      <div className="orf-chat-info-section">
        <label>成员</label>
        <div className="orf-chat-member-list">
          {channel.members.map((member) => {
            const user = usersById.get(member.userId);
            return (
              <div key={member.userId}>
                <span className="orf-chat-member-avatar">
                  <Avatar avatarUrl={user?.avatarUrl} name={user?.name ?? "成员"} size="sm" />
                  <i className={clsx("orf-chat-presence-dot", isChatUserOnline(user, currentUserId) && "orf-chat-presence-online")} />
                </span>
                <span>{user?.name ?? member.userId}</span>
                <small>{member.role} · {formatPresence(user, currentUserId)}</small>
                {canManage && channel.type !== "public" && member.userId !== currentUserId && (
                  <button type="button" onClick={() => void onRemoveMember(member.userId)}>移除</button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
