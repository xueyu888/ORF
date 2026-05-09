import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Readable } from "node:stream";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

const configSchema = z.object({
  MATTERMOST_URL: z.string().url().optional(),
  MATTERMOST_LOGIN_ID: z.string().optional(),
  MATTERMOST_PASSWORD: z.string().optional(),
  MATTERMOST_CHANNEL_ID: z.string().optional(),
  GITHUB_REPOSITORY_FULL_NAME: z.string().default("xueyu888/ORF"),
  GITHUB_WEBHOOK_SECRET: z.string().min(16).optional(),
  GITHUB_SYNC_ENABLED: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  GITHUB_SYNC_BRANCH: z.string().default("*"),
  GITHUB_SYNC_INTERVAL_SECONDS: z.coerce.number().int().positive().default(60),
  GITHUB_SYNC_LOOKBACK: z.coerce.number().int().positive().default(20),
  GITHUB_SYNC_STATE_FILE: z.string().default(".artifacts/github-sync-state.json"),
  GITHUB_API_URL: z.string().url().default("https://api.github.com"),
  GITHUB_TOKEN: z.string().optional(),
});

const githubCommitSchema = z.object({
  id: z.string().min(1),
  message: z.string().default(""),
  url: z.string().url().optional(),
  timestamp: z.string().optional(),
  author: z
    .object({
      name: z.string().optional(),
      username: z.string().optional(),
      email: z.string().optional(),
    })
    .optional(),
});

const githubPushPayloadSchema = z.object({
  ref: z.string().min(1),
  before: z.string().optional(),
  after: z.string().optional(),
  compare: z.string().url().optional(),
  pusher: z
    .object({
      name: z.string().optional(),
      email: z.string().optional(),
    })
    .optional(),
  repository: z.object({
    full_name: z.string().min(1),
    html_url: z.string().url().optional(),
  }),
  sender: z
    .object({
      login: z.string().optional(),
      html_url: z.string().url().optional(),
    })
    .optional(),
  commits: z.array(githubCommitSchema).default([]),
  head_commit: githubCommitSchema.nullable().optional(),
});

const githubApiCommitSchema = z.object({
  sha: z.string().min(1),
  html_url: z.string().url().optional(),
  commit: z.object({
    message: z.string().default(""),
    author: z
      .object({
        name: z.string().nullable().optional(),
      })
      .nullable()
      .optional(),
  }),
  author: z
    .object({
      login: z.string().optional(),
    })
    .nullable()
    .optional(),
});

const githubApiCommitsSchema = z.array(githubApiCommitSchema);
const githubApiBranchSchema = z.object({
  name: z.string().min(1),
  commit: z.object({
    sha: z.string().min(1),
  }),
});
const githubApiBranchesSchema = z.array(githubApiBranchSchema);
const syncStateSchema = z.record(
  z.string(),
  z.object({
    lastSeenSha: z.string().min(1),
  }),
);

type GitHubMattermostSyncConfig = z.infer<typeof configSchema>;
export type GitHubPushPayload = z.infer<typeof githubPushPayloadSchema>;
type GitHubApiCommit = z.infer<typeof githubApiCommitSchema>;

