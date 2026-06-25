import { z } from "zod";
import type { GitLabOrfChatConfig } from "./config";

type Fetch = typeof fetch;

const gitLabProjectSchema = z.object({
  id: z.union([z.number().int().positive(), z.string().min(1)]).transform(String),
  path_with_namespace: z.string().min(1),
  web_url: z.string().optional().default(""),
});
const gitLabProjectsSchema = z.array(gitLabProjectSchema);

const gitLabHookSchema = z.object({
  id: z.number().int().positive(),
  url: z.string().url(),
  push_events: z.boolean().optional(),
  tag_push_events: z.boolean().optional(),
  merge_requests_events: z.boolean().optional(),
  issues_events: z.boolean().optional(),
  pipeline_events: z.boolean().optional(),
  enable_ssl_verification: z.boolean().optional(),
  branch_filter_strategy: z.string().nullable().optional(),
  push_events_branch_filter: z.string().nullable().optional(),
});
const gitLabHooksSchema = z.array(gitLabHookSchema);

export type GitLabApiProject = {
  id: string;
  path: string;
  url: string;
};

type GitLabProject = z.infer<typeof gitLabProjectSchema>;
type GitLabHook = z.infer<typeof gitLabHookSchema>;

export type GitLabOrfChatHookReconcileAction = "created" | "updated" | "unchanged";

export type GitLabOrfChatHookReconcileResult = {
  created: string[];
  duplicates: string[];
  failed: string[];
  group: null | {
    action: GitLabOrfChatHookReconcileAction;
    duplicateCount: number;
    target: string;
  };
  mode: GitLabOrfChatConfig["GITLAB_ORF_CHAT_HOOK_MODE"];
  projects: number;
  unchanged: string[];
  updated: string[];
};

export class GitLabApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
    this.name = "GitLabApiError";
  }
}

export async function listGitLabGroupProjects(config: GitLabOrfChatConfig, options: { fetchImpl?: Fetch } = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const projects: GitLabProject[] = [];
  const encodedGroupPath = encodeURIComponent(config.GITLAB_ORF_CHAT_GROUP);

  for (let page = 1; ; page += 1) {
    const pageProjects = await gitLabRequest(
      config,
      fetchImpl,
      `/groups/${encodedGroupPath}/projects?include_subgroups=true&simple=true&per_page=100&page=${page}`,
      {},
      gitLabProjectsSchema,
    );
    projects.push(...pageProjects);
    if (pageProjects.length < 100) {
      return projects.map((project): GitLabApiProject => ({
        id: project.id,
        path: project.path_with_namespace,
        url: project.web_url,
      }));
    }
  }
}

export async function reconcileGitLabOrfGroupHook(input: {
  config: GitLabOrfChatConfig;
  fetchImpl?: Fetch;
}) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const groupPath = encodeURIComponent(input.config.GITLAB_ORF_CHAT_GROUP);
  const hooks = await gitLabRequest(input.config, fetchImpl, `/groups/${groupPath}/hooks`, {}, gitLabHooksSchema);
  const matchingHooks = hooks.filter((hook) => hook.url === input.config.GITLAB_ORF_CHAT_WEBHOOK_URL);
  const duplicateCount = Math.max(0, matchingHooks.length - 1);

  if (matchingHooks.length === 0) {
    await gitLabRequest(input.config, fetchImpl, `/groups/${groupPath}/hooks`, hookRequest(input.config, "POST"), z.unknown());
    return { action: "created" as const, duplicateCount };
  }

  const hook = matchingHooks[0]!;
  if (hookMatchesTarget(hook)) {
    return { action: "unchanged" as const, duplicateCount };
  }

  await gitLabRequest(input.config, fetchImpl, `/groups/${groupPath}/hooks/${hook.id}`, hookRequest(input.config, "PUT"), z.unknown());
  return { action: "updated" as const, duplicateCount };
}

export async function reconcileGitLabOrfProjectHook(input: {
  config: GitLabOrfChatConfig;
  fetchImpl?: Fetch;
  project: GitLabApiProject;
}) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const projectId = encodeURIComponent(input.project.id);
  const hooks = await gitLabRequest(input.config, fetchImpl, `/projects/${projectId}/hooks`, {}, gitLabHooksSchema);
  const matchingHooks = hooks.filter((hook) => hook.url === input.config.GITLAB_ORF_CHAT_WEBHOOK_URL);
  const duplicateCount = Math.max(0, matchingHooks.length - 1);

  if (matchingHooks.length === 0) {
    await gitLabRequest(input.config, fetchImpl, `/projects/${projectId}/hooks`, hookRequest(input.config, "POST"), z.unknown());
    return { action: "created" as const, duplicateCount };
  }

  const hook = matchingHooks[0]!;
  if (hookMatchesTarget(hook)) {
    return { action: "unchanged" as const, duplicateCount };
  }

  await gitLabRequest(input.config, fetchImpl, `/projects/${projectId}/hooks/${hook.id}`, hookRequest(input.config, "PUT"), z.unknown());
  return { action: "updated" as const, duplicateCount };
}

export function hookMatchesTarget(hook: GitLabHook) {
  return (
    hook.push_events === true &&
    hook.tag_push_events === true &&
    hook.merge_requests_events === true &&
    hook.issues_events === true &&
    hook.pipeline_events === true &&
    hook.enable_ssl_verification === true &&
    hook.branch_filter_strategy === "all_branches" &&
    (hook.push_events_branch_filter === null || hook.push_events_branch_filter === "")
  );
}

function hookRequest(config: GitLabOrfChatConfig, method: "POST" | "PUT"): RequestInit {
  const body = new URLSearchParams({
    url: config.GITLAB_ORF_CHAT_WEBHOOK_URL ?? "",
    push_events: "true",
    tag_push_events: "true",
    merge_requests_events: "true",
    issues_events: "true",
    pipeline_events: "true",
    enable_ssl_verification: "true",
    branch_filter_strategy: "all_branches",
    push_events_branch_filter: "",
  });

  if (config.GITLAB_ORF_CHAT_WEBHOOK_SECRET) {
    body.set("token", config.GITLAB_ORF_CHAT_WEBHOOK_SECRET);
  }
  if (config.GITLAB_ORF_CHAT_SIGNING_TOKEN) {
    body.set("signing_token", config.GITLAB_ORF_CHAT_SIGNING_TOKEN);
  }

  return {
    method,
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  };
}

async function gitLabRequest<T>(
  config: GitLabOrfChatConfig,
  fetchImpl: Fetch,
  path: string,
  init: RequestInit,
  schema: z.ZodType<T>,
) {
  if (!config.GITLAB_URL || !config.GITLAB_ORF_CHAT_ACCESS_TOKEN) {
    throw new Error("GitLab URL and ORF chat access token are required");
  }

  const headers = new Headers(init.headers);
  headers.set("PRIVATE-TOKEN", config.GITLAB_ORF_CHAT_ACCESS_TOKEN);
  const response = await fetchImpl(`${baseUrl(config.GITLAB_URL)}/api/v4${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    throw await gitLabApiError(response, "GitLab API request failed");
  }

  return schema.parse(await response.json());
}

async function gitLabApiError(response: Response, message: string) {
  const body = await response.text().catch(() => "");
  return new GitLabApiError(`${message} with HTTP ${response.status}`, response.status, body.slice(0, 500));
}

function baseUrl(url: string) {
  return url.replace(/\/+$/, "");
}
