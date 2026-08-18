import { clsx } from "clsx";
import { Check, GitBranch, Loader2, MessageSquare, MessageSquareWarning, Palette, Plus, Power, RefreshCw, Settings2, Trash2, Upload, type LucideIcon } from "lucide-react";
import { type KeyboardEvent, useEffect, useState } from "react";
import {
  getGitLabOrfChatSettings,
  getChatSettings,
  getFeedbackSettings,
  createGitLabOrfChatChannelSubscription as requestCreateGitLabOrfChatChannelSubscription,
  deleteGitLabOrfChatChannelSubscription as requestDeleteGitLabOrfChatChannelSubscription,
  reconcileGitLabOrfChatSettings as requestReconcileGitLabOrfChatSettings,
  saveChatSettings as requestSaveChatSettings,
  saveFeedbackSettings as requestSaveFeedbackSettings,
  updateGitLabOrfChatChannelSubscription as requestUpdateGitLabOrfChatChannelSubscription,
  type ChatSettingsData,
  type GitLabOrfChatEventType,
  type GitLabOrfChatSettingsData,
  type GitLabOrfChatSubscription,
} from "../state/apiClient";
import { readModelInvalidationKey } from "../features/realtime/readModelInvalidations";
import { Button } from "../components/ui";
import { useOrf } from "../state/OrfProvider";
import { VisualSkinWorkbench } from "../features/settings/VisualSkinWorkbench";

type RequestStatus = "idle" | "loading" | "success" | "error";

const bytesPerGb = 1024 * 1024 * 1024;

function formatUploadBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${bytes} B`;
  if (bytes < bytesPerGb) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / bytesPerGb).toFixed(1)} GB`;
}

function uploadBytesToGbInput(bytes: number) {
  return Number.isInteger(bytes / bytesPerGb) ? String(bytes / bytesPerGb) : (bytes / bytesPerGb).toFixed(2).replace(/\.?0+$/, "");
}

function parseGbInput(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed * bytesPerGb);
}

export function SystemSettingsPage() {
  const [activeWorkspace, setActiveWorkspace] = useState<"system" | "appearance">("system");

  return (
    <div className="orf-settings-page orf-settings-page-single">
      <section className="orf-settings-detail" aria-label="设置详情">
        <div className="orf-settings-detail-heading">
          <span>系统配置</span>
          <p>{activeWorkspace === "system" ? "管理聊天、反馈附件限制与外部消息集成。" : "配置登录、导航和业务页面的全站背景。"}</p>
        </div>

        <div className="orf-system-settings-workspace-tabs" role="tablist" aria-label="系统设置工作区">
          <button
            aria-controls="orf-system-settings-runtime"
            aria-selected={activeWorkspace === "system"}
            id="orf-system-settings-runtime-tab"
            onClick={() => setActiveWorkspace("system")}
            role="tab"
            type="button"
          >
            <Settings2 aria-hidden="true" />
            系统与集成
          </button>
          <button
            aria-controls="orf-system-settings-appearance"
            aria-selected={activeWorkspace === "appearance"}
            id="orf-system-settings-appearance-tab"
            onClick={() => setActiveWorkspace("appearance")}
            role="tab"
            type="button"
          >
            <Palette aria-hidden="true" />
            背景工作台
          </button>
        </div>

        <div
          aria-labelledby="orf-system-settings-runtime-tab"
          className="orf-settings-sections orf-system-settings-workspace-panel"
          hidden={activeWorkspace !== "system"}
          id="orf-system-settings-runtime"
          role="tabpanel"
        >
          <ChatSettingSection />
          <FeedbackSettingSection />
          <GitLabOrfChatSettingSection />
        </div>
        <div
          aria-labelledby="orf-system-settings-appearance-tab"
          className="orf-settings-sections orf-system-settings-workspace-panel orf-system-settings-appearance-panel"
          hidden={activeWorkspace !== "appearance"}
          id="orf-system-settings-appearance"
          role="tabpanel"
        >
          <VisualSkinWorkbench scope="system" />
        </div>
      </section>
    </div>
  );
}

