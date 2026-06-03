import { createHmac, timingSafeEqual } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Readable } from "node:stream";
import { promisify } from "node:util";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { hasMattermostChannelPostConfig, MattermostClient, type MattermostChannelPostConfig } from "../mattermost";

const execFileAsync = promisify(execFile);
const gitFieldSeparator = "\x1f";
const gitRecordSeparator = "\x1e";
const githubWebhookMaxBodyBytes = 1024 * 1024;
const githubPushNotificationPropsKey = "github_sync_key";
const githubPushNotificationPropsType = "github_push";
const githubPushNotificationLedgerTableName = "github_mattermost_push_notifications";

let githubPushNotificationLedgerReady: Promise<void> | null = null;

const optionalNonEmptyString = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed || undefined;
  })
  .pipe(z.string().min(1).optional());
const defaultTrueBooleanEnvSchema = z.enum(["true", "false"]).default("true").transform((value) => value === "true");

const configSchema = z.object({
  MATTERMOST_URL: z.string().url().optional(),
  MATTERMOST_LOGIN_ID: z.string().optional(),
  MATTERMOST_PASSWORD: z.string().optional(),
  MATTERMOST_BOT_TOKEN: optionalNonEmptyString,
  GITHUB_MATTERMOST_BOT_TOKEN: optionalNonEmptyString,
  GITHUB_MATTERMOST_LOGIN_ID: optionalNonEmptyString,
  GITHUB_MATTERMOST_PASSWORD: optionalNonEmptyString,
  GITHUB_MATTERMOST_REQUIRE_BOT: defaultTrueBooleanEnvSchema,
  MATTERMOST_CHANNEL_ID: z.string().optional(),
  MATTERMOST_PUSH_CHANNEL_ID: z.string().optional(),
  GITHUB_MATTERMOST_CHANNEL_ID: z.string().optional(),
  GITHUB_REPOSITORY_FULL_NAME: z.string().default("xueyu888/ORF"),
  GITHUB_WEBHOOK_SECRET: z.string().min(16).optional(),
  GITHUB_SYNC_ENABLED: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  GITHUB_SYNC_BRANCH: z.string().default("*"),
  GITHUB_SYNC_INTERVAL_SECONDS: z.coerce.number().int().positive().default(60),
  GITHUB_SYNC_LOOKBACK: z.coerce.number().int().positive().default(20),
  GITHUB_SYNC_STATE_FILE: z.string().default(".artifacts/github-sync-state.json"),
  GITHUB_SYNC_GIT_REMOTE: z.string().trim().min(1).default("origin"),
  GITHUB_SYNC_GIT_CWD: z.string().trim().min(1).optional(),
  GITHUB_ISSUES_SYNC_ENABLED: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  GITHUB_ISSUES_SYNC_INTERVAL_SECONDS: z.coerce.number().int().positive().default(300),
  GITHUB_ISSUES_SYNC_LOOKBACK: z.coerce.number().int().positive().default(50),
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
const githubApiIssueSchema = z.object({
  number: z.number().int().positive(),
  title: z.string().min(1),
  html_url: z.string().url(),
  state: z.string().default("open"),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  user: z
    .object({
      login: z.string().optional(),
    })
    .nullable()
    .optional(),
  pull_request: z.unknown().optional(),
});
const githubApiIssuesSchema = z.array(githubApiIssueSchema);
const githubIssuesWebhookPayloadSchema = z.object({
  action: z.string().min(1),
  repository: z.object({
    full_name: z.string().min(1),
    html_url: z.string().url().optional(),
  }),
  issue: githubApiIssueSchema,
});
const githubApiBranchSchema = z.object({
  name: z.string().min(1),
  commit: z.object({
    sha: z.string().min(1),
  }),
});
const githubApiBranchesSchema = z.array(githubApiBranchSchema);
const syncStateEntrySchema = z.object({
  lastSeenSha: z.string().min(1).optional(),
  openIssueNumbers: z.array(z.number().int().positive()).optional(),
  issueInitialized: z.boolean().optional(),
});
const syncStateSchema = z.record(
  z.string(),
  syncStateEntrySchema,
);

export type GitHubMattermostSyncConfig = z.infer<typeof configSchema>;
export type GitHubPushPayload = z.infer<typeof githubPushPayloadSchema>;
export type GitHubIssue = z.infer<typeof githubApiIssueSchema>;
type GitHubApiCommit = z.infer<typeof githubApiCommitSchema>;
type GitRemoteHead = { name: string; sha: string };
type SyncState = z.infer<typeof syncStateSchema>;
type GitHubMattermostChannelConfig = Pick<
  GitHubMattermostSyncConfig,
  "GITHUB_MATTERMOST_CHANNEL_ID" | "MATTERMOST_PUSH_CHANNEL_ID" | "MATTERMOST_CHANNEL_ID"
>;
type GitHubPushNotificationSource = "webhook" | "api-poll" | "git-poll";
type GitHubPushNotificationContext = {
  syncKey: string;
  repository: string;
  ref: string;
  afterSha: string;
  source: GitHubPushNotificationSource;
};
type MattermostPostResult = {
  posted: boolean;
  duplicate: boolean;
  channelId: string;
};

class GitHubApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

export function readGitHubMattermostSyncConfig(env: NodeJS.ProcessEnv = process.env) {
  return configSchema.parse(env);
}

function readConfig() {
  return readGitHubMattermostSyncConfig();
}

export function resolveGitHubMattermostChannelId(config: GitHubMattermostChannelConfig) {
  return config.GITHUB_MATTERMOST_CHANNEL_ID || config.MATTERMOST_PUSH_CHANNEL_ID || config.MATTERMOST_CHANNEL_ID;
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

function stablePushSha(sha: string | undefined) {
  if (!sha || /^0+$/.test(sha)) {
    return "deleted";
  }

  return sha;
}

export function gitHubPushNotificationSyncKey(input: { repository: string; ref: string; afterSha: string | undefined }) {
  return `github-push:${input.repository}:${input.ref}:${stablePushSha(input.afterSha)}`;
}

function gitHubPushPayloadNotificationContext(payload: GitHubPushPayload): GitHubPushNotificationContext {
  const ref = refName(payload.ref);
  const afterSha = stablePushSha(payload.after);

  return {
    syncKey: gitHubPushNotificationSyncKey({
      repository: payload.repository.full_name,
      ref,
      afterSha,
    }),
    repository: payload.repository.full_name,
    ref,
    afterSha,
    source: "webhook",
  };
}

function gitHubPolledPushNotificationContext(input: {
  repository: string;
  branch: string;
  afterSha: string;
  source: Exclude<GitHubPushNotificationSource, "webhook">;
}): GitHubPushNotificationContext {
  return {
    syncKey: gitHubPushNotificationSyncKey({
      repository: input.repository,
      ref: input.branch,
      afterSha: input.afterSha,
    }),
    repository: input.repository,
    ref: input.branch,
    afterSha: stablePushSha(input.afterSha),
    source: input.source,
  };
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
  return `${prefix} **${commitAuthor(commit)}**: ${firstCommitLine(commit.message)}`;
}

function githubApiCommitLine(commit: GitHubApiCommit) {
  const sha = shortSha(commit.sha);
  const prefix = commit.html_url ? `- [\`${sha}\`](${commit.html_url})` : `- \`${sha}\``;
  const author = commit.author?.login || commit.commit.author?.name || "unknown";
  return `${prefix} **${author}**: ${firstCommitLine(commit.commit.message)}`;
}

function issueAuthor(issue: GitHubIssue) {
  return issue.user?.login || "unknown";
}

function issueOpenedDate(issue: GitHubIssue) {
  if (!issue.created_at) {
    return "unknown date";
  }

  const openedAt = new Date(issue.created_at);
  if (Number.isNaN(openedAt.getTime())) {
    return "unknown date";
  }

  return openedAt.toISOString().slice(0, 10);
}

function issueLine(issue: GitHubIssue) {
  return `- [#${issue.number}](${issue.html_url}) ${issue.title} - ${issueAuthor(issue)}, opened ${issueOpenedDate(issue)}`;
}

export function formatGitHubPushMessage(payload: GitHubPushPayload) {
  const commits = payload.commits.length > 0 ? payload.commits : payload.head_commit ? [payload.head_commit] : [];
  const commitCount = commits.length;
  const visibleCommits = commits.slice(0, 8);
  const repo = payload.repository.html_url ? `[${payload.repository.full_name}](${payload.repository.html_url})` : payload.repository.full_name;
  const commitWord = commitCount === 1 ? "commit" : "commits";
  const hiddenCommitCount = Math.max(0, commitCount - visibleCommits.length);
  const commitLines = visibleCommits.map(commitLine);

  if (hiddenCommitCount > 0) {
    commitLines.push(`- ... ${hiddenCommitCount} more ${commitWord}`);
  }

  return [
    `#### GitHub push: ${repo}`,
    commitLines.length > 0 ? commitLines.join("\n") : "_No commits were included in this push payload._",
  ].join("\n\n");
}

export function formatGitHubCommitSyncMessage(input: { repository: string; branch: string; commits: GitHubApiCommit[] }) {
  const repoUrl = `https://github.com/${input.repository}`;

  return [
    `#### GitHub push: [${input.repository}](${repoUrl})`,
    input.commits.map(githubApiCommitLine).join("\n"),
  ].join("\n\n");
}

export function formatGitHubIssuesMessage(input: { repository: string; issues: GitHubIssue[]; mode: "current" | "new" }) {
  const repoUrl = `https://github.com/${input.repository}`;
  const issueWord = input.issues.length === 1 ? "issue" : "issues";
  const summary =
    input.mode === "current"
      ? `Found ${input.issues.length} currently open ${issueWord}.`
      : `Detected ${input.issues.length} newly open or reopened ${issueWord}.`;
  const visibleIssues = input.issues.slice(0, 10);
  const hiddenIssueCount = Math.max(0, input.issues.length - visibleIssues.length);
  const issueLines = visibleIssues.map(issueLine);

  if (hiddenIssueCount > 0) {
    issueLines.push(`- ... ${hiddenIssueCount} more open ${issueWord}`);
  }

  return [`#### GitHub issues: [${input.repository}](${repoUrl})`, summary, issueLines.join("\n")].join("\n\n");
}

function hasMattermostConfig(config: GitHubMattermostSyncConfig) {
  return hasMattermostChannelPostConfig(githubMattermostChannelPostConfig(config));
}

function webhookConfigured(config: GitHubMattermostSyncConfig) {
  return Boolean(hasMattermostConfig(config) && config.GITHUB_WEBHOOK_SECRET);
}

function pollingConfigured(config: GitHubMattermostSyncConfig) {
  return Boolean(config.GITHUB_SYNC_ENABLED && hasMattermostConfig(config));
}

function issuePollingConfigured(config: GitHubMattermostSyncConfig) {
  return Boolean(config.GITHUB_ISSUES_SYNC_ENABLED && hasMattermostConfig(config));
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

function webhookPayloadTooLargeError() {
  const error = new Error("GitHub webhook payload is too large") as Error & { statusCode: number };
  error.statusCode = 413;
  return error;
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

export function resolveGitHubMattermostPostConfig(config: GitHubMattermostSyncConfig): MattermostChannelPostConfig {
  return {
    MATTERMOST_URL: config.MATTERMOST_URL,
    MATTERMOST_ACCESS_TOKEN: config.GITHUB_MATTERMOST_BOT_TOKEN ?? config.MATTERMOST_BOT_TOKEN,
    MATTERMOST_LOGIN_ID: config.GITHUB_MATTERMOST_LOGIN_ID,
    MATTERMOST_PASSWORD: config.GITHUB_MATTERMOST_PASSWORD,
    MATTERMOST_CHANNEL_ID: resolveGitHubMattermostChannelId(config),
  };
}

function githubMattermostChannelPostConfig(config: GitHubMattermostSyncConfig): MattermostChannelPostConfig {
  return resolveGitHubMattermostPostConfig(config);
}

async function getDbPool() {
  const { pool } = await import("../../db/client");
  return pool;
}

async function ensureGitHubPushNotificationLedger() {
  if (!githubPushNotificationLedgerReady) {
    githubPushNotificationLedgerReady = (async () => {
      const pool = await getDbPool();
      await pool.query(`
        create table if not exists ${githubPushNotificationLedgerTableName} (
          sync_key text primary key,
          repository text not null,
          ref_name text not null,
          after_sha text not null,
          channel_id text not null,
          source text not null,
          status text not null default 'reserved',
          mattermost_post_id text,
          error text,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
      `);
      await pool.query(`
        create index if not exists github_mattermost_push_notifications_repo_ref_idx
          on ${githubPushNotificationLedgerTableName} (repository, ref_name, created_at desc)
      `);
    })().catch((error) => {
      githubPushNotificationLedgerReady = null;
      throw error;
    });
  }

  await githubPushNotificationLedgerReady;
}

async function reserveGitHubPushNotification(context: GitHubPushNotificationContext, channelId: string) {
  await ensureGitHubPushNotificationLedger();
  const pool = await getDbPool();
  const result = await pool.query(
    `
      insert into ${githubPushNotificationLedgerTableName} (
        sync_key,
        repository,
        ref_name,
        after_sha,
        channel_id,
        source,
        status,
        updated_at
      )
      values ($1, $2, $3, $4, $5, $6, 'reserved', now())
      on conflict (sync_key) do nothing
      returning sync_key
    `,
    [context.syncKey, context.repository, context.ref, context.afterSha, channelId, context.source],
  );

  return (result.rowCount ?? 0) > 0;
}

async function markGitHubPushNotificationPosted(syncKey: string, mattermostPostId: string | undefined) {
  const pool = await getDbPool();
  await pool.query(
    `
      update ${githubPushNotificationLedgerTableName}
      set status = 'posted',
          mattermost_post_id = $2,
          error = null,
          updated_at = now()
      where sync_key = $1
    `,
    [syncKey, mattermostPostId ?? null],
  );
}

async function markGitHubPushNotificationFailed(syncKey: string, error: unknown) {
  const pool = await getDbPool();
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  await pool.query(
    `
      update ${githubPushNotificationLedgerTableName}
      set status = 'failed',
          error = $2,
          updated_at = now()
      where sync_key = $1
    `,
    [syncKey, message.slice(0, 1000)],
  );
}

async function postToMattermost(
  config: GitHubMattermostSyncConfig,
  message: string,
  pushNotificationContext?: GitHubPushNotificationContext,
): Promise<MattermostPostResult> {
  const targetConfig = githubMattermostChannelPostConfig(config);
  const channelId = targetConfig.MATTERMOST_CHANNEL_ID;
  if (!channelId) {
    throw new Error("GitHub Mattermost target channel is not configured");
  }

  if (pushNotificationContext) {
    const reserved = await reserveGitHubPushNotification(pushNotificationContext, channelId);
    if (!reserved) {
      return { posted: false, duplicate: true, channelId };
    }
  }

  const client = new MattermostClient(targetConfig);
  try {
    const sender = await client.getCurrentUser();
    if (config.GITHUB_MATTERMOST_REQUIRE_BOT && !sender.is_bot) {
      throw new Error("GitHub Mattermost sync sender must be a bot user");
    }

    const post = await client.createPost(channelId, message, {
      props: pushNotificationContext
        ? {
            [githubPushNotificationPropsKey]: pushNotificationContext.syncKey,
            github_sync_type: githubPushNotificationPropsType,
            github_repository: pushNotificationContext.repository,
            github_ref: pushNotificationContext.ref,
            github_after_sha: pushNotificationContext.afterSha,
            github_source: pushNotificationContext.source,
          }
        : undefined,
    });

    if (pushNotificationContext) {
      const postId = z.object({ id: z.string().optional() }).passthrough().parse(post).id;
      await markGitHubPushNotificationPosted(pushNotificationContext.syncKey, postId);
    }

    return { posted: true, duplicate: false, channelId };
  } catch (error) {
    if (pushNotificationContext) {
      await markGitHubPushNotificationFailed(pushNotificationContext.syncKey, error).catch(() => undefined);
    }
    throw error;
  }
}

function syncStateKey(config: GitHubMattermostSyncConfig, branch: string) {
  return `${config.GITHUB_REPOSITORY_FULL_NAME}:${branch}`;
}

function allBranchesStateKey(config: GitHubMattermostSyncConfig) {
  return `${config.GITHUB_REPOSITORY_FULL_NAME}:*`;
}

function openIssuesStateKey(config: GitHubMattermostSyncConfig) {
  return `${config.GITHUB_REPOSITORY_FULL_NAME}:issues:open`;
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

async function assertGitHubApiOk(response: Response, message: string) {
  if (response.ok) {
    return;
  }

  const body = await response.text().catch(() => "");
  throw new GitHubApiError(`${message} with HTTP ${response.status}`, response.status, body);
}

async function fetchGitHubBranches(config: GitHubMattermostSyncConfig) {
  const url = new URL(`${config.GITHUB_API_URL}/repos/${config.GITHUB_REPOSITORY_FULL_NAME}/branches`);
  url.searchParams.set("per_page", "100");

  const response = await fetch(url, { headers: githubApiHeaders(config) });
  await assertGitHubApiOk(response, "GitHub branches fetch failed");

  return githubApiBranchesSchema.parse(await response.json()).map((branch) => branch.name);
}

async function fetchLatestGitHubCommits(config: GitHubMattermostSyncConfig, branch: string) {
  const url = new URL(`${config.GITHUB_API_URL}/repos/${config.GITHUB_REPOSITORY_FULL_NAME}/commits`);
  url.searchParams.set("sha", branch);
  url.searchParams.set("per_page", String(config.GITHUB_SYNC_LOOKBACK));

  const response = await fetch(url, { headers: githubApiHeaders(config) });
  await assertGitHubApiOk(response, `GitHub commits fetch failed for ${branch}`);

  return githubApiCommitsSchema.parse(await response.json());
}

async function fetchOpenGitHubIssues(config: GitHubMattermostSyncConfig) {
  const url = new URL(`${config.GITHUB_API_URL}/repos/${config.GITHUB_REPOSITORY_FULL_NAME}/issues`);
  url.searchParams.set("state", "open");
  url.searchParams.set("sort", "created");
  url.searchParams.set("direction", "desc");
  url.searchParams.set("per_page", String(Math.min(config.GITHUB_ISSUES_SYNC_LOOKBACK, 100)));

  const response = await fetch(url, { headers: githubApiHeaders(config) });
  await assertGitHubApiOk(response, "GitHub issues fetch failed");

  return githubApiIssuesSchema.parse(await response.json()).filter((issue) => !issue.pull_request);
}

function shouldUseGitFallback(error: unknown): error is GitHubApiError {
  return error instanceof GitHubApiError && (error.status === 403 || error.status === 429);
}

function gitCommitUrl(repository: string, sha: string) {
  return `https://github.com/${repository}/commit/${sha}`;
}

async function runGit(config: GitHubMattermostSyncConfig, args: string[]) {
  const cwd = config.GITHUB_SYNC_GIT_CWD ?? process.cwd();
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });

  return stdout;
}

function parseGitRemoteHeads(stdout: string): GitRemoteHead[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const [sha, ref] = line.split(/\s+/, 2);
      if (!sha || !ref?.startsWith("refs/heads/")) {
        return [];
      }

      return [{ name: ref.slice("refs/heads/".length), sha }];
    });
}

function parseGitLog(stdout: string, repository: string): GitHubApiCommit[] {
  return stdout
    .split(gitRecordSeparator)
    .map((record) => record.trim())
    .filter(Boolean)
    .flatMap((record) => {
      const [sha, authorName = "unknown", subject = "No commit message"] = record.split(gitFieldSeparator);
      if (!sha) {
        return [];
      }

      return [
        {
          sha,
          html_url: gitCommitUrl(repository, sha),
          commit: {
            message: subject,
            author: {
              name: authorName,
            },
          },
          author: null,
        },
      ];
    });
}

async function fetchGitRemoteHeads(config: GitHubMattermostSyncConfig) {
  const stdout = await runGit(config, ["ls-remote", "--heads", config.GITHUB_SYNC_GIT_REMOTE]);
  return parseGitRemoteHeads(stdout);
}

async function fetchGitRemoteObjects(config: GitHubMattermostSyncConfig) {
  await runGit(config, ["fetch", "--quiet", "--prune", config.GITHUB_SYNC_GIT_REMOTE, "+refs/heads/*:refs/remotes/orf-github-sync/*"]);
}

async function fetchGitCommit(config: GitHubMattermostSyncConfig, sha: string) {
  const stdout = await runGit(config, ["show", "-s", `--format=%H%x1f%an%x1f%s%x1e`, sha]);
  return parseGitLog(stdout, config.GITHUB_REPOSITORY_FULL_NAME)[0];
}

async function fetchGitNewCommits(config: GitHubMattermostSyncConfig, lastSeenSha: string, latestSha: string) {
  try {
    const stdout = await runGit(config, [
      "log",
      `--max-count=${config.GITHUB_SYNC_LOOKBACK}`,
      "--format=%H%x1f%an%x1f%s%x1e",
      `${lastSeenSha}..${latestSha}`,
    ]);
    return parseGitLog(stdout, config.GITHUB_REPOSITORY_FULL_NAME).reverse();
  } catch {
    const latestCommit = await fetchGitCommit(config, latestSha);
    return latestCommit ? [latestCommit] : [];
  }
}

async function syncGitHubBranchCommits(
  app: FastifyInstance,
  config: GitHubMattermostSyncConfig,
  state: SyncState,
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

    const result = await postToMattermost(
      config,
      formatGitHubCommitSyncMessage({
        repository: config.GITHUB_REPOSITORY_FULL_NAME,
        branch,
        commits: [latestCommit],
      }),
      gitHubPolledPushNotificationContext({
        repository: config.GITHUB_REPOSITORY_FULL_NAME,
        branch,
        afterSha: latestCommit.sha,
        source: "api-poll",
      }),
    );
    app.log.info(
      { repository: config.GITHUB_REPOSITORY_FULL_NAME, branch, count: 1, duplicate: result.duplicate },
      result.duplicate ? "Skipped duplicate GitHub commit notification" : "Synced GitHub commits to Mattermost",
    );
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

  const result = await postToMattermost(
    config,
    formatGitHubCommitSyncMessage({
      repository: config.GITHUB_REPOSITORY_FULL_NAME,
      branch,
      commits: newCommits,
    }),
    gitHubPolledPushNotificationContext({
      repository: config.GITHUB_REPOSITORY_FULL_NAME,
      branch,
      afterSha: latestCommit.sha,
      source: "api-poll",
    }),
  );

  state[key] = { lastSeenSha: latestCommit.sha };
  app.log.info(
    { repository: config.GITHUB_REPOSITORY_FULL_NAME, branch, count: newCommits.length, duplicate: result.duplicate },
    result.duplicate ? "Skipped duplicate GitHub commit notification" : "Synced GitHub commits to Mattermost",
  );
  return true;
}

async function syncGitBranchCommits(
  app: FastifyInstance,
  config: GitHubMattermostSyncConfig,
  state: SyncState,
  head: GitRemoteHead,
  initializeOnly: boolean,
) {
  const key = syncStateKey(config, head.name);
  const lastSeenSha = state[key]?.lastSeenSha;

  if (!lastSeenSha) {
    state[key] = { lastSeenSha: head.sha };
    if (initializeOnly) {
      app.log.info({ repository: config.GITHUB_REPOSITORY_FULL_NAME, branch: head.name, sha: shortSha(head.sha) }, "Initialized GitHub sync state from git");
      return true;
    }

    const latestCommit = await fetchGitCommit(config, head.sha);
    if (!latestCommit) {
      return false;
    }

    const result = await postToMattermost(
      config,
      formatGitHubCommitSyncMessage({
        repository: config.GITHUB_REPOSITORY_FULL_NAME,
        branch: head.name,
        commits: [latestCommit],
      }),
      gitHubPolledPushNotificationContext({
        repository: config.GITHUB_REPOSITORY_FULL_NAME,
        branch: head.name,
        afterSha: head.sha,
        source: "git-poll",
      }),
    );
    app.log.info(
      { repository: config.GITHUB_REPOSITORY_FULL_NAME, branch: head.name, count: 1, duplicate: result.duplicate },
      result.duplicate ? "Skipped duplicate GitHub commit notification from git" : "Synced GitHub commits to Mattermost from git",
    );
    return true;
  }

  if (lastSeenSha === head.sha) {
    return false;
  }

  const newCommits = await fetchGitNewCommits(config, lastSeenSha, head.sha);
  if (newCommits.length === 0) {
    state[key] = { lastSeenSha: head.sha };
    return true;
  }

  const result = await postToMattermost(
    config,
    formatGitHubCommitSyncMessage({
      repository: config.GITHUB_REPOSITORY_FULL_NAME,
      branch: head.name,
      commits: newCommits,
    }),
    gitHubPolledPushNotificationContext({
      repository: config.GITHUB_REPOSITORY_FULL_NAME,
      branch: head.name,
      afterSha: head.sha,
      source: "git-poll",
    }),
  );

  state[key] = { lastSeenSha: head.sha };
  app.log.info(
    { repository: config.GITHUB_REPOSITORY_FULL_NAME, branch: head.name, count: newCommits.length, duplicate: result.duplicate },
    result.duplicate ? "Skipped duplicate GitHub commit notification from git" : "Synced GitHub commits to Mattermost from git",
  );
  return true;
}

async function syncGitHubCommitsViaApi(app: FastifyInstance, config: GitHubMattermostSyncConfig) {
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

async function syncGitHubCommitsFromGit(app: FastifyInstance, config: GitHubMattermostSyncConfig) {
  const heads = await fetchGitRemoteHeads(config);
  await fetchGitRemoteObjects(config);

  const state = await readSyncState(config);
  const allBranchesKey = allBranchesStateKey(config);
  const initializeOnly = !state[allBranchesKey];
  let changed = false;

  for (const head of heads) {
    changed = (await syncGitBranchCommits(app, config, state, head, initializeOnly)) || changed;
  }

  if (initializeOnly) {
    state[allBranchesKey] = { lastSeenSha: "initialized" };
    changed = true;
  }

  if (changed) {
    await writeSyncState(config, state);
  }
}

async function syncGitHubCommits(app: FastifyInstance, config: GitHubMattermostSyncConfig) {
  try {
    await syncGitHubCommitsViaApi(app, config);
  } catch (error) {
    if (!shouldUseGitFallback(error)) {
      throw error;
    }

    app.log.warn(
      {
        status: error.status,
        repository: config.GITHUB_REPOSITORY_FULL_NAME,
        remote: config.GITHUB_SYNC_GIT_REMOTE,
      },
      "GitHub API sync was rate limited; using git remote fallback",
    );
    await syncGitHubCommitsFromGit(app, config);
  }
}

function issueNumbers(issues: GitHubIssue[]) {
  return issues.map((issue) => issue.number).sort((left, right) => left - right);
}

function sameIssueNumbers(left: number[] | undefined, right: number[]) {
  if (!left || left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

async function syncGitHubIssues(app: FastifyInstance, config: GitHubMattermostSyncConfig) {
  const openIssues = await fetchOpenGitHubIssues(config);
  const state = await readSyncState(config);
  const key = openIssuesStateKey(config);
  const entry = state[key] ?? {};
  const openNumbers = issueNumbers(openIssues);
  const previousNumbers = new Set(entry.openIssueNumbers ?? []);

  if (!entry.issueInitialized) {
    if (openIssues.length > 0) {
      await postToMattermost(
        config,
        formatGitHubIssuesMessage({
          repository: config.GITHUB_REPOSITORY_FULL_NAME,
          issues: openIssues,
          mode: "current",
        }),
      );
      app.log.info({ repository: config.GITHUB_REPOSITORY_FULL_NAME, count: openIssues.length }, "Synced current GitHub issues to Mattermost");
    }

    state[key] = { ...entry, openIssueNumbers: openNumbers, issueInitialized: true };
    await writeSyncState(config, state);
    return;
  }

  const newlyOpenIssues = openIssues.filter((issue) => !previousNumbers.has(issue.number));
  if (newlyOpenIssues.length > 0) {
    await postToMattermost(
      config,
      formatGitHubIssuesMessage({
        repository: config.GITHUB_REPOSITORY_FULL_NAME,
        issues: newlyOpenIssues,
        mode: "new",
      }),
    );
    app.log.info({ repository: config.GITHUB_REPOSITORY_FULL_NAME, count: newlyOpenIssues.length }, "Synced new GitHub issues to Mattermost");
  }

  if (newlyOpenIssues.length > 0 || !sameIssueNumbers(entry.openIssueNumbers, openNumbers)) {
    state[key] = { ...entry, openIssueNumbers: openNumbers, issueInitialized: true };
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

function startGitHubIssuesPolling(app: FastifyInstance, config: GitHubMattermostSyncConfig) {
  if (!issuePollingConfigured(config)) {
    app.log.info(
      {
        enabled: config.GITHUB_ISSUES_SYNC_ENABLED,
        repository: config.GITHUB_REPOSITORY_FULL_NAME,
        mattermostConfigured: hasMattermostConfig(config),
      },
      "GitHub issues sync disabled",
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
      await syncGitHubIssues(app, config);
    } catch (error) {
      app.log.error(error, "GitHub issues polling sync failed");
    } finally {
      running = false;
    }
  };

  void run();
  const interval = setInterval(run, config.GITHUB_ISSUES_SYNC_INTERVAL_SECONDS * 1000);
  app.addHook("onClose", async () => {
    clearInterval(interval);
  });
}

function registerOptionalWebhook(app: FastifyInstance, config: GitHubMattermostSyncConfig) {
  if (!webhookConfigured(config)) {
    return;
  }

  const webhookPaths = new Set(["/webhooks/github/push", "/webhooks/github/issues"]);

  app.addHook("preParsing", async (request, _reply, payload) => {
    const pathname = new URL(request.url, "http://orf.local").pathname;
    if (!webhookPaths.has(pathname)) {
      return payload;
    }

    const contentLength = Number(getHeaderValue(request.headers["content-length"]));
    if (Number.isFinite(contentLength) && contentLength > githubWebhookMaxBodyBytes) {
      throw webhookPayloadTooLargeError();
    }

    const chunks: Buffer[] = [];
    let totalBytes = 0;
    for await (const chunk of payload) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buffer.length;
      if (totalBytes > githubWebhookMaxBodyBytes) {
        throw webhookPayloadTooLargeError();
      }
      chunks.push(buffer);
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

    const result = await postToMattermost(config, formatGitHubPushMessage(payload), gitHubPushPayloadNotificationContext(payload));
    return { ok: true, channelId: result.channelId, duplicate: result.duplicate };
  });

  app.post("/webhooks/github/issues", async (request, reply) => {
    if (!requireWebhookSignature(config, request, reply)) {
      return reply;
    }

    const event = getHeaderValue(request.headers["x-github-event"]);
    if (event === "ping") {
      return { ok: true, ignored: false, event };
    }

    if (event !== "issues") {
      return { ok: true, ignored: true, event: event ?? null };
    }

    const payload = githubIssuesWebhookPayloadSchema.parse(request.body);
    if (config.GITHUB_REPOSITORY_FULL_NAME && payload.repository.full_name !== config.GITHUB_REPOSITORY_FULL_NAME) {
      return reply.code(202).send({ ok: true, ignored: true, repository: payload.repository.full_name });
    }

    if (payload.action !== "opened" && payload.action !== "reopened") {
      return { ok: true, ignored: true, action: payload.action };
    }

    const result = await postToMattermost(
      config,
      formatGitHubIssuesMessage({
        repository: payload.repository.full_name,
        issues: [payload.issue],
        mode: "new",
      }),
    );
    return { ok: true, channelId: result.channelId };
  });
}

export function registerGitHubMattermostSync(app: FastifyInstance) {
  const config = readConfig();
  registerOptionalWebhook(app, config);
  startGitHubPolling(app, config);
  startGitHubIssuesPolling(app, config);
}
