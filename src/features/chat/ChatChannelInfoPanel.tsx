import { useEffect, useState } from "react";
import { Button } from "../../components/ui";
import { isChatConversation } from "../../domain/chatConversation";
import type { ChatChannel, ChatUser } from "../../types/orf";
import { formatPresence } from "./chatPresence";
import { ChatPresenceAvatar } from "./ChatPresenceAvatar";
import { ChatUserPicker } from "./ChatUserPicker";

type ChatChannelInfoPanelProps = {
  canManage: boolean;
  channel: ChatChannel;
  currentUserId?: string;
  memberSearchFocusSignal?: number;
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
  memberSearchFocusSignal,
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
  const [savingMembers, setSavingMembers] = useState(false);
  const [memberMutationError, setMemberMutationError] = useState<string | null>(null);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const memberIds = new Set(channel.members.map((member) => member.userId));
  const candidates = users.filter((user) => !memberIds.has(user.id));
  const isConversation = isChatConversation(channel);
  const canEditChannelMetadata = canManage && !isConversation;
  const canEditConversationHeader = isConversation;
  const canManageMembership = canManage && channel.type === "private";
  const detailsChanged = displayName !== channel.displayName || purpose !== channel.purpose || header !== channel.header;
  const conversationHeaderChanged = header !== channel.header;
  const conversationLabel = channel.type === "group" ? "群聊" : "私聊";

  useEffect(() => {
    setDisplayName(channel.displayName);
    setPurpose(channel.purpose);
    setHeader(channel.header);
    setSavingDetails(false);
    setSavingMembers(false);
    setMemberMutationError(null);
    setRemovingUserId(null);
    setSelectedUserIds([]);
  }, [channel.displayName, channel.header, channel.id, channel.purpose]);

  const saveDetails = async () => {
    if (!canEditChannelMetadata || !displayName.trim()) return;
    setSavingDetails(true);
    try {
      await onUpdateChannel({ displayName: displayName.trim(), purpose: purpose.trim(), header: header.trim() });
    } finally {
      setSavingDetails(false);
    }
  };
  const saveConversationHeader = async () => {
    if (!canEditConversationHeader) return;
    setSavingDetails(true);
    try {
      await onUpdateChannel({ header: header.trim() });
    } finally {
      setSavingDetails(false);
    }
  };
  const toggleSelectedUser = (userId: string) => {
    setSelectedUserIds((items) => items.includes(userId) ? items.filter((id) => id !== userId) : [...items, userId]);
  };
  const addSelectedMembers = async () => {
    if (selectedUserIds.length === 0 || savingMembers) return;
    setSavingMembers(true);
    setMemberMutationError(null);
    try {
      await onAddMembers(selectedUserIds);
      setSelectedUserIds([]);
    } catch (error) {
      setMemberMutationError(error instanceof Error ? error.message : "添加成员失败");
    } finally {
      setSavingMembers(false);
    }
  };
  const removeMember = async (userId: string) => {
    if (removingUserId) return;
    setRemovingUserId(userId);
    setMemberMutationError(null);
    try {
      await onRemoveMember(userId);
    } catch (error) {
      setMemberMutationError(error instanceof Error ? error.message : "移除成员失败");
    } finally {
      setRemovingUserId(null);
    }
  };

  return (
    <div className="orf-chat-info-panel">
      {canEditChannelMetadata ? (
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
      ) : canEditConversationHeader ? (
        <div className="orf-chat-info-section">
          <label>{conversationLabel}标题</label>
          <div className="orf-chat-info-fields">
            <textarea value={header} onChange={(event) => setHeader(event.target.value)} placeholder={`${conversationLabel}标题`} rows={3} />
          </div>
          <Button disabled={!conversationHeaderChanged || savingDetails} onClick={() => void saveConversationHeader()} variant="secondary">
            {savingDetails ? "保存中" : `保存${conversationLabel}标题`}
          </Button>
        </div>
      ) : (
        <>
          {isConversation ? null : (
            <div className="orf-chat-info-section">
              <label>频道说明</label>
              <p>{channel.purpose || "暂无说明"}</p>
            </div>
          )}
          <div className="orf-chat-info-section">
            <label>{isConversation ? `${conversationLabel}标题` : "频道标题"}</label>
            <p>{channel.header || "暂无标题"}</p>
          </div>
        </>
      )}
      {canManageMembership && (
        <div className="orf-chat-info-section">
          <label>添加成员</label>
          {candidates.length > 0 ? (
            <>
              <ChatUserPicker
                className="orf-chat-info-user-picker"
                currentUserId={currentUserId}
                emptyLabel="没有可添加成员"
                focusSignal={memberSearchFocusSignal}
                onToggleUser={toggleSelectedUser}
                placeholder="查找成员"
                selectedUserIds={selectedUserIds}
                users={candidates}
              />
              <Button disabled={selectedUserIds.length === 0 || savingMembers} onClick={() => void addSelectedMembers()} variant="secondary">
                {savingMembers ? "添加中" : "添加成员"}
              </Button>
            </>
          ) : (
            <div className="orf-chat-member-empty">没有可添加成员</div>
          )}
          {memberMutationError && <div className="orf-chat-member-error">{memberMutationError}</div>}
        </div>
      )}
      <div className="orf-chat-info-section">
        <label>成员</label>
        <div className="orf-chat-member-list">
          {channel.members.map((member) => {
            const user = usersById.get(member.userId);
            return (
              <div key={member.userId}>
                <ChatPresenceAvatar className="orf-chat-member-avatar" currentUserId={currentUserId} name={user?.name ?? "成员"} size="sm" user={user} />
                <span>{user?.name ?? member.userId}</span>
                <small>{member.role} · {formatPresence(user, currentUserId)}</small>
                {canManageMembership && member.userId !== currentUserId && (
                  <button disabled={removingUserId === member.userId} type="button" onClick={() => void removeMember(member.userId)}>
                    {removingUserId === member.userId ? "移除中" : "移除"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