function ChatSettingSection() {
  return (
    <AttachmentLimitSettingSection
      description="配置聊天单个附件的上传上限。"
      Icon={MessageSquare}
      inputLabel="聊天附件上限"
      loadErrorMessage="聊天设置加载失败"
      loadSettings={getChatSettings}
      saveErrorMessage="聊天设置保存失败"
      savedMessage="聊天设置已保存"
      saveSettings={requestSaveChatSettings}
      title="聊天设置"
    />
  );
}

function FeedbackSettingSection() {
  return (
    <AttachmentLimitSettingSection
      description="配置单条反馈全部附件的总上传上限；默认 2GB。"
      Icon={MessageSquareWarning}
      inputLabel="反馈附件总上限"
      loadErrorMessage="反馈设置加载失败"
      loadSettings={getFeedbackSettings}
      saveErrorMessage="反馈设置保存失败"
      savedMessage="反馈设置已保存"
      saveSettings={requestSaveFeedbackSettings}
      title="反馈设置"
    />
  );
}

function AttachmentLimitSettingSection({
  description,
  Icon,
  inputLabel,
  loadErrorMessage,
  loadSettings,
  saveErrorMessage,
  savedMessage,
  saveSettings,
  title,
}: {
  description: string;
  Icon: LucideIcon;
  inputLabel: string;
  loadErrorMessage: string;
  loadSettings: () => Promise<ChatSettingsData>;
  saveErrorMessage: string;
  savedMessage: string;
  saveSettings: (input: Pick<ChatSettingsData, "attachmentMaxBytes">) => Promise<ChatSettingsData>;
  title: string;
}) {
  const { notify, readModelInvalidations } = useOrf();
  const settingsInvalidationKey = readModelInvalidationKey(readModelInvalidations, "settings");
  const [settings, setSettings] = useState<ChatSettingsData | null>(null);
  const [inputValue, setInputValue] = useState("2");
  const [queryStatus, setQueryStatus] = useState<RequestStatus>("idle");
  const [queryErrorMessage, setQueryErrorMessage] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<RequestStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const nextBytes = parseGbInput(inputValue);
  const validationMessage =
    nextBytes === null
      ? "请输入有效数值"
      : settings && nextBytes > settings.infrastructureMaxBytes
        ? `不能超过基础设施上限 ${formatUploadBytes(settings.infrastructureMaxBytes)}`
        : null;
  const isSaving = saveStatus === "loading";
  const isSaveDisabled =
    !settings ||
    isSaving ||
    queryStatus === "loading" ||
    Boolean(validationMessage) ||
    nextBytes === settings.attachmentMaxBytes;

  useEffect(() => {
    let cancelled = false;
    setQueryStatus("loading");
    setQueryErrorMessage(null);
    void loadSettings()
      .then((data) => {
        if (cancelled) return;
        setSettings(data);
        setInputValue(uploadBytesToGbInput(data.attachmentMaxBytes));
        setQueryStatus("success");
      })
      .catch((error) => {
        if (cancelled) return;
        setQueryStatus("error");
        setQueryErrorMessage(error instanceof Error ? error.message : loadErrorMessage);
      });
    return () => {
      cancelled = true;
    };
  }, [loadErrorMessage, loadSettings, settingsInvalidationKey]);

  const handleSave = async () => {
    if (!settings || isSaveDisabled || nextBytes === null) return;
    setSaveStatus("loading");
    setSaveError(null);
    try {
      const data = await saveSettings({ attachmentMaxBytes: nextBytes });
      setSettings(data);
      setInputValue(uploadBytesToGbInput(data.attachmentMaxBytes));
      setSaveStatus("success");
      notify(savedMessage);
    } catch (error) {
      const message = error instanceof Error ? error.message : saveErrorMessage;
      setSaveStatus("error");
      setSaveError(message);
      notify(message);
    }
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      void handleSave();
    }
  };

  return (
    <section className="orf-settings-background-section">
      <div className="orf-settings-section-header">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <Button type="button" size="sm" disabled={isSaveDisabled} onClick={() => void handleSave()}>
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          保存
        </Button>
      </div>

      <div className="orf-settings-background-controls" aria-label={title}>
        <div className="orf-settings-background-label">
          <Icon className="h-5 w-5" />
          <span>附件上限</span>
        </div>
        <div className="orf-settings-control-field orf-settings-interval-field">
          <input
            aria-label={inputLabel}
            className="orf-settings-number-input"
            type="number"
            min={0.01}
            max={settings ? settings.infrastructureMaxBytes / bytesPerGb : 10}
            step={0.1}
            value={inputValue}
            disabled={queryStatus === "loading" || isSaving}
            onChange={(event) => setInputValue(event.target.value)}
            onKeyDown={handleInputKeyDown}
          />
          <select className="orf-settings-unit-select" value="gb" disabled onChange={() => undefined}>
            <option value="gb">GB</option>
          </select>
          {(validationMessage || saveError) && <span className="orf-settings-inline-error">{validationMessage ?? saveError}</span>}
        </div>

        <div className="orf-settings-background-label">
          <Upload className="h-5 w-5" />
          <span>承载上限</span>
        </div>
        <div className="orf-settings-control-field">
          {queryStatus === "loading" && <span className="orf-settings-inline-error">加载中...</span>}
          {queryStatus === "error" && <span className="orf-settings-inline-error">{queryErrorMessage ?? loadErrorMessage}</span>}
          {settings && <span className="orf-settings-selected-text">{formatUploadBytes(settings.infrastructureMaxBytes)}</span>}
        </div>
      </div>
    </section>
  );
}

