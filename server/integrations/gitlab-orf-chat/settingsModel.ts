import type { GitLabApiProject } from "./api";
import type { GitLabOrfChatConfig } from "./config";
import type { GitLabOrfChatEventType } from "./model";

export type GitLabOrfChatConfigStatus = {
  accessTokenConfigured: boolean;
  enabled: boolean;
  gitlabUrlConfigured: boolean;
  groupPath: string;
  hookMode: "group" | "project" | "both";
  signingTokenConfigured: boolean;
  webhookConfigured: boolean;
  webhookSecretConfigured: boolean;
  webhookUrlConfigured: boolean;
};

export type GitLabOrfChatChannelOption = {
  displayName: string;
  id: string;
  memberCount: number;
  name: string | null;
  type: "public" | "private";
};

export type GitLabOrfChatSubscriptionScope = "group" | "project";

export type GitLabOrfChatSubscription = {
  channelDisplayName: string;
  channelId: string;
  channelType: "public" | "private";
  createdAt: string;
  enabled: boolean;
  eventTypes: GitLabOrfChatEventType[];
  gitlabGroupPath: string;
  gitlabProjectId: string | null;
  gitlabProjectPath: string | null;
  gitlabProjectUrl: string;
  id: string;
  scope: GitLabOrfChatSubscriptionScope;
  updatedAt: string;
};

export type GitLabOrfChatSettingsData = {
  channels: GitLabOrfChatChannelOption[];
  config: GitLabOrfChatConfigStatus;
  eventTypes: GitLabOrfChatEventType[];
  gitlabProjectListError: string | null;
  projects: GitLabApiProject[];
  subscriptions: GitLabOrfChatSubscription[];
};

export function gitLabOrfChatConfigStatus(config: GitLabOrfChatConfig): GitLabOrfChatConfigStatus {
  return {
    accessTokenConfigured: Boolean(config.GITLAB_ORF_CHAT_ACCESS_TOKEN),
    enabled: config.GITLAB_ORF_CHAT_ENABLED,
    gitlabUrlConfigured: Boolean(config.GITLAB_URL),
    groupPath: config.GITLAB_ORF_CHAT_GROUP,
    hookMode: config.GITLAB_ORF_CHAT_HOOK_MODE,
    signingTokenConfigured: Boolean(config.GITLAB_ORF_CHAT_SIGNING_TOKEN),
    webhookConfigured: Boolean(config.GITLAB_ORF_CHAT_WEBHOOK_SECRET || config.GITLAB_ORF_CHAT_SIGNING_TOKEN),
    webhookSecretConfigured: Boolean(config.GITLAB_ORF_CHAT_WEBHOOK_SECRET),
    webhookUrlConfigured: Boolean(config.GITLAB_ORF_CHAT_WEBHOOK_URL),
  };
}
