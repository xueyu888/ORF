import { readFile } from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

const mattermostGitLabPluginId = "com.github.manland.mattermost-plugin-gitlab";
const defaultMattermostGitLabWebhookPath = `/plugins/${mattermostGitLabPluginId}/webhook`;

const configSchema = z
  .object({
    GITLAB_MATTERMOST_WEBHOOK_RECONCILE_ENABLED: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
    GITLAB_URL: z.string().url().optional(),
    GITLAB_USER: z.string().trim().min(1).optional(),
    GITLAB_MATTERMOST_WEBHOOK_RECONCILE_GROUP: z.string().trim().min(1).default("develop"),
    GITLAB_MATTERMOST_WEBHOOK_RECONCILE_INTERVAL_SECONDS: z.coerce.number().int().positive().default(60),
    GITLAB_MATTERMOST_WEBHOOK_RECONCILE_CREDENTIALS_FILE: z.string().trim().min(1).optional(),
    GITLAB_MATTERMOST_WEBHOOK_RECONCILE_ACCESS_TOKEN: z.string().trim().min(1).optional(),
    GITLAB_MATTERMOST_WEBHOOK_RECONCILE_USERNAME: z.string().trim().min(1).optional(),
    GITLAB_MATTERMOST_WEBHOOK_RECONCILE_PASSWORD: z.string().min(1).optional(),
    GITLAB_MATTERMOST_WEBHOOK_RECONCILE_PUSH_EVENT_HOOKS_LIMIT: z.coerce.number().int().nonnegative().default(1000),
    GITLAB_MATTERMOST_WEBHOOK_URL: z.string().url().optional(),
    GITLAB_MATTERMOST_WEBHOOK_SECRET: z.string().min(1).optional(),
    GITLAB_MATTERMOST_WEBHOOK_SECRET_CONFIG_FILE: z.string().trim().min(1).optional(),
    MATTERMOST_URL: z.string().url().optional(),
  })
  .transform((value, context) => {
    if (value.GITLAB_MATTERMOST_WEBHOOK_RECONCILE_ENABLED && !value.GITLAB_URL) {
      context.addIssue({
        code: "custom",
        message: "GITLAB_URL is required when GitLab Mattermost webhook reconciliation is enabled",
        path: ["GITLAB_URL"],
      });
    }

    const webhookUrl = value.GITLAB_MATTERMOST_WEBHOOK_URL ?? buildMattermostGitLabWebhookUrl(value.MATTERMOST_URL);
    if (value.GITLAB_MATTERMOST_WEBHOOK_RECONCILE_ENABLED && !webhookUrl) {
      context.addIssue({
        code: "custom",
        message: "GITLAB_MATTERMOST_WEBHOOK_URL or MATTERMOST_URL is required when GitLab Mattermost webhook reconciliation is enabled",
        path: ["GITLAB_MATTERMOST_WEBHOOK_URL"],
      });
    }

    return {
      enabled: value.GITLAB_MATTERMOST_WEBHOOK_RECONCILE_ENABLED,
      gitlabUrl: value.GITLAB_URL ?? "",
      gitlabUser: value.GITLAB_MATTERMOST_WEBHOOK_RECONCILE_USERNAME ?? value.GITLAB_USER,
      groupPath: value.GITLAB_MATTERMOST_WEBHOOK_RECONCILE_GROUP,
      intervalSeconds: value.GITLAB_MATTERMOST_WEBHOOK_RECONCILE_INTERVAL_SECONDS,
      credentialsFile: value.GITLAB_MATTERMOST_WEBHOOK_RECONCILE_CREDENTIALS_FILE,
      accessToken: value.GITLAB_MATTERMOST_WEBHOOK_RECONCILE_ACCESS_TOKEN,
      password: value.GITLAB_MATTERMOST_WEBHOOK_RECONCILE_PASSWORD,
      pushEventHooksLimit: value.GITLAB_MATTERMOST_WEBHOOK_RECONCILE_PUSH_EVENT_HOOKS_LIMIT,
      webhookUrl: webhookUrl ?? "",
      webhookSecret: value.GITLAB_MATTERMOST_WEBHOOK_SECRET,
      webhookSecretConfigFile: value.GITLAB_MATTERMOST_WEBHOOK_SECRET_CONFIG_FILE,
    };
  });

const gitlabProjectSchema = z.object({
  id: z.number().int().positive(),
  path_with_namespace: z.string().min(1),
});