function GitLabOrfChatSettingSection() {
  const { notify, readModelInvalidations } = useOrf();
  const settingsInvalidationKey = readModelInvalidationKey(readModelInvalidations, "settings");
  const [settings, setSettings] = useState<GitLabOrfChatSettingsData | null>(null);
  const [draftChannelId, setDraftChannelId] = useState("");
  const [draftScope, setDraftScope] = useState<"group" | "project">("group");
  const [draftProjectId, setDraftProjectId] = useState("");
  const [draftEventTypes, setDraftEventTypes] = useState<GitLabOrfChatEventType[]>([]);
  const [queryStatus, setQueryStatus] = useState<RequestStatus>("idle");
  const [queryErrorMessage, setQueryErrorMessage] = useState<string | null>(null);
  const [savingSubscription, setSavingSubscription] = useState(false);
  const [mutatingSubscriptionId, setMutatingSubscriptionId] = useState<string | null>(null);
  const [reconcileStatus, setReconcileStatus] = useState<RequestStatus>("idle");

  const isReconcileConfigured = Boolean(
    settings?.config.enabled &&
      settings.config.gitlabUrlConfigured &&
      settings.config.accessTokenConfigured &&
      settings.config.webhookUrlConfigured &&
      settings.config.webhookConfigured,
  );
  const isReconcileRunning = reconcileStatus === "loading";
  const selectedProject = settings?.projects.find((project) => project.id === draftProjectId) ?? null;
  const selectedChannel = settings?.channels.find((channel) => channel.id === draftChannelId) ?? null;
  const canCreateSubscription = Boolean(
    settings &&
      selectedChannel &&
      draftEventTypes.length > 0 &&
      (draftScope === "group" || selectedProject),
  );

  const applySettings = (data: GitLabOrfChatSettingsData) => {
    setSettings(data);
    setDraftChannelId((current) => data.channels.some((channel) => channel.id === current) ? current : data.channels[0]?.id || "");
    setDraftProjectId((current) => data.projects.some((project) => project.id === current) ? current : data.projects[0]?.id || "");
    setDraftEventTypes((current) => current.length > 0 ? current : data.eventTypes);
  };

  useEffect(() => {
    let cancelled = false;
    setQueryStatus("loading");
    setQueryErrorMessage(null);
    void getGitLabOrfChatSettings()
      .then((data) => {
        if (cancelled) return;
        applySettings(data);
        setQueryStatus("success");
      })
      .catch((error) => {
        if (cancelled) return;
        setQueryStatus("error");
        setQueryErrorMessage(error instanceof Error ? error.message : "GitLab 聊天绑定加载失败");
      });
    return () => {
      cancelled = true;
    };
  }, [settingsInvalidationKey]);

  const handleReconcile = async () => {
    if (!isReconcileConfigured || isReconcileRunning) return;
    setReconcileStatus("loading");
    try {
      const data = await requestReconcileGitLabOrfChatSettings();
      applySettings(data);
      setReconcileStatus("success");
      notify("GitLab hook 已收敛");
    } catch (error) {
      const message = error instanceof Error ? error.message : "GitLab hook 收敛失败";
      setReconcileStatus("error");
      notify(message);
    }
  };

  const toggleDraftEventType = (eventType: GitLabOrfChatEventType) => {
    setDraftEventTypes((current) =>
      current.includes(eventType) ? current.filter((item) => item !== eventType) : [...current, eventType],
    );
  };

  const handleCreateSubscription = async () => {
    if (!settings || !canCreateSubscription || savingSubscription) return;
    setSavingSubscription(true);
    try {
      await requestCreateGitLabOrfChatChannelSubscription({
        channelId: draftChannelId,
        eventTypes: draftEventTypes,
        projectId: draftScope === "project" ? selectedProject?.id : undefined,
        projectPath: draftScope === "project" ? selectedProject?.path : undefined,
        projectUrl: draftScope === "project" ? selectedProject?.url : undefined,
        scope: draftScope,
      });
      const data = await getGitLabOrfChatSettings();
      applySettings(data);
      notify("GitLab 订阅已创建");
    } catch (error) {
      notify(error instanceof Error ? error.message : "GitLab 订阅创建失败");
    } finally {
      setSavingSubscription(false);
    }
  };

  const handleToggleSubscription = async (subscription: GitLabOrfChatSubscription) => {
    if (mutatingSubscriptionId) return;
    setMutatingSubscriptionId(subscription.id);
    try {
      await requestUpdateGitLabOrfChatChannelSubscription({
        channelId: subscription.channelId,
        enabled: !subscription.enabled,
        subscriptionId: subscription.id,
      });
      const data = await getGitLabOrfChatSettings();
      applySettings(data);
      notify(subscription.enabled ? "GitLab 订阅已停用" : "GitLab 订阅已启用");
    } catch (error) {
      notify(error instanceof Error ? error.message : "GitLab 订阅更新失败");
    } finally {
      setMutatingSubscriptionId(null);
    }
  };

  const handleDeleteSubscription = async (subscription: GitLabOrfChatSubscription) => {
    if (mutatingSubscriptionId) return;
    setMutatingSubscriptionId(subscription.id);
    try {
      await requestDeleteGitLabOrfChatChannelSubscription({
        channelId: subscription.channelId,
        subscriptionId: subscription.id,
      });
      const data = await getGitLabOrfChatSettings();
      applySettings(data);
      notify("GitLab 订阅已删除");
    } catch (error) {
      notify(error instanceof Error ? error.message : "GitLab 订阅删除失败");
    } finally {
      setMutatingSubscriptionId(null);
    }
  };

  return (
    <section className="orf-settings-background-section">
      <div className="orf-settings-section-header">
        <div>
          <h2>GitLab 聊天订阅</h2>
          <p>把 GitLab group 或 project 的消息推送到指定频道。</p>
        </div>
        <Button type="button" size="sm" variant="secondary" disabled={!isReconcileConfigured || isReconcileRunning} onClick={() => void handleReconcile()}>
          {isReconcileRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          收敛
        </Button>
      </div>

      <div className="orf-settings-gitlab-body">
        {queryStatus === "loading" && <div className="orf-settings-background-state">加载中...</div>}
        {queryStatus === "error" && <div className="orf-settings-background-state">{queryErrorMessage ?? "GitLab 聊天绑定加载失败"}</div>}
        {settings && (
          <>
            <div className="orf-settings-gitlab-summary" aria-label="GitLab 集成配置状态">
              <GitLabStatusBadge label="集成" active={settings.config.enabled} />
              <GitLabStatusBadge label="GitLab" active={settings.config.gitlabUrlConfigured} />
              <GitLabStatusBadge label="Token" active={settings.config.accessTokenConfigured} />
              <GitLabStatusBadge label="Webhook" active={settings.config.webhookUrlConfigured && settings.config.webhookConfigured} />
              <GitLabStatusBadge label="签名" active={settings.config.signingTokenConfigured} />
              <span className="orf-settings-gitlab-group">Group: {settings.config.groupPath}</span>
              <span className="orf-settings-gitlab-group">Hook: {settings.config.hookMode}</span>
            </div>

            {settings.gitlabProjectListError && <div className="orf-settings-inline-error">{settings.gitlabProjectListError}</div>}

            <div className="orf-settings-gitlab-create">
              <select
                className="orf-settings-gitlab-select"
                value={draftChannelId}
                disabled={settings.channels.length === 0 || savingSubscription}
                onChange={(event) => setDraftChannelId(event.target.value)}
              >
                {settings.channels.length === 0 ? <option value="">暂无频道</option> : null}
                {settings.channels.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    {channel.displayName} · {channel.type === "public" ? "公开" : "私有"} · {channel.memberCount}
                  </option>
                ))}
              </select>
              <select
                className="orf-settings-gitlab-select"
                value={draftScope}
                disabled={savingSubscription}
                onChange={(event) => setDraftScope(event.target.value as "group" | "project")}
              >
                <option value="group">整个 group</option>
                <option value="project">单个 project</option>
              </select>
              {draftScope === "project" && (
                <select
                  className="orf-settings-gitlab-select"
                  value={draftProjectId}
                  disabled={settings.projects.length === 0 || savingSubscription}
                  onChange={(event) => setDraftProjectId(event.target.value)}
                >
                  {settings.projects.length === 0 ? <option value="">暂无 project</option> : null}
                  {settings.projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.path}
                    </option>
                  ))}
                </select>
              )}
              <div className="orf-settings-gitlab-events" aria-label="GitLab 事件类型">
                {settings.eventTypes.map((eventType) => (
                  <label key={eventType}>
                    <input
                      type="checkbox"
                      checked={draftEventTypes.includes(eventType)}
                      disabled={savingSubscription}
                      onChange={() => toggleDraftEventType(eventType)}
                    />
                    <span>{gitLabEventTypeLabel(eventType)}</span>
                  </label>
                ))}
              </div>
              <Button type="button" size="sm" disabled={!canCreateSubscription || savingSubscription} onClick={() => void handleCreateSubscription()}>
                {savingSubscription ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                订阅
              </Button>
            </div>

            <div className="orf-settings-gitlab-table" role="table" aria-label="GitLab 频道订阅">
              <div className="orf-settings-gitlab-row orf-settings-gitlab-head" role="row">
                <span role="columnheader">订阅</span>
                <span role="columnheader">频道</span>
                <span role="columnheader">状态</span>
              </div>
              {settings.subscriptions.length === 0 && <div className="orf-settings-background-state">暂无 GitLab 订阅。</div>}
              {settings.subscriptions.map((subscription) => {
                const isMutating = mutatingSubscriptionId === subscription.id;
                return (
                  <div className="orf-settings-gitlab-row" role="row" key={subscription.id}>
                    <div className="orf-settings-gitlab-project" role="cell">
                      <GitBranch className="h-4 w-4" />
                      <div>
                        {subscription.scope === "project" && subscription.gitlabProjectUrl ? (
                          <a href={subscription.gitlabProjectUrl} target="_blank" rel="noreferrer">{subscription.gitlabProjectPath}</a>
                        ) : (
                          <span>{subscription.scope === "group" ? subscription.gitlabGroupPath : subscription.gitlabProjectPath}</span>
                        )}
                        <small>{subscription.eventTypes.map(gitLabEventTypeLabel).join(" / ")}</small>
                      </div>
                    </div>
                    <div className="orf-settings-gitlab-binding-state" role="cell">
                      {subscription.channelDisplayName}
                      <small>
                        {subscription.channelType === "public" ? "公开频道" : "私有频道"}
                        {subscription.channelProviderConflict ? " · 频道冲突" : ""}
                      </small>
                    </div>
                    <div className="orf-settings-gitlab-channel-control" role="cell">
                      <GitLabStatusBadge label={subscription.enabled ? "启用" : "停用"} active={subscription.enabled} />
                      <Button type="button" size="sm" variant="secondary" disabled={isMutating} onClick={() => void handleToggleSubscription(subscription)}>
                        {isMutating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
                        {subscription.enabled ? "停用" : "启用"}
                      </Button>
                      <Button type="button" size="sm" variant="secondary" disabled={isMutating} onClick={() => void handleDeleteSubscription(subscription)}>
                        <Trash2 className="h-4 w-4" />
                        删除
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function GitLabStatusBadge({ active, label }: { active: boolean; label: string }) {
  return <span className={clsx("orf-settings-gitlab-badge", active && "orf-settings-gitlab-badge-active")}>{label}</span>;
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
