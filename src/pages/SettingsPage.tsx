import { clsx } from "clsx";
import { Check, GitBranch, Link, Loader2, MessageSquare, RefreshCw, Upload } from "lucide-react";
import { type KeyboardEvent, useEffect, useState } from "react";
import {
  getGitLabOrfChatSettings,
  getChatSettings,
  reconcileGitLabOrfChatSettings as requestReconcileGitLabOrfChatSettings,
  saveChatSettings as requestSaveChatSettings,
  saveGitLabOrfProjectChannel as requestSaveGitLabOrfProjectChannel,
  type ChatSettingsData,
  type GitLabOrfChatProjectBinding,
  type GitLabOrfChatSettingsData,
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
  return (
    <div className="orf-settings-page orf-settings-page-single">
      <section className="orf-settings-detail" aria-label="设置详情">
        <div className="orf-settings-detail-heading">
          <span>System Config</span>
          <p>管理全站视觉、聊天和系统级策略。</p>
        </div>

        <div className="orf-settings-sections">
          <ChatSettingSection />
          <GitLabOrfChatSettingSection />
          <VisualSkinWorkbench scope="system" />
        </div>
      </section>
    </div>
  );
}

function ChatSettingSection() {
  const { notify, readModelInvalidations } = useOrf();
  const settingsInvalidationKey = readModelInvalidationKey(readModelInvalidations, "settings");
  const [settings, setSettings] = useState<ChatSettingsData | null>(null);
  const [inputValue, setInputValue] = useState("2");
  const [queryStatus, setQueryStatus] = useState<RequestStatus>("idle");
  const [queryErrorMessage, setQueryErrorMessage] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<RequestStatus>("idle");
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);

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
    void getChatSettings()
      .then((data) => {
        if (cancelled) return;
        setSettings(data);
        setInputValue(uploadBytesToGbInput(data.attachmentMaxBytes));
        setQueryStatus("success");
      })
      .catch((error) => {
        if (cancelled) return;
        setQueryStatus("error");
        setQueryErrorMessage(error instanceof Error ? error.message : "聊天设置加载失败");
      });
    return () => {
      cancelled = true;
    };
  }, [settingsInvalidationKey]);

  const handleSave = async () => {
    if (!settings || isSaveDisabled || nextBytes === null) return;
    setSaveStatus("loading");
    setSaveErrorMessage(null);
    try {
      const data = await requestSaveChatSettings({ attachmentMaxBytes: nextBytes });
      setSettings(data);
      setInputValue(uploadBytesToGbInput(data.attachmentMaxBytes));
      setSaveStatus("success");
      notify("聊天设置已保存");
    } catch (error) {
      const message = error instanceof Error ? error.message : "聊天设置保存失败";
      setSaveStatus("error");
      setSaveErrorMessage(message);
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
          <h2>聊天设置</h2>
          <p>配置聊天附件上传上限。</p>
        </div>
        <Button type="button" size="sm" disabled={isSaveDisabled} onClick={() => void handleSave()}>
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          保存
        </Button>
      </div>

      <div className="orf-settings-background-controls" aria-label="聊天设置">
        <div className="orf-settings-background-label">
          <MessageSquare className="h-5 w-5" />
          <span>附件上限</span>
        </div>
        <div className="orf-settings-control-field orf-settings-interval-field">
          <input
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
          {(validationMessage || saveErrorMessage) && <span className="orf-settings-inline-error">{validationMessage ?? saveErrorMessage}</span>}
        </div>

        <div className="orf-settings-background-label">
          <Upload className="h-5 w-5" />
          <span>承载上限</span>
        </div>
        <div className="orf-settings-control-field">
          {queryStatus === "loading" && <span className="orf-settings-inline-error">加载中...</span>}
          {queryStatus === "error" && <span className="orf-settings-inline-error">{queryErrorMessage ?? "聊天设置加载失败"}</span>}
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
  const [draftChannelIds, setDraftChannelIds] = useState<Record<string, string>>({});
  const [queryStatus, setQueryStatus] = useState<RequestStatus>("idle");
  const [queryErrorMessage, setQueryErrorMessage] = useState<string | null>(null);
  const [savingProjectId, setSavingProjectId] = useState<string | null>(null);
  const [reconcileStatus, setReconcileStatus] = useState<RequestStatus>("idle");

  const isReconcileConfigured = Boolean(
    settings?.config.enabled &&
      settings.config.gitlabUrlConfigured &&
      settings.config.accessTokenConfigured &&
      settings.config.webhookUrlConfigured &&
      settings.config.webhookSecretConfigured,
  );
  const isReconcileRunning = reconcileStatus === "loading";

  const applySettings = (data: GitLabOrfChatSettingsData) => {
    setSettings(data);
    setDraftChannelIds(Object.fromEntries(data.projects.map((project) => [project.projectId, project.channelId ?? ""])));
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
      notify("GitLab 项目频道已收敛");
    } catch (error) {
      const message = error instanceof Error ? error.message : "GitLab 项目频道收敛失败";
      setReconcileStatus("error");
      notify(message);
    }
  };

  const handleSave = async (project: GitLabOrfChatProjectBinding) => {
    const channelId = draftChannelIds[project.projectId] ?? "";
    if (!channelId || channelId === project.channelId || savingProjectId) return;
    setSavingProjectId(project.projectId);
    try {
      const data = await requestSaveGitLabOrfProjectChannel({
        channelId,
        projectId: project.projectId,
        projectPath: project.projectPath,
        projectUrl: project.projectUrl,
      });
      applySettings(data);
      notify("GitLab 频道绑定已保存");
    } catch (error) {
      notify(error instanceof Error ? error.message : "GitLab 频道绑定保存失败");
    } finally {
      setSavingProjectId(null);
    }
  };

  return (
    <section className="orf-settings-background-section">
      <div className="orf-settings-section-header">
        <div>
          <h2>GitLab 聊天绑定</h2>
          <p>配置 GitLab project 对应的 ORF 聊天频道。</p>
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
              <GitLabStatusBadge label="Webhook" active={settings.config.webhookUrlConfigured && settings.config.webhookSecretConfigured} />
              <span className="orf-settings-gitlab-group">Group: {settings.config.groupPath}</span>
              <span className="orf-settings-gitlab-group">默认: {settings.config.channelType === "public" ? "公开频道" : "私有频道"}</span>
            </div>

            {settings.gitlabProjectListError && <div className="orf-settings-inline-error">{settings.gitlabProjectListError}</div>}

            <div className="orf-settings-gitlab-table" role="table" aria-label="GitLab project 频道绑定">
              <div className="orf-settings-gitlab-row orf-settings-gitlab-head" role="row">
                <span role="columnheader">Project</span>
                <span role="columnheader">频道</span>
                <span role="columnheader">状态</span>
              </div>
              {settings.projects.length === 0 && <div className="orf-settings-background-state">暂无 GitLab project。</div>}
              {settings.projects.map((project) => {
                const draftChannelId = draftChannelIds[project.projectId] ?? "";
                const changed = Boolean(draftChannelId && draftChannelId !== (project.channelId ?? ""));
                const isSaving = savingProjectId === project.projectId;
                return (
                  <div className="orf-settings-gitlab-row" role="row" key={project.projectId}>
                    <div className="orf-settings-gitlab-project" role="cell">
                      <GitBranch className="h-4 w-4" />
                      <div>
                        {project.projectUrl ? (
                          <a href={project.projectUrl} target="_blank" rel="noreferrer">{project.projectPath}</a>
                        ) : (
                          <span>{project.projectPath}</span>
                        )}
                        <small>{project.projectId}</small>
                      </div>
                    </div>
                    <div className="orf-settings-gitlab-channel-control" role="cell">
                      <select
                        className="orf-settings-gitlab-select"
                        value={draftChannelId}
                        disabled={settings.channels.length === 0 || isSaving}
                        onChange={(event) => setDraftChannelIds((current) => ({ ...current, [project.projectId]: event.target.value }))}
                      >
                        <option value="">未绑定</option>
                        {settings.channels.map((channel) => (
                          <option key={channel.id} value={channel.id}>
                            {channel.displayName} · {channel.type === "public" ? "公开" : "私有"} · {channel.memberCount}
                          </option>
                        ))}
                      </select>
                      <Button type="button" size="sm" disabled={!changed || isSaving} onClick={() => void handleSave(project)}>
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link className="h-4 w-4" />}
                        绑定
                      </Button>
                    </div>
                    <div className="orf-settings-gitlab-binding-state" role="cell">
                      {project.channelId ? project.channelDisplayName ?? project.channelId : "未绑定"}
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
