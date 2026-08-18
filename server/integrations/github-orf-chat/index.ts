import { createHmac, timingSafeEqual } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Readable } from "node:stream";
import { promisify } from "node:util";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { getDefaultRuntimeScope, runtimeScopeStorageId } from "../../repositories/runtimeScope";
import {
  ensureOrfChatBotActor,
  ensureOrfChatChannelIntegrationProvider,
  ensureOrfChatChannelMembership,
  ensureOrfChatNamedChannel,
  sendOrfChatMessage,
} from "../orf-chat-delivery";
import {
  formatGitPushChatMessage,
  newestFirstPushCommits,
  type GitPushAction,
  type GitPushCommit,
} from "../git-push-chat-message";

const execFileAsync = promisify(execFile);
const gitFieldSeparator = "\x1f";
const gitRecordSeparator = "\x1e";
const githubDeliveryLedgerTableName = "github_orf_chat_deliveries";

let githubDeliveryLedgerReady: Promise<void> | null = null;

const optionalNonEmptyString = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed || undefined;
  })
  .pipe(z.string().min(1).optional());
const booleanEnvSchema = z.enum(["true", "false"]).default("false").transform((value) => value === "true");

const configSchema = z.object({
  GITHUB_ORF_CHAT_ENABLED: booleanEnvSchema,
  GITHUB_ORF_CHAT_CHANNEL_ID: optionalNonEmptyString,
  GITHUB_ORF_CHAT_CHANNEL_NAME: optionalNonEmptyString.default("github"),
  GITHUB_ORF_CHAT_CHANNEL_DISPLAY_NAME: optionalNonEmptyString.default("GitHub"),
  GITHUB_ORF_CHAT_CHANNEL_TYPE: z.enum(["public", "private"]).default("public"),
  GITHUB_ORF_CHAT_CHANNEL_PURPOSE: optionalNonEmptyString.default("GitHub repository activity"),
  GITHUB_ORF_CHAT_CHANNEL_HEADER: optionalNonEmptyString.default("GitHub repository activity"),
  GITHUB_ORF_CHAT_BOT_NAME: optionalNonEmptyString.default("GitHub"),
  GITHUB_ORF_CHAT_BOT_EMAIL: optionalNonEmptyString.default("github@orf.local"),
  GITHUB_ORF_CHAT_WEBHOOK_MAX_BODY_BYTES: z.coerce.number().int().positive().default(1024 * 1024),
  GITHUB_REPOSITORY_FULL_NAME: z.string().default("xueyu888/ORF"),
  GITHUB_WEBHOOK_SECRET: z.string().min(16).optional(),
  GITHUB_SYNC_ENABLED: booleanEnvSchema,
  GITHUB_SYNC_BRANCH: z.string().default("*"),
  GITHUB_SYNC_INTERVAL_SECONDS: z.coerce.number().int().positive().default(60),
  GITHUB_SYNC_LOOKBACK: z.coerce.number().int().positive().default(20),
  GITHUB_SYNC_STATE_FILE: z.string().default(".orf/integrations/github-sync-state.json"),
  GITHUB_SYNC_GIT_REMOTE: z.string().trim().min(1).default("origin"),
  GITHUB_SYNC_GIT_CWD: z.string().trim().min(1).optional(),
  GITHUB_ISSUES_SYNC_ENABLED: booleanEnvSchema,
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
  size: z.number().int().nonnegative().optional(),
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
      html_url: z.string().url().optional(),
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

export type GitHubOrfChatConfig = z.infer<typeof configSchema>;
export type GitHubPushPayload = z.infer<typeof githubPushPayloadSchema>;
export type GitHubIssue = z.infer<typeof githubApiIssueSchema>;
type GitHubApiCommit = z.infer<typeof githubApiCommitSchema>;
type GitRemoteHead = { name: string; sha: string };
type SyncState = z.infer<typeof syncStateSchema>;
type GitHubDeliverySource = "webhook" | "api-poll" | "git-poll";
type GitHubDeliveryEventType = "push" | "issue" | "issues-snapshot";
type GitHubDeliveryContext = {
  deliveryKey: string;
  eventType: GitHubDeliveryEventType;
  externalId: string;
  repository: string;
  source: GitHubDeliverySource;
  subject: string;
};
type OrfChatPostResult = {
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

export function readGitHubOrfChatConfig(env: NodeJS.ProcessEnv = process.env) {
  return configSchema.parse(env);
}

function readConfig() {
  return readGitHubOrfChatConfig();
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

export function gitHubPushDeliveryKey(input: { repository: string; ref: string; afterSha: string | undefined }) {
  return `github-push:${input.repository}:${input.ref}:${stablePushSha(input.afterSha)}`;
}

export function gitHubIssueDeliveryKey(input: {
  action: string;
  issueNumber: number;
  occurrence: string | undefined;
  repository: string;
}) {
  return `github-issue:${input.repository}:${input.issueNumber}:${input.action}:${input.occurrence ?? "unknown"}`;
}

function issueOccurrence(issue: GitHubIssue) {
  return issue.updated_at || issue.created_at || issue.state || "unknown";
}

function gitHubPushPayloadDeliveryContext(payload: GitHubPushPayload): GitHubDeliveryContext {
  const ref = refName(payload.ref);
  const afterSha = stablePushSha(payload.after);

  return {
    deliveryKey: gitHubPushDeliveryKey({
      repository: payload.repository.full_name,
      ref,
      afterSha,
    }),
    eventType: "push",
    externalId: afterSha,
    repository: payload.repository.full_name,
    source: "webhook",
    subject: ref,
  };
}

function gitHubPolledPushDeliveryContext(input: {
  repository: string;
  branch: string;
  afterSha: string;
  source: Exclude<GitHubDeliverySource, "webhook">;
}): GitHubDeliveryContext {
  const afterSha = stablePushSha(input.afterSha);
  return {
    deliveryKey: gitHubPushDeliveryKey({
      repository: input.repository,
      ref: input.branch,
      afterSha: input.afterSha,
    }),
    eventType: "push",
    externalId: afterSha,
    repository: input.repository,
    source: input.source,
    subject: input.branch,
  };
}

function gitHubIssueWebhookDeliveryContext(payload: z.infer<typeof githubIssuesWebhookPayloadSchema>): GitHubDeliveryContext {
  const occurrence = issueOccurrence(payload.issue);
  return {
    deliveryKey: gitHubIssueDeliveryKey({
      action: payload.action,
      issueNumber: payload.issue.number,
      occurrence,
      repository: payload.repository.full_name,
    }),
    eventType: "issue",
    externalId: occurrence,
    repository: payload.repository.full_name,
    source: "webhook",
    subject: `#${payload.issue.number}:${payload.action}`,
  };
}

function gitHubIssuesSnapshotDeliveryContext(input: {
  issues: GitHubIssue[];
  mode: "current" | "new";
  repository: string;
}): GitHubDeliveryContext {
  const snapshotIssueNumbers = issueNumbers(input.issues).join(",");
  const latestOccurrence = input.issues
    .map(issueOccurrence)
    .sort()
    .at(-1) ?? "empty";

  return {
    deliveryKey: `github-issues:${input.repository}:${input.mode}:${snapshotIssueNumbers}:${latestOccurrence}`,
    eventType: "issues-snapshot",
    externalId: latestOccurrence,
    repository: input.repository,
    source: "api-poll",
    subject: `${input.mode}:${snapshotIssueNumbers || "empty"}`,
  };
}

function commitAuthor(commit: GitHubPushPayload["commits"][number]) {
  return commit.author?.username || commit.author?.name || commit.author?.email || "unknown";
}

function githubPushAction(payload: GitHubPushPayload): GitPushAction {
  if (payload.after && /^0+$/.test(payload.after)) return "deleted";
  if (payload.before && /^0+$/.test(payload.before)) return "created";
  return "pushed";
}

function githubPushCommit(commit: GitHubPushPayload["commits"][number]): GitPushCommit {
  const username = commit.author?.username;
  return {
    authorName: commitAuthor(commit),
    authorUrl: username ? `https://github.com/${encodeURIComponent(username)}` : undefined,
    message: commit.message,
    sha: commit.id,
    timestamp: commit.timestamp,
    url: commit.url,
  };
}

function githubApiPushCommit(commit: GitHubApiCommit): GitPushCommit {
  return {
    authorName: commit.author?.login || commit.commit.author?.name || "unknown",
    authorUrl: commit.author?.html_url,
    message: commit.commit.message,
    sha: commit.sha,
    url: commit.html_url,
  };
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
  const payloadCommits = [...payload.commits];
  if (payload.head_commit && !payloadCommits.some((commit) => commit.id === payload.head_commit?.id)) {
    payloadCommits.push(payload.head_commit);
  }
  const commits = newestFirstPushCommits(payloadCommits.map(githubPushCommit), payload.after);
  return formatGitPushChatMessage({
    action: githubPushAction(payload),
    actorName: payload.sender?.login || payload.pusher?.name,
    actorUrl: payload.sender?.html_url,
    commits,
    detailsUrl: payload.compare,
    projectName: payload.repository.full_name,
    projectUrl: payload.repository.html_url,
    refKind: payload.ref.startsWith("refs/tags/") ? "tag" : "branch",
    refName: refName(payload.ref),
    totalCommitCount: payload.size ?? commits.length,
  });
}

export function formatGitHubCommitSyncMessage(input: { repository: string; branch: string; commits: GitHubApiCommit[] }) {
  const repoUrl = `https://github.com/${input.repository}`;
  return formatGitPushChatMessage({
    commits: input.commits.map(githubApiPushCommit),
    detailsUrl: `${repoUrl}/commits/${encodeURIComponent(input.branch)}`,
    projectName: input.repository,
    projectUrl: repoUrl,
    refName: input.branch,
  });
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

function gitHubOrfChatIntegrationEnabled(config: GitHubOrfChatConfig) {
  return Boolean(config.GITHUB_ORF_CHAT_ENABLED || config.GITHUB_SYNC_ENABLED || config.GITHUB_ISSUES_SYNC_ENABLED || config.GITHUB_WEBHOOK_SECRET);
}

function webhookConfigured(config: GitHubOrfChatConfig) {
  return Boolean(gitHubOrfChatIntegrationEnabled(config) && config.GITHUB_WEBHOOK_SECRET);
}

function pollingConfigured(config: GitHubOrfChatConfig) {
  return config.GITHUB_SYNC_ENABLED;
}

function issuePollingConfigured(config: GitHubOrfChatConfig) {
  return config.GITHUB_ISSUES_SYNC_ENABLED;
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

function requireWebhookSignature(config: GitHubOrfChatConfig, request: FastifyRequest, reply: FastifyReply) {
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

async function getDbPool() {
  const { pool } = await import("../../db/client");
  return pool;
}

async function ensureGitHubDeliveryLedger() {
  if (!githubDeliveryLedgerReady) {
    githubDeliveryLedgerReady = (async () => {
      const pool = await getDbPool();
      await pool.query(`
        create table if not exists ${githubDeliveryLedgerTableName} (
          delivery_key text primary key,
          repository text not null,
          event_type text not null,
          subject text not null,
          external_id text not null,
          channel_id text not null references chat_channels(id) on delete cascade,
          source text not null,
          status text not null default 'reserved',
          chat_message_id text references chat_messages(id) on delete set null,
          error text,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
          constraint github_orf_chat_deliveries_status_check check (status in ('reserved', 'delivered', 'failed'))
        )
      `);
      await pool.query(`
        create index if not exists github_orf_chat_deliveries_repo_event_idx
          on ${githubDeliveryLedgerTableName} (repository, event_type, subject, created_at desc)
      `);
    })().catch((error) => {
      githubDeliveryLedgerReady = null;
      throw error;
    });
  }

  await githubDeliveryLedgerReady;
}

async function reserveGitHubDelivery(context: GitHubDeliveryContext, channelId: string) {
  await ensureGitHubDeliveryLedger();
  const pool = await getDbPool();
  const result = await pool.query(
    `
      insert into ${githubDeliveryLedgerTableName} (
        delivery_key,
        repository,
        event_type,
        subject,
        external_id,
        channel_id,
        source,
        status,
        updated_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, 'reserved', now())
      on conflict (delivery_key) do update
      set channel_id = excluded.channel_id,
          source = excluded.source,
          status = 'reserved',
          chat_message_id = null,
          error = null,
          updated_at = now()
      where ${githubDeliveryLedgerTableName}.status = 'failed'
         or (
           ${githubDeliveryLedgerTableName}.status = 'reserved'
           and ${githubDeliveryLedgerTableName}.updated_at < now() - interval '10 minutes'
         )
      returning delivery_key
    `,
    [context.deliveryKey, context.repository, context.eventType, context.subject, context.externalId, channelId, context.source],
  );

  return (result.rowCount ?? 0) > 0;
}

async function markGitHubDeliveryDelivered(deliveryKey: string, chatMessageId: string | undefined) {
  const pool = await getDbPool();
  await pool.query(
    `
      update ${githubDeliveryLedgerTableName}
      set status = 'delivered',
          chat_message_id = $2,
          error = null,
          updated_at = now()
      where delivery_key = $1
    `,
    [deliveryKey, chatMessageId ?? null],
  );
}

async function markGitHubDeliveryFailed(deliveryKey: string, error: unknown) {
  const pool = await getDbPool();
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  await pool.query(
    `
      update ${githubDeliveryLedgerTableName}
      set status = 'failed',
          error = $2,
          updated_at = now()
      where delivery_key = $1
    `,
    [deliveryKey, message.slice(0, 1000)],
  );
}

async function postToOrfChat(
  config: GitHubOrfChatConfig,
  message: string,
  deliveryContext?: GitHubDeliveryContext,
): Promise<OrfChatPostResult> {
  const target = await resolveGitHubOrfChatTarget(config);
  const channelId = target.channelId;

  if (deliveryContext) {
    const reserved = await reserveGitHubDelivery(deliveryContext, channelId);
    if (!reserved) {
      return { posted: false, duplicate: true, channelId };
    }
  }

  try {
    const chatMessageId = await sendOrfChatMessage({
      actor: target.actor,
      body: message,
      channelId,
    });

    if (deliveryContext) {
      await markGitHubDeliveryDelivered(deliveryContext.deliveryKey, chatMessageId);
    }

    return { posted: true, duplicate: false, channelId };
  } catch (error) {
    if (deliveryContext) {
      await markGitHubDeliveryFailed(deliveryContext.deliveryKey, error).catch(() => undefined);
    }
    throw error;
  }
}

async function resolveGitHubOrfChatTarget(config: GitHubOrfChatConfig) {
  const scope = await getDefaultRuntimeScope();
  if (!scope) {
    throw new Error("GitHub ORF chat integration requires at least one ORF team");
  }

  const teamId = runtimeScopeStorageId(scope);
  const actor = await ensureOrfChatBotActor({
    botEmail: config.GITHUB_ORF_CHAT_BOT_EMAIL,
    botName: config.GITHUB_ORF_CHAT_BOT_NAME,
    teamId,
  });

  if (config.GITHUB_ORF_CHAT_CHANNEL_ID) {
    await ensureOrfChatChannelIntegrationProvider({
      channelId: config.GITHUB_ORF_CHAT_CHANNEL_ID,
      provider: "github",
      teamId,
    });
    await ensureOrfChatChannelMembership({ channelId: config.GITHUB_ORF_CHAT_CHANNEL_ID, teamId, userId: actor.id });
    return { actor, channelId: config.GITHUB_ORF_CHAT_CHANNEL_ID, teamId };
  }

  const channel = await ensureOrfChatNamedChannel({
    actor,
    displayName: config.GITHUB_ORF_CHAT_CHANNEL_DISPLAY_NAME,
    header: config.GITHUB_ORF_CHAT_CHANNEL_HEADER,
    integrationProvider: "github",
    name: config.GITHUB_ORF_CHAT_CHANNEL_NAME,
    purpose: config.GITHUB_ORF_CHAT_CHANNEL_PURPOSE,
    teamId,
    type: config.GITHUB_ORF_CHAT_CHANNEL_TYPE,
  });
  return { actor, channelId: channel.channelId, teamId };
}

function syncStateKey(config: GitHubOrfChatConfig, branch: string) {
  return `${config.GITHUB_REPOSITORY_FULL_NAME}:${branch}`;
}

function allBranchesStateKey(config: GitHubOrfChatConfig) {
  return `${config.GITHUB_REPOSITORY_FULL_NAME}:*`;
}

function openIssuesStateKey(config: GitHubOrfChatConfig) {
  return `${config.GITHUB_REPOSITORY_FULL_NAME}:issues:open`;
}

async function readSyncState(config: GitHubOrfChatConfig) {
  try {
    const raw = await readFile(config.GITHUB_SYNC_STATE_FILE, "utf8");
    return syncStateSchema.parse(JSON.parse(raw));
  } catch {
    return {};
  }
}

async function writeSyncState(config: GitHubOrfChatConfig, state: z.infer<typeof syncStateSchema>) {
  await mkdir(dirname(config.GITHUB_SYNC_STATE_FILE), { recursive: true });
  await writeFile(config.GITHUB_SYNC_STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

function githubApiHeaders(config: GitHubOrfChatConfig) {
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "user-agent": "ORF GitHub ORF chat Sync",
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

async function fetchGitHubBranches(config: GitHubOrfChatConfig) {
  const url = new URL(`${config.GITHUB_API_URL}/repos/${config.GITHUB_REPOSITORY_FULL_NAME}/branches`);
  url.searchParams.set("per_page", "100");

  const response = await fetch(url, { headers: githubApiHeaders(config) });
  await assertGitHubApiOk(response, "GitHub branches fetch failed");

  return githubApiBranchesSchema.parse(await response.json()).map((branch) => branch.name);
}

async function fetchLatestGitHubCommits(config: GitHubOrfChatConfig, branch: string) {
  const url = new URL(`${config.GITHUB_API_URL}/repos/${config.GITHUB_REPOSITORY_FULL_NAME}/commits`);
  url.searchParams.set("sha", branch);
  url.searchParams.set("per_page", String(config.GITHUB_SYNC_LOOKBACK));

  const response = await fetch(url, { headers: githubApiHeaders(config) });
  await assertGitHubApiOk(response, `GitHub commits fetch failed for ${branch}`);

  return githubApiCommitsSchema.parse(await response.json());
}

async function fetchOpenGitHubIssues(config: GitHubOrfChatConfig) {
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

async function runGit(config: GitHubOrfChatConfig, args: string[]) {
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

async function fetchGitRemoteHeads(config: GitHubOrfChatConfig) {
  const stdout = await runGit(config, ["ls-remote", "--heads", config.GITHUB_SYNC_GIT_REMOTE]);
  return parseGitRemoteHeads(stdout);
}

async function fetchGitRemoteObjects(config: GitHubOrfChatConfig) {
  await runGit(config, ["fetch", "--quiet", "--prune", config.GITHUB_SYNC_GIT_REMOTE, "+refs/heads/*:refs/remotes/orf-github-sync/*"]);
}

async function fetchGitCommit(config: GitHubOrfChatConfig, sha: string) {
  const stdout = await runGit(config, ["show", "-s", `--format=%H%x1f%an%x1f%s%x1e`, sha]);
  return parseGitLog(stdout, config.GITHUB_REPOSITORY_FULL_NAME)[0];
}

async function fetchGitNewCommits(config: GitHubOrfChatConfig, lastSeenSha: string, latestSha: string) {
  try {
    const stdout = await runGit(config, [
      "log",
      `--max-count=${config.GITHUB_SYNC_LOOKBACK}`,
      "--topo-order",
      "--format=%H%x1f%an%x1f%s%x1e",
      `${lastSeenSha}..${latestSha}`,
    ]);
    return parseGitLog(stdout, config.GITHUB_REPOSITORY_FULL_NAME);
  } catch {
    const latestCommit = await fetchGitCommit(config, latestSha);
    return latestCommit ? [latestCommit] : [];
  }
}

export function selectNewGitHubApiCommits(
  latestFirstCommits: readonly GitHubApiCommit[],
  lastSeenSha: string,
) {
  const lastSeenIndex = latestFirstCommits.findIndex((commit) => commit.sha === lastSeenSha);
  return lastSeenIndex >= 0
    ? latestFirstCommits.slice(0, lastSeenIndex)
    : latestFirstCommits.slice(0, 1);
}

async function syncGitHubBranchCommits(
  app: FastifyInstance,
  config: GitHubOrfChatConfig,
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

    const result = await postToOrfChat(
      config,
      formatGitHubCommitSyncMessage({
        repository: config.GITHUB_REPOSITORY_FULL_NAME,
        branch,
        commits: [latestCommit],
      }),
      gitHubPolledPushDeliveryContext({
        repository: config.GITHUB_REPOSITORY_FULL_NAME,
        branch,
        afterSha: latestCommit.sha,
        source: "api-poll",
      }),
    );
    app.log.info(
      { repository: config.GITHUB_REPOSITORY_FULL_NAME, branch, count: 1, duplicate: result.duplicate },
      result.duplicate ? "Skipped duplicate GitHub commit notification" : "Synced GitHub commits to ORF chat",
    );
    return true;
  }

  if (lastSeenSha === latestCommit.sha) {
    return false;
  }

  const newCommits = selectNewGitHubApiCommits(latestCommits, lastSeenSha);
  if (newCommits.length === 0) {
    return false;
  }

  const result = await postToOrfChat(
    config,
    formatGitHubCommitSyncMessage({
      repository: config.GITHUB_REPOSITORY_FULL_NAME,
      branch,
      commits: newCommits,
    }),
    gitHubPolledPushDeliveryContext({
      repository: config.GITHUB_REPOSITORY_FULL_NAME,
      branch,
      afterSha: latestCommit.sha,
      source: "api-poll",
    }),
  );

  state[key] = { lastSeenSha: latestCommit.sha };
  app.log.info(
    { repository: config.GITHUB_REPOSITORY_FULL_NAME, branch, count: newCommits.length, duplicate: result.duplicate },
    result.duplicate ? "Skipped duplicate GitHub commit notification" : "Synced GitHub commits to ORF chat",
  );
  return true;
}

async function syncGitBranchCommits(
  app: FastifyInstance,
  config: GitHubOrfChatConfig,
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

    const result = await postToOrfChat(
      config,
      formatGitHubCommitSyncMessage({
        repository: config.GITHUB_REPOSITORY_FULL_NAME,
        branch: head.name,
        commits: [latestCommit],
      }),
      gitHubPolledPushDeliveryContext({
        repository: config.GITHUB_REPOSITORY_FULL_NAME,
        branch: head.name,
        afterSha: head.sha,
        source: "git-poll",
      }),
    );
    app.log.info(
      { repository: config.GITHUB_REPOSITORY_FULL_NAME, branch: head.name, count: 1, duplicate: result.duplicate },
      result.duplicate ? "Skipped duplicate GitHub commit notification from git" : "Synced GitHub commits to ORF chat from git",
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

  const result = await postToOrfChat(
    config,
    formatGitHubCommitSyncMessage({
      repository: config.GITHUB_REPOSITORY_FULL_NAME,
      branch: head.name,
      commits: newCommits,
    }),
    gitHubPolledPushDeliveryContext({
      repository: config.GITHUB_REPOSITORY_FULL_NAME,
      branch: head.name,
      afterSha: head.sha,
      source: "git-poll",
    }),
  );

  state[key] = { lastSeenSha: head.sha };
  app.log.info(
    { repository: config.GITHUB_REPOSITORY_FULL_NAME, branch: head.name, count: newCommits.length, duplicate: result.duplicate },
    result.duplicate ? "Skipped duplicate GitHub commit notification from git" : "Synced GitHub commits to ORF chat from git",
  );
  return true;
}

async function syncGitHubCommitsViaApi(app: FastifyInstance, config: GitHubOrfChatConfig) {
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

async function syncGitHubCommitsFromGit(app: FastifyInstance, config: GitHubOrfChatConfig) {
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

async function syncGitHubCommits(app: FastifyInstance, config: GitHubOrfChatConfig) {
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

async function syncGitHubIssues(app: FastifyInstance, config: GitHubOrfChatConfig) {
  const openIssues = await fetchOpenGitHubIssues(config);
  const state = await readSyncState(config);
  const key = openIssuesStateKey(config);
  const entry = state[key] ?? {};
  const openNumbers = issueNumbers(openIssues);
  const previousNumbers = new Set(entry.openIssueNumbers ?? []);

  if (!entry.issueInitialized) {
    if (openIssues.length > 0) {
      const result = await postToOrfChat(
        config,
        formatGitHubIssuesMessage({
          repository: config.GITHUB_REPOSITORY_FULL_NAME,
          issues: openIssues,
          mode: "current",
        }),
        gitHubIssuesSnapshotDeliveryContext({
          repository: config.GITHUB_REPOSITORY_FULL_NAME,
          issues: openIssues,
          mode: "current",
        }),
      );
      app.log.info(
        { repository: config.GITHUB_REPOSITORY_FULL_NAME, count: openIssues.length, duplicate: result.duplicate },
        result.duplicate ? "Skipped duplicate current GitHub issues notification" : "Synced current GitHub issues to ORF chat",
      );
    }

    state[key] = { ...entry, openIssueNumbers: openNumbers, issueInitialized: true };
    await writeSyncState(config, state);
    return;
  }

  const newlyOpenIssues = openIssues.filter((issue) => !previousNumbers.has(issue.number));
  if (newlyOpenIssues.length > 0) {
    const result = await postToOrfChat(
      config,
      formatGitHubIssuesMessage({
        repository: config.GITHUB_REPOSITORY_FULL_NAME,
        issues: newlyOpenIssues,
        mode: "new",
      }),
      gitHubIssuesSnapshotDeliveryContext({
        repository: config.GITHUB_REPOSITORY_FULL_NAME,
        issues: newlyOpenIssues,
        mode: "new",
      }),
    );
    app.log.info(
      { repository: config.GITHUB_REPOSITORY_FULL_NAME, count: newlyOpenIssues.length, duplicate: result.duplicate },
      result.duplicate ? "Skipped duplicate new GitHub issues notification" : "Synced new GitHub issues to ORF chat",
    );
  }

  if (newlyOpenIssues.length > 0 || !sameIssueNumbers(entry.openIssueNumbers, openNumbers)) {
    state[key] = { ...entry, openIssueNumbers: openNumbers, issueInitialized: true };
    await writeSyncState(config, state);
  }
}

function startGitHubPolling(app: FastifyInstance, config: GitHubOrfChatConfig) {
  if (!pollingConfigured(config)) {
    app.log.info(
      {
        enabled: config.GITHUB_SYNC_ENABLED,
        repository: config.GITHUB_REPOSITORY_FULL_NAME,
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

  let interval: NodeJS.Timeout | undefined;
  app.addHook("onReady", async () => {
    void run();
    interval = setInterval(run, config.GITHUB_SYNC_INTERVAL_SECONDS * 1000);
  });
  app.addHook("onClose", async () => {
    if (interval) {
      clearInterval(interval);
    }
  });
}

function registerGitHubOrfChatStartupValidation(app: FastifyInstance, config: GitHubOrfChatConfig) {
  if (!pollingConfigured(config) && !issuePollingConfigured(config)) {
    return;
  }

  app.addHook("onReady", async () => {
    void resolveGitHubOrfChatTarget(config)
      .then((target) => {
        app.log.info(
          {
            channelId: target.channelId,
            repository: config.GITHUB_REPOSITORY_FULL_NAME,
            sender: target.actor.name,
          },
          "GitHub ORF chat target ready",
        );
      })
      .catch((error) => {
        app.log.error(error, "GitHub ORF chat target validation failed");
      });
  });
}

function startGitHubIssuesPolling(app: FastifyInstance, config: GitHubOrfChatConfig) {
  if (!issuePollingConfigured(config)) {
    app.log.info(
      {
        enabled: config.GITHUB_ISSUES_SYNC_ENABLED,
        repository: config.GITHUB_REPOSITORY_FULL_NAME,
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

  let interval: NodeJS.Timeout | undefined;
  app.addHook("onReady", async () => {
    void run();
    interval = setInterval(run, config.GITHUB_ISSUES_SYNC_INTERVAL_SECONDS * 1000);
  });
  app.addHook("onClose", async () => {
    if (interval) {
      clearInterval(interval);
    }
  });
}

function registerOptionalWebhook(app: FastifyInstance, config: GitHubOrfChatConfig) {
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
    if (Number.isFinite(contentLength) && contentLength > config.GITHUB_ORF_CHAT_WEBHOOK_MAX_BODY_BYTES) {
      throw webhookPayloadTooLargeError();
    }

    const chunks: Buffer[] = [];
    let totalBytes = 0;
    for await (const chunk of payload) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buffer.length;
      if (totalBytes > config.GITHUB_ORF_CHAT_WEBHOOK_MAX_BODY_BYTES) {
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

    const result = await postToOrfChat(config, formatGitHubPushMessage(payload), gitHubPushPayloadDeliveryContext(payload));
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

    const result = await postToOrfChat(
      config,
      formatGitHubIssuesMessage({
        repository: payload.repository.full_name,
        issues: [payload.issue],
        mode: "new",
      }),
      gitHubIssueWebhookDeliveryContext(payload),
    );
    return { ok: true, channelId: result.channelId, duplicate: result.duplicate };
  });
}

export function registerGitHubOrfChatSync(app: FastifyInstance) {
  const config = readConfig();
  if (!gitHubOrfChatIntegrationEnabled(config)) {
    app.log.info({ enabled: false, repository: config.GITHUB_REPOSITORY_FULL_NAME }, "GitHub ORF chat integration disabled");
    return;
  }
  registerOptionalWebhook(app, config);
  registerGitHubOrfChatStartupValidation(app, config);
  startGitHubPolling(app, config);
  startGitHubIssuesPolling(app, config);
}