const gitlabProjectsSchema = z.array(gitlabProjectSchema);
const gitlabHookSchema = z.object({
  id: z.number().int().positive(),
  url: z.string().url(),
  push_events: z.boolean().optional(),
  tag_push_events: z.boolean().optional(),
  merge_requests_events: z.boolean().optional(),
  issues_events: z.boolean().optional(),
  confidential_issues_events: z.boolean().optional(),
  note_events: z.boolean().optional(),
  confidential_note_events: z.boolean().optional(),
  job_events: z.boolean().optional(),
  pipeline_events: z.boolean().optional(),
  wiki_page_events: z.boolean().optional(),
  deployment_events: z.boolean().optional(),
  releases_events: z.boolean().optional(),
  enable_ssl_verification: z.boolean().optional(),
  branch_filter_strategy: z.string().nullable().optional(),
  push_events_branch_filter: z.string().nullable().optional(),
});
const gitlabHooksSchema = z.array(gitlabHookSchema);
const gitlabSettingsSchema = z.object({
  push_event_hooks_limit: z.number().int().nullable().optional(),
});
const gitlabOAuthTokenSchema = z.object({
  access_token: z.string().min(1),
});
const mattermostConfigSchema = z.object({
  PluginSettings: z
    .object({
      Plugins: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
});

type GitLabMattermostWebhookReconcilerConfig = z.infer<typeof configSchema>;
type GitLabProject = z.infer<typeof gitlabProjectSchema>;
type GitLabHook = z.infer<typeof gitlabHookSchema>;
type Fetch = typeof fetch;

export type GitLabMattermostWebhookReconcileResult = {
  projects: number;
  created: string[];
  updated: string[];
  unchanged: string[];
  failed: string[];
  duplicates: string[];
  pushEventHooksLimit?: {
    before: number | null;
    after: number | null;
    updated: boolean;
  };
};

class GitLabApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
    this.name = "GitLabApiError";
  }
}

export function readGitLabMattermostWebhookReconcilerConfig(env: NodeJS.ProcessEnv = process.env) {
  return configSchema.parse(env);
}

export function gitLabMattermostWebhookReconcilerConfigured(config: GitLabMattermostWebhookReconcilerConfig) {
  return Boolean(
    config.enabled &&
      config.gitlabUrl &&
      config.webhookUrl &&
      (config.accessToken || config.password || config.credentialsFile) &&
      (config.webhookSecret || config.webhookSecretConfigFile),
  );
}

export async function reconcileGitLabMattermostProjectWebhooks(
  config: GitLabMattermostWebhookReconcilerConfig,
  options: { fetchImpl?: Fetch } = {},
): Promise<GitLabMattermostWebhookReconcileResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const token = await getGitLabAccessToken(config, fetchImpl);
  const webhookSecret = await getMattermostGitLabWebhookSecret(config);
  const result: GitLabMattermostWebhookReconcileResult = {
    projects: 0,
    created: [],
    updated: [],
    unchanged: [],
    failed: [],
    duplicates: [],
  };

  result.pushEventHooksLimit = await reconcilePushEventHooksLimit(config, token, fetchImpl);

  const projects = await listDevelopProjects(config, token, fetchImpl);
  result.projects = projects.length;

  for (const project of projects) {
    try {
      const hooks = await listProjectHooks(config, token, fetchImpl, project.id);
      const matchingHooks = hooks.filter((hook) => hook.url === config.webhookUrl);

      if (matchingHooks.length > 1) {
        result.duplicates.push(`${project.path_with_namespace}: ${matchingHooks.length}`);
      }

      if (matchingHooks.length === 0) {
        await createProjectHook(config, token, fetchImpl, project.id, webhookSecret);
        result.created.push(project.path_with_namespace);
        continue;
      }

      const hook = matchingHooks[0];
      if (projectHookMatchesTarget(hook)) {
        result.unchanged.push(project.path_with_namespace);
      } else {
        await updateProjectHook(config, token, fetchImpl, project.id, hook.id, webhookSecret);
        result.updated.push(project.path_with_namespace);
      }
    } catch (error) {
      result.failed.push(`${project.path_with_namespace}: ${errorMessage(error)}`);
    }
  }

  return result;
}