function readConfig() {
  return configSchema.parse(process.env);
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function shortSha(sha: string | undefined) {
  return sha ? sha.slice(0, 7) : "unknown";
}

function refName(ref: string) {
  if (ref.startsWith("refs/heads/")) {
    return ref.slice("refs/heads/".length);
  }

  if (ref.startsWith("refs/tags/")) {
    return ref.slice("refs/tags/".length);
  }

  return ref;
}

function actorName(payload: GitHubPushPayload) {
  return payload.pusher?.name || payload.sender?.login || "unknown";
}

function firstCommitLine(message: string) {
  return message.split(/\r?\n/, 1)[0]?.trim() || "No commit message";
}

function commitAuthor(commit: GitHubPushPayload["commits"][number]) {
  return commit.author?.username || commit.author?.name || commit.author?.email || "unknown";
}

function commitLine(commit: GitHubPushPayload["commits"][number]) {
  const sha = shortSha(commit.id);
  const prefix = commit.url ? `- [\`${sha}\`](${commit.url})` : `- \`${sha}\``;
  return `${prefix} ${firstCommitLine(commit.message)} - ${commitAuthor(commit)}`;
}

function githubApiCommitLine(commit: GitHubApiCommit) {
  const sha = shortSha(commit.sha);
  const prefix = commit.html_url ? `- [\`${sha}\`](${commit.html_url})` : `- \`${sha}\``;
  const author = commit.author?.login || commit.commit.author?.name || "unknown";
  return `${prefix} ${firstCommitLine(commit.commit.message)} - ${author}`;
}

export function formatGitHubPushMessage(payload: GitHubPushPayload) {
  const branch = refName(payload.ref);
  const commits = payload.commits.length > 0 ? payload.commits : payload.head_commit ? [payload.head_commit] : [];
  const commitCount = commits.length;
  const visibleCommits = commits.slice(0, 8);
  const repo = payload.repository.html_url ? `[${payload.repository.full_name}](${payload.repository.html_url})` : payload.repository.full_name;
  const compareLine = payload.compare ? `\nCompare: ${payload.compare}` : "";
  const commitWord = commitCount === 1 ? "commit" : "commits";
  const hiddenCommitCount = Math.max(0, commitCount - visibleCommits.length);
  const commitLines = visibleCommits.map(commitLine);

  if (hiddenCommitCount > 0) {
    commitLines.push(`- ... ${hiddenCommitCount} more ${commitWord}`);
  }

  return [
    `#### GitHub push: ${repo}`,
    `${actorName(payload)} pushed ${commitCount} ${commitWord} to \`${branch}\` (${shortSha(payload.before)}...${shortSha(payload.after)}).${compareLine}`,
    commitLines.length > 0 ? commitLines.join("\n") : "_No commits were included in this push payload._",
  ].join("\n\n");
}

export function formatGitHubCommitSyncMessage(input: { repository: string; branch: string; commits: GitHubApiCommit[] }) {
  const repoUrl = `https://github.com/${input.repository}`;
  const commitWord = input.commits.length === 1 ? "commit" : "commits";

  return [
    `#### GitHub push: [${input.repository}](${repoUrl})`,
    `Detected ${input.commits.length} pushed ${commitWord} on \`${input.branch}\`.`,
    input.commits.map(githubApiCommitLine).join("\n"),
  ].join("\n\n");
}

function hasMattermostConfig(config: GitHubMattermostSyncConfig) {
  return Boolean(config.MATTERMOST_URL && config.MATTERMOST_LOGIN_ID && config.MATTERMOST_PASSWORD && config.MATTERMOST_CHANNEL_ID);
}

function webhookConfigured(config: GitHubMattermostSyncConfig) {
  return Boolean(hasMattermostConfig(config) && config.GITHUB_WEBHOOK_SECRET);
}

function pollingConfigured(config: GitHubMattermostSyncConfig) {
  return Boolean(config.GITHUB_SYNC_ENABLED && hasMattermostConfig(config));
}

function timingSafeTokenEqual(left: string, right: string) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);

  if (leftBytes.length !== rightBytes.length) {
    return false;
  }

  return timingSafeEqual(leftBytes, rightBytes);
}

function getHeaderValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function signatureFor(rawBody: Buffer, secret: string) {
  return `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
}

function requireWebhookSignature(config: GitHubMattermostSyncConfig, request: FastifyRequest, reply: FastifyReply) {
  if (!config.GITHUB_WEBHOOK_SECRET) {
    reply.code(503).send({ error: "GitHub webhook secret is not configured" });
    return false;
  }

  const rawBody = (request.raw as typeof request.raw & { rawBody?: Buffer }).rawBody;
  if (!rawBody) {
    reply.code(400).send({ error: "Missing raw request body" });
    return false;
  }

  const signature = getHeaderValue(request.headers["x-hub-signature-256"]);
  if (!signature || !timingSafeTokenEqual(signature, signatureFor(rawBody, config.GITHUB_WEBHOOK_SECRET))) {
    reply.code(401).send({ error: "Unauthorized" });
    return false;
  }

  return true;
}

async function mattermostLogin(config: GitHubMattermostSyncConfig) {
  if (!config.MATTERMOST_URL || !config.MATTERMOST_LOGIN_ID || !config.MATTERMOST_PASSWORD) {
    throw new Error("Mattermost login is not configured");
  }

  const response = await fetch(`${trimTrailingSlash(config.MATTERMOST_URL)}/api/v4/users/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ login_id: config.MATTERMOST_LOGIN_ID, password: config.MATTERMOST_PASSWORD }),
  });

  if (!response.ok) {
    throw new Error(`Mattermost login failed with HTTP ${response.status}`);
  }

  const token = response.headers.get("token");
  if (!token) {
    throw new Error("Mattermost login did not return a token");
  }

  return token;
}

