import type { GitLabApiProject } from "./api";

export type GitLabOrfChatConfigStatus = {
  accessTokenConfigured: boolean;
  channelType: "public" | "private";
  enabled: boolean;
  gitlabUrlConfigured: boolean;
  groupPath: string;
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

export type GitLabOrfChatProjectMapping = {
  channelDisplayName: string | null;
  channelId: string;
  channelType: "public" | "private" | null;
  createdAt: string;
  lastSeenAt: string;
  projectId: string;
  projectPath: string;
  projectUrl: string;
  updatedAt: string;
};

export type GitLabOrfChatProjectBinding = {
  channelDisplayName: string | null;
  channelId: string | null;
  channelType: "public" | "private" | null;
  lastSeenAt: string | null;
  projectId: string;
  projectPath: string;
  projectUrl: string;
  source: "gitlab" | "mapping";
};

export type GitLabOrfChatSettingsData = {
  channels: GitLabOrfChatChannelOption[];
  config: GitLabOrfChatConfigStatus;
  gitlabProjectListError: string | null;
  projects: GitLabOrfChatProjectBinding[];
};

export function mergeGitLabOrfChatProjectBindings(input: {
  gitlabProjects: GitLabApiProject[];
  mappings: GitLabOrfChatProjectMapping[];
}) {
  const byProjectId = new Map<string, GitLabOrfChatProjectBinding>();

  for (const mapping of input.mappings) {
    byProjectId.set(mapping.projectId, {
      channelDisplayName: mapping.channelDisplayName,
      channelId: mapping.channelId,
      channelType: mapping.channelType,
      lastSeenAt: mapping.lastSeenAt,
      projectId: mapping.projectId,
      projectPath: mapping.projectPath,
      projectUrl: mapping.projectUrl,
      source: "mapping",
    });
  }

  for (const project of input.gitlabProjects) {
    const existing = byProjectId.get(project.id);
    byProjectId.set(project.id, {
      channelDisplayName: existing?.channelDisplayName ?? null,
      channelId: existing?.channelId ?? null,
      channelType: existing?.channelType ?? null,
      lastSeenAt: existing?.lastSeenAt ?? null,
      projectId: project.id,
      projectPath: project.path,
      projectUrl: project.url,
      source: "gitlab",
    });
  }

  return Array.from(byProjectId.values()).sort((left, right) =>
    left.projectPath.localeCompare(right.projectPath, "zh-Hans-CN", { sensitivity: "base" }) ||
    left.projectId.localeCompare(right.projectId),
  );
}