export function registerGitLabMattermostWebhookReconciler(app: FastifyInstance) {
  const config = readGitLabMattermostWebhookReconcilerConfig();

  if (!gitLabMattermostWebhookReconcilerConfigured(config)) {
    const logPayload = {
      enabled: config.enabled,
      gitlabUrlConfigured: Boolean(config.gitlabUrl),
      webhookUrlConfigured: Boolean(config.webhookUrl),
      gitlabAuthConfigured: Boolean(config.accessToken || config.password || config.credentialsFile),
      webhookSecretConfigured: Boolean(config.webhookSecret || config.webhookSecretConfigFile),
      groupPath: config.groupPath,
    };

    if (config.enabled) {
      app.log.warn(logPayload, "GitLab Mattermost webhook reconciler is enabled but not fully configured");
    } else {
      app.log.info(logPayload, "GitLab Mattermost webhook reconciler disabled");
    }
    return;
  }

  let running = false;
  const run = async () => {
    if (running) {
      return;
    }

    running = true;
    try {
      const result = await reconcileGitLabMattermostProjectWebhooks(config);
      const logPayload = {
        projects: result.projects,
        created: result.created.length,
        updated: result.updated.length,
        unchanged: result.unchanged.length,
        failed: result.failed.length,
        duplicates: result.duplicates.length,
        pushEventHooksLimit: result.pushEventHooksLimit,
      };

      if (result.failed.length > 0 || result.duplicates.length > 0) {
        app.log.warn({ ...logPayload, failed: result.failed, duplicates: result.duplicates }, "GitLab Mattermost webhook reconciliation completed with warnings");
      } else {
        app.log.info(logPayload, "GitLab Mattermost webhook reconciliation completed");
      }
    } catch (error) {
      app.log.error(error, "GitLab Mattermost webhook reconciliation failed");
    } finally {
      running = false;
    }
  };

  void run();
  const interval = setInterval(run, config.intervalSeconds * 1000);
  app.addHook("onClose", async () => {
    clearInterval(interval);
  });
}

export function projectHookMatchesTarget(hook: GitLabHook) {
  return (
    hook.push_events === true &&
    hook.tag_push_events === true &&
    hook.merge_requests_events === true &&
    hook.issues_events === true &&
    hook.confidential_issues_events === true &&
    hook.note_events === true &&
    hook.confidential_note_events === true &&
    hook.job_events === true &&
    hook.pipeline_events === true &&
    hook.wiki_page_events === true &&
    hook.deployment_events === true &&
    hook.releases_events === true &&
    hook.enable_ssl_verification === true &&
    hook.branch_filter_strategy === "all_branches" &&
    hook.push_events_branch_filter === null
  );
}

function buildMattermostGitLabWebhookUrl(mattermostUrl: string | undefined) {
  return mattermostUrl ? `${mattermostUrl.replace(/\/+$/, "")}${defaultMattermostGitLabWebhookPath}` : undefined;
}

