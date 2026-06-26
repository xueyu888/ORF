import { useEffect, useState } from "react";
import { GitBranch, Loader2, Plus, Power, Trash2 } from "lucide-react";
import { Button } from "../../components/ui";
import { isChatConversation } from "../../domain/chatConversation";
import {
  createGitLabOrfChatChannelSubscription,
  deleteGitLabOrfChatChannelSubscription,
  getGitLabOrfChatChannelSubscriptions,
  updateGitLabOrfChatChannelSubscription,
  type GitLabOrfChatEventType,
  type GitLabOrfChatSettingsData,
  type GitLabOrfChatSubscription,
} from "../../state/apiClient";
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
  const conversationLabel = "私聊";

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
      {!isConversation && (channel.type === "public" || channel.type === "private") && (
        <GitLabChannelSubscriptionPanel channelId={channel.id} />
      )}
      <div className="orf-chat-info-section">
        <label>成员</label>
        <div className="orf-chat-member-list">
          {channel.members.map((member) => {
            const user = usersById.get(member.userId);
            return (
              <div key={member.userId}>
                <ChatPresenceAvatar className="orf-chat-member-avatar" currentUserId={currentUserId} name={user?.name ?? "成员"} size="sm" user={user} />
                <span>{user?.name ?? "未知成员"}</span>
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

function GitLabChannelSubscriptionPanel({ channelId }: { channelId: string }) {
  const [settings, setSettings] = useState<GitLabOrfChatSettingsData | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [draftScope, setDraftScope] = useState<"group" | "project">("group");
  const [draftProjectId, setDraftProjectId] = useState("");
  const [draftEventTypes, setDraftEventTypes] = useState<GitLabOrfChatEventType[]>([]);
  const [saving, setSaving] = useState(false);
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const selectedProject = settings?.projects.find((project) => project.id === draftProjectId) ?? null;
  const canCreate = Boolean(settings && draftEventTypes.length > 0 && (draftScope === "group" || selectedProject));

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setErrorMessage(null);
    void getGitLabOrfChatChannelSubscriptions(channelId)
      .then((data) => {
        if (cancelled) return;
        applySettings(data);
        setStatus("success");
      })
      .catch((error) => {
        if (cancelled) return;
        setStatus("error");
        setErrorMessage(error instanceof Error ? error.message : "GitLab 订阅加载失败");
      });
    return () => {
      cancelled = true;
    };
  }, [channelId]);

  const applySettings = (data: GitLabOrfChatSettingsData) => {
    setSettings(data);
    setDraftProjectId((current) => current || data.projects[0]?.id || "");
    setDraftEventTypes((current) => current.length > 0 ? current : data.eventTypes);
  };

  const toggleDraftEventType = (eventType: GitLabOrfChatEventType) => {
    setDraftEventTypes((current) =>
      current.includes(eventType) ? current.filter((item) => item !== eventType) : [...current, eventType],
    );
  };

  const createSubscription = async () => {
    if (!settings || !canCreate || saving) return;
    setSaving(true);
    setErrorMessage(null);
    try {
      const data = await createGitLabOrfChatChannelSubscription({
        channelId,
        eventTypes: draftEventTypes,
        projectId: draftScope === "project" ? selectedProject?.id : undefined,
        projectPath: draftScope === "project" ? selectedProject?.path : undefined,
        projectUrl: draftScope === "project" ? selectedProject?.url : undefined,
        scope: draftScope,
      });
      applySettings(data);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "GitLab 订阅创建失败");
    } finally {
      setSaving(false);
    }
  };

  const toggleSubscription = async (subscription: GitLabOrfChatSubscription) => {
    if (mutatingId) return;
    setMutatingId(subscription.id);
    setErrorMessage(null);
    try {
      const data = await updateGitLabOrfChatChannelSubscription({
        channelId,
        enabled: !subscription.enabled,
        subscriptionId: subscription.id,
      });
      applySettings(data);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "GitLab 订阅更新失败");
    } finally {
      setMutatingId(null);
    }
  };

  const deleteSubscription = async (subscription: GitLabOrfChatSubscription) => {
    if (mutatingId) return;
    setMutatingId(subscription.id);
    setErrorMessage(null);
    try {
      const data = await deleteGitLabOrfChatChannelSubscription({
        channelId,
        subscriptionId: subscription.id,
      });
      applySettings(data);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "GitLab 订阅删除失败");
    } finally {
      setMutatingId(null);
    }
  };

  return (
    <div className="orf-chat-info-section orf-chat-gitlab-section">
      <label>GitLab 订阅</label>
      {status === "loading" && <div className="orf-chat-gitlab-state">加载中...</div>}
      {status === "error" && <div className="orf-chat-member-error">{errorMessage ?? "GitLab 订阅加载失败"}</div>}
      {settings && (
        <>
          <div className="orf-chat-gitlab-summary">
            <span data-active={settings.config.enabled}>集成</span>
            <span data-active={settings.config.webhookConfigured}>Webhook</span>
            <span>Group: {settings.config.groupPath}</span>
          </div>
          <div className="orf-chat-gitlab-create">
            <select value={draftScope} disabled={saving} onChange={(event) => setDraftScope(event.target.value as "group" | "project")}>
              <option value="group">整个 group</option>
              <option value="project">单个 project</option>
            </select>
            {draftScope === "project" && (
              <select value={draftProjectId} disabled={saving || settings.projects.length === 0} onChange={(event) => setDraftProjectId(event.target.value)}>
                {settings.projects.length === 0 ? <option value="">暂无 project</option> : null}
                {settings.projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.path}
                  </option>
                ))}
              </select>
            )}
            <div className="orf-chat-gitlab-events">
              {settings.eventTypes.map((eventType) => (
                <label key={eventType}>
                  <input
                    type="checkbox"
                    checked={draftEventTypes.includes(eventType)}
                    disabled={saving}
                    onChange={() => toggleDraftEventType(eventType)}
                  />
                  <span>{gitLabEventTypeLabel(eventType)}</span>
                </label>
              ))}
            </div>
            <Button disabled={!canCreate || saving} onClick={() => void createSubscription()} variant="secondary">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              订阅
            </Button>
          </div>
          {settings.gitlabProjectListError && <div className="orf-chat-member-error">{settings.gitlabProjectListError}</div>}
          <div className="orf-chat-gitlab-list">
            {settings.subscriptions.length === 0 ? (
              <div className="orf-chat-gitlab-state">暂无订阅</div>
            ) : (
              settings.subscriptions.map((subscription) => (
                <div key={subscription.id} className="orf-chat-gitlab-item">
                  <GitBranch className="h-4 w-4" />
                  <div>
                    <strong>{subscription.scope === "group" ? subscription.gitlabGroupPath : subscription.gitlabProjectPath}</strong>
                    <small>{subscription.eventTypes.map(gitLabEventTypeLabel).join(" / ")} · {subscription.enabled ? "启用" : "停用"}</small>
                  </div>
                  <Button disabled={mutatingId === subscription.id} onClick={() => void toggleSubscription(subscription)} variant="ghost">
                    {mutatingId === subscription.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
                  </Button>
                  <Button disabled={mutatingId === subscription.id} onClick={() => void deleteSubscription(subscription)} variant="ghost">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </div>
          {errorMessage && <div className="orf-chat-member-error">{errorMessage}</div>}
        </>
      )}
    </div>
  );
}

function gitLabEventTypeLabel(eventType: GitLabOrfChatEventType) {
  switch (eventType) {
    case "push":
      return "Push";
    case "tag_push":
      return "Tag";
    case "merge_request":
      return "MR";
    case "issue":
      return "Issue";
    case "pipeline":
      return "Pipeline";
  }
}