async function postToMattermost(config: GitHubMattermostSyncConfig, message: string) {
  if (!config.MATTERMOST_URL || !config.MATTERMOST_CHANNEL_ID) {
    throw new Error("Mattermost target channel is not configured");
  }

  const token = await mattermostLogin(config);
  const response = await fetch(`${trimTrailingSlash(config.MATTERMOST_URL)}/api/v4/posts`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      channel_id: config.MATTERMOST_CHANNEL_ID,
      message,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Mattermost post failed with HTTP ${response.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
  }
}

function syncStateKey(config: GitHubMattermostSyncConfig, branch: string) {
  return `${config.GITHUB_REPOSITORY_FULL_NAME}:${branch}`;
}

function allBranchesStateKey(config: GitHubMattermostSyncConfig) {
  return `${config.GITHUB_REPOSITORY_FULL_NAME}:*`;
}

async function readSyncState(config: GitHubMattermostSyncConfig) {
  try {
    const raw = await readFile(config.GITHUB_SYNC_STATE_FILE, "utf8");
    return syncStateSchema.parse(JSON.parse(raw));
  } catch {
    return {};
  }
}

async function writeSyncState(config: GitHubMattermostSyncConfig, state: z.infer<typeof syncStateSchema>) {
  await mkdir(dirname(config.GITHUB_SYNC_STATE_FILE), { recursive: true });
  await writeFile(config.GITHUB_SYNC_STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

function githubApiHeaders(config: GitHubMattermostSyncConfig) {
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "user-agent": "ORF GitHub Mattermost Sync",
  };

  if (config.GITHUB_TOKEN) {
    headers.authorization = `Bearer ${config.GITHUB_TOKEN}`;
  }

  return headers;
}

async function fetchGitHubBranches(config: GitHubMattermostSyncConfig) {
  const url = new URL(`${config.GITHUB_API_URL}/repos/${config.GITHUB_REPOSITORY_FULL_NAME}/branches`);
  url.searchParams.set("per_page", "100");

  const response = await fetch(url, { headers: githubApiHeaders(config) });
  if (!response.ok) {
    throw new Error(`GitHub branches fetch failed with HTTP ${response.status}`);
  }

  return githubApiBranchesSchema.parse(await response.json()).map((branch) => branch.name);
}

async function fetchLatestGitHubCommits(config: GitHubMattermostSyncConfig, branch: string) {
  const url = new URL(`${config.GITHUB_API_URL}/repos/${config.GITHUB_REPOSITORY_FULL_NAME}/commits`);
  url.searchParams.set("sha", branch);
  url.searchParams.set("per_page", String(config.GITHUB_SYNC_LOOKBACK));

  const response = await fetch(url, { headers: githubApiHeaders(config) });
  if (!response.ok) {
    throw new Error(`GitHub commits fetch failed for ${branch} with HTTP ${response.status}`);
  }

  return githubApiCommitsSchema.parse(await response.json());
}

async function syncGitHubBranchCommits(
  app: FastifyInstance,
  config: GitHubMattermostSyncConfig,
  state: z.infer<typeof syncStateSchema>,
  branch: string,
  initializeOnly: boolean,
) {
  const latestCommits = await fetchLatestGitHubCommits(config, branch);
  const latestCommit = latestCommits[0];
  if (!latestCommit) {
    return false;
  }

  const key = syncStateKey(config, branch);
  const lastSeenSha = state[key]?.lastSeenSha;

  if (!lastSeenSha) {
    state[key] = { lastSeenSha: latestCommit.sha };
    if (initializeOnly) {
      app.log.info({ repository: config.GITHUB_REPOSITORY_FULL_NAME, branch, sha: shortSha(latestCommit.sha) }, "Initialized GitHub sync state");
      return true;
    }

    await postToMattermost(
      config,
      formatGitHubCommitSyncMessage({
        repository: config.GITHUB_REPOSITORY_FULL_NAME,
        branch,
        commits: [latestCommit],
      }),
    );
    app.log.info({ repository: config.GITHUB_REPOSITORY_FULL_NAME, branch, count: 1 }, "Synced GitHub commits to Mattermost");
    return true;
  }

  if (lastSeenSha === latestCommit.sha) {
    return false;
  }

  const lastSeenIndex = latestCommits.findIndex((commit) => commit.sha === lastSeenSha);
  const newCommits = (lastSeenIndex >= 0 ? latestCommits.slice(0, lastSeenIndex) : latestCommits.slice(0, 1)).reverse();
  if (newCommits.length === 0) {
    return false;
  }

  await postToMattermost(
    config,
    formatGitHubCommitSyncMessage({
      repository: config.GITHUB_REPOSITORY_FULL_NAME,
      branch,
      commits: newCommits,
    }),
  );

  state[key] = { lastSeenSha: latestCommit.sha };
  app.log.info({ repository: config.GITHUB_REPOSITORY_FULL_NAME, branch, count: newCommits.length }, "Synced GitHub commits to Mattermost");
  return true;
}

async function syncGitHubCommits(app: FastifyInstance, config: GitHubMattermostSyncConfig) {
  const branches = await fetchGitHubBranches(config);
  const state = await readSyncState(config);
  const allBranchesKey = allBranchesStateKey(config);
  const initializeOnly = !state[allBranchesKey];
  let changed = false;

  for (const branch of branches) {
    changed = (await syncGitHubBranchCommits(app, config, state, branch, initializeOnly)) || changed;
  }

  if (initializeOnly) {
    state[allBranchesKey] = { lastSeenSha: "initialized" };
    changed = true;
  }

  if (changed) {
    await writeSyncState(config, state);
  }
}

function startGitHubPolling(app: FastifyInstance, config: GitHubMattermostSyncConfig) {
  if (!pollingConfigured(config)) {
    app.log.info(
      {
        enabled: config.GITHUB_SYNC_ENABLED,
        repository: config.GITHUB_REPOSITORY_FULL_NAME,
        mattermostConfigured: hasMattermostConfig(config),
      },
      "GitHub push sync disabled",
    );
    return;
  }

  let running = false;
  const run = async () => {
    if (running) {
      return;
    }

    running = true;
    try {
      await syncGitHubCommits(app, config);
    } catch (error) {
      app.log.error(error, "GitHub polling sync failed");
    } finally {
      running = false;
    }
  };

  void run();
  const interval = setInterval(run, config.GITHUB_SYNC_INTERVAL_SECONDS * 1000);
  app.addHook("onClose", async () => {
    clearInterval(interval);
  });
}

function registerOptionalWebhook(app: FastifyInstance, config: GitHubMattermostSyncConfig) {
  if (!webhookConfigured(config)) {
    return;
  }

  app.addHook("preParsing", async (request, _reply, payload) => {
    const pathname = new URL(request.url, "http://orf.local").pathname;
    if (pathname !== "/webhooks/github/push") {
      return payload;
    }

    const chunks: Buffer[] = [];
    for await (const chunk of payload) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    const rawBody = Buffer.concat(chunks);
    (request.raw as typeof request.raw & { rawBody?: Buffer }).rawBody = rawBody;
    return Readable.from(rawBody);
  });

  app.post("/webhooks/github/push", async (request, reply) => {
    if (!requireWebhookSignature(config, request, reply)) {
      return reply;
    }

    const event = getHeaderValue(request.headers["x-github-event"]);
    if (event === "ping") {
      return { ok: true, ignored: false, event };
    }

    if (event !== "push") {
      return { ok: true, ignored: true, event: event ?? null };
    }

    const payload = githubPushPayloadSchema.parse(request.body);
    if (config.GITHUB_REPOSITORY_FULL_NAME && payload.repository.full_name !== config.GITHUB_REPOSITORY_FULL_NAME) {
      return reply.code(202).send({ ok: true, ignored: true, repository: payload.repository.full_name });
    }

    await postToMattermost(config, formatGitHubPushMessage(payload));
    return { ok: true, channelId: config.MATTERMOST_CHANNEL_ID };
  });
}

export function registerGitHubMattermostSync(app: FastifyInstance) {
  const config = readConfig();
  registerOptionalWebhook(app, config);
  startGitHubPolling(app, config);
}