async function getGitLabAccessToken(config: GitLabMattermostWebhookReconcilerConfig, fetchImpl: Fetch) {
  if (config.accessToken) {
    return config.accessToken;
  }

  const credentials = await getGitLabPasswordCredentials(config);
  if (!credentials) {
    throw new Error("GitLab access token, password, or credentials file is required");
  }

  const response = await fetchImpl(`${baseUrl(config.gitlabUrl)}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant_type: "password",
      username: credentials.username,
      password: credentials.password,
    }),
  });

  if (!response.ok) {
    throw await gitLabApiError(response, "GitLab OAuth password grant failed");
  }

  return gitlabOAuthTokenSchema.parse(await response.json()).access_token;
}

async function getGitLabPasswordCredentials(config: GitLabMattermostWebhookReconcilerConfig) {
  if (config.gitlabUser && config.password) {
    return { username: config.gitlabUser, password: config.password };
  }

  if (!config.credentialsFile) {
    return null;
  }

  const credentials = await readFile(config.credentialsFile, "utf8");
  const gitlabHost = new URL(config.gitlabUrl).host;
  for (const line of credentials.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }

    let parsed: URL;
    try {
      parsed = new URL(line.trim());
    } catch {
      continue;
    }

    if (parsed.host !== gitlabHost || !parsed.username || !parsed.password) {
      continue;
    }

    if (config.gitlabUser && decodeURIComponent(parsed.username) !== config.gitlabUser) {
      continue;
    }

    return {
      username: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
    };
  }

  throw new Error(`No matching GitLab credential found in ${config.credentialsFile}`);
}

async function getMattermostGitLabWebhookSecret(config: GitLabMattermostWebhookReconcilerConfig) {
  if (config.webhookSecret) {
    return config.webhookSecret;
  }

  if (!config.webhookSecretConfigFile) {
    throw new Error("Mattermost GitLab webhook secret is not configured");
  }

  const raw = await readFile(config.webhookSecretConfigFile, "utf8");
  const mattermostConfig = mattermostConfigSchema.parse(JSON.parse(raw));
  const pluginConfig = mattermostConfig.PluginSettings?.Plugins?.[mattermostGitLabPluginId];
  if (!pluginConfig || typeof pluginConfig !== "object") {
    throw new Error(`Mattermost GitLab plugin config is missing in ${config.webhookSecretConfigFile}`);
  }

  const secret = (pluginConfig as Record<string, unknown>).webhooksecret;
  if (typeof secret !== "string" || secret.length === 0 || /^\*+$/.test(secret)) {
    throw new Error("Mattermost GitLab webhook secret is missing or redacted");
  }

  return secret;
}

async function reconcilePushEventHooksLimit(config: GitLabMattermostWebhookReconcilerConfig, token: string, fetchImpl: Fetch) {
  if (config.pushEventHooksLimit <= 0) {
    return undefined;
  }

  const settingsResponse = await gitLabRequest(config, token, fetchImpl, "/application/settings", {}, gitlabSettingsSchema);
  const current = settingsResponse.push_event_hooks_limit ?? null;
  if (typeof current === "number" && current >= config.pushEventHooksLimit) {
    return { before: current, after: current, updated: false };
  }

  const nextSettings = await gitLabRequest(
    config,
    token,
    fetchImpl,
    "/application/settings",
    {
      method: "PUT",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ push_event_hooks_limit: String(config.pushEventHooksLimit) }),
    },
    gitlabSettingsSchema,
  );

  return {
    before: current,
    after: nextSettings.push_event_hooks_limit ?? null,
    updated: true,
  };
}

async function listDevelopProjects(config: GitLabMattermostWebhookReconcilerConfig, token: string, fetchImpl: Fetch) {
  const projects: GitLabProject[] = [];
  const encodedGroupPath = encodeURIComponent(config.groupPath);

  for (let page = 1; ; page += 1) {
    const pageProjects = await gitLabRequest(
      config,
      token,
      fetchImpl,
      `/groups/${encodedGroupPath}/projects?include_subgroups=true&simple=true&per_page=100&page=${page}`,
      {},
      gitlabProjectsSchema,
    );
    projects.push(...pageProjects);

    if (pageProjects.length < 100) {
      return projects;
    }
  }
}

async function listProjectHooks(config: GitLabMattermostWebhookReconcilerConfig, token: string, fetchImpl: Fetch, projectId: number) {
  return gitLabRequest(config, token, fetchImpl, `/projects/${projectId}/hooks`, {}, gitlabHooksSchema);
}

async function createProjectHook(
  config: GitLabMattermostWebhookReconcilerConfig,
  token: string,
  fetchImpl: Fetch,
  projectId: number,
  webhookSecret: string,
) {
  await gitLabRequest(config, token, fetchImpl, `/projects/${projectId}/hooks`, projectHookRequest(webhookSecret, config.webhookUrl, "POST"), z.unknown());
}

async function updateProjectHook(
  config: GitLabMattermostWebhookReconcilerConfig,
  token: string,
  fetchImpl: Fetch,
  projectId: number,
  hookId: number,
  webhookSecret: string,
) {
  await gitLabRequest(config, token, fetchImpl, `/projects/${projectId}/hooks/${hookId}`, projectHookRequest(webhookSecret, config.webhookUrl, "PUT"), z.unknown());
}

function projectHookRequest(webhookSecret: string, webhookUrl: string, method: "POST" | "PUT"): RequestInit {
  return {
    method,
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      url: webhookUrl,
      token: webhookSecret,
      push_events: "true",
      tag_push_events: "true",
      merge_requests_events: "true",
      issues_events: "true",
      confidential_issues_events: "true",
      note_events: "true",
      confidential_note_events: "true",
      job_events: "true",
      pipeline_events: "true",
      wiki_page_events: "true",
      deployment_events: "true",
      releases_events: "true",
      enable_ssl_verification: "true",
      branch_filter_strategy: "all_branches",
      push_events_branch_filter: "",
    }),
  };
}

async function gitLabRequest<T>(
  config: GitLabMattermostWebhookReconcilerConfig,
  token: string,
  fetchImpl: Fetch,
  path: string,
  init: RequestInit,
  schema: z.ZodType<T>,
) {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${token}`);
  const response = await fetchImpl(`${baseUrl(config.gitlabUrl)}/api/v4${path}`, {
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

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
