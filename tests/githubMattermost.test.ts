import assert from "node:assert/strict";
import test from "node:test";
import { buildServer } from "../server/app";
import {
  assertGitHubMattermostConfig,
  formatGitHubCommitSyncMessage,
  formatGitHubIssuesMessage,
  formatGitHubPushMessage,
  gitHubPushNotificationSyncKey,
  readGitHubMattermostSyncConfig,
  resolveGitHubMattermostPostConfig,
  resolveGitHubMattermostChannelId,
  type GitHubIssue,
  type GitHubPushPayload,
} from "../server/integrations/github-mattermost-sync";

test("formats GitHub push payload for Mattermost", () => {
  const payload: GitHubPushPayload = {
    ref: "refs/heads/main",
    before: "1111111111111111111111111111111111111111",
    after: "2222222222222222222222222222222222222222",
    compare: "https://github.com/xueyu888/ORF/compare/1111111...2222222",
    pusher: { name: "xueyu" },
    repository: {
      full_name: "xueyu888/ORF",
      html_url: "https://github.com/xueyu888/ORF",
    },
    commits: [
      {
        id: "2222222222222222222222222222222222222222",
        message: "feat: sync GitHub pushes\n\nBody is omitted from the summary.",
        url: "https://github.com/xueyu888/ORF/commit/2222222222222222222222222222222222222222",
        author: { username: "xueyu" },
      },
    ],
  };

  const message = formatGitHubPushMessage(payload);

  assert.match(message, /GitHub push: \[xueyu888\/ORF\]/);
  assert.doesNotMatch(message, /pushed 1 commit/);
  assert.match(message, /`2222222`/);
  assert.match(message, /\*\*xueyu\*\*: feat: sync GitHub pushes/);
  assert.doesNotMatch(message, /Body is omitted/);
});

test("resolves GitHub Mattermost sender from bot credentials only", () => {
  const config = readGitHubMattermostSyncConfig({
    MATTERMOST_URL: "https://mattermost.example.com",
    MATTERMOST_LOGIN_ID: "human@example.com",
    MATTERMOST_PASSWORD: "human-password",
    MATTERMOST_BOT_TOKEN: "shared-bot-token",
    GITHUB_MATTERMOST_BOT_TOKEN: "github-bot-token",
    GITHUB_MATTERMOST_CHANNEL_ID: "github-channel",
  });

  assert.equal(config.GITHUB_MATTERMOST_REQUIRE_BOT, true);
  assert.deepEqual(resolveGitHubMattermostPostConfig(config), {
    MATTERMOST_URL: "https://mattermost.example.com",
    MATTERMOST_ACCESS_TOKEN: "github-bot-token",
    MATTERMOST_LOGIN_ID: undefined,
    MATTERMOST_PASSWORD: undefined,
    MATTERMOST_CHANNEL_ID: "github-channel",
  });

  const fallbackConfig = readGitHubMattermostSyncConfig({
    MATTERMOST_URL: "https://mattermost.example.com",
    MATTERMOST_BOT_TOKEN: "shared-bot-token",
    MATTERMOST_PUSH_CHANNEL_ID: "push-channel",
  });

  assert.equal(resolveGitHubMattermostPostConfig(fallbackConfig).MATTERMOST_ACCESS_TOKEN, "shared-bot-token");
});

test("GitHub Mattermost sync requires bot sender config when enabled", () => {
  const config = readGitHubMattermostSyncConfig({
    GITHUB_SYNC_ENABLED: "true",
    MATTERMOST_URL: "https://mattermost.example.com",
    MATTERMOST_LOGIN_ID: "human@example.com",
    MATTERMOST_PASSWORD: "human-password",
    GITHUB_MATTERMOST_CHANNEL_ID: "github-channel",
  });

  assert.throws(
    () => assertGitHubMattermostConfig(config),
    /GITHUB_MATTERMOST_BOT_TOKEN or MATTERMOST_BOT_TOKEN or GITHUB_MATTERMOST_LOGIN_ID\/GITHUB_MATTERMOST_PASSWORD/,
  );
});

test("resolves the GitHub Mattermost target channel with push bot fallback", () => {
  assert.equal(
    resolveGitHubMattermostChannelId({
      GITHUB_MATTERMOST_CHANNEL_ID: "github-channel",
      MATTERMOST_PUSH_CHANNEL_ID: "push-channel",
      MATTERMOST_CHANNEL_ID: "orf-channel",
    }),
    "github-channel",
  );
  assert.equal(
    resolveGitHubMattermostChannelId({
      MATTERMOST_PUSH_CHANNEL_ID: "push-channel",
      MATTERMOST_CHANNEL_ID: "orf-channel",
    }),
    "push-channel",
  );
  assert.equal(
    resolveGitHubMattermostChannelId({
      MATTERMOST_CHANNEL_ID: "orf-channel",
    }),
    "orf-channel",
  );
});

test("builds one stable GitHub push notification key per repository ref and after sha", () => {
  assert.equal(
    gitHubPushNotificationSyncKey({
      repository: "xueyu888/ORF",
      ref: "xy",
      afterSha: "2222222222222222222222222222222222222222",
    }),
    "github-push:xueyu888/ORF:xy:2222222222222222222222222222222222222222",
  );
  assert.equal(
    gitHubPushNotificationSyncKey({
      repository: "xueyu888/ORF",
      ref: "xy",
      afterSha: "0000000000000000000000000000000000000000",
    }),
    "github-push:xueyu888/ORF:xy:deleted",
  );
});

test("formats polled GitHub push commits for Mattermost", () => {
  const message = formatGitHubCommitSyncMessage({
    repository: "xueyu888/ORF",
    branch: "xy",
    commits: [
      {
        sha: "3333333333333333333333333333333333333333",
        html_url: "https://github.com/xueyu888/ORF/commit/3333333333333333333333333333333333333333",
        commit: {
          message: "docs: update sync instructions\n\nLong body",
          author: { name: "xueyu" },
        },
        author: { login: "xueyu" },
      },
    ],
  });

  assert.match(message, /GitHub push: \[xueyu888\/ORF\]/);
  assert.doesNotMatch(message, /Detected 1 pushed commit/);
  assert.match(message, /`3333333`/);
  assert.match(message, /\*\*xueyu\*\*: docs: update sync instructions/);
  assert.doesNotMatch(message, /Long body/);
});

test("formats GitHub issues for Mattermost", () => {
  const issues: GitHubIssue[] = [
    {
      number: 3,
      title: "[BUG] Missing bounty owner field",
      html_url: "https://github.com/xueyu888/ORF/issues/3",
      state: "open",
      created_at: "2026-05-14T03:33:12Z",
      user: { login: "wuyuzhi-dd" },
    },
  ];

  const message = formatGitHubIssuesMessage({
    repository: "xueyu888/ORF",
    issues,
    mode: "current",
  });

  assert.match(message, /GitHub issues: \[xueyu888\/ORF\]/);
  assert.match(message, /Found 1 currently open issue/);
  assert.match(message, /\[#3\]\(https:\/\/github.com\/xueyu888\/ORF\/issues\/3\)/);
  assert.match(message, /Missing bounty owner field - wuyuzhi-dd, opened 2026-05-14/);
});

test("GitHub webhook rejects oversized payloads before signature processing", async () => {
  const previousEnv = {
    GITHUB_WEBHOOK_SECRET: process.env.GITHUB_WEBHOOK_SECRET,
    GITHUB_MATTERMOST_BOT_TOKEN: process.env.GITHUB_MATTERMOST_BOT_TOKEN,
    GITHUB_SYNC_ENABLED: process.env.GITHUB_SYNC_ENABLED,
    GITHUB_ISSUES_SYNC_ENABLED: process.env.GITHUB_ISSUES_SYNC_ENABLED,
    MATTERMOST_CHANNEL_ID: process.env.MATTERMOST_CHANNEL_ID,
    MATTERMOST_JIRA_REMINDER_ENABLED: process.env.MATTERMOST_JIRA_REMINDER_ENABLED,
    MATTERMOST_URL: process.env.MATTERMOST_URL,
  };

  process.env.GITHUB_WEBHOOK_SECRET = "test-webhook-secret-value";
  process.env.MATTERMOST_CHANNEL_ID = "channel-id";
  process.env.GITHUB_MATTERMOST_BOT_TOKEN = "bot-token";
  process.env.GITHUB_SYNC_ENABLED = "false";
  process.env.GITHUB_ISSUES_SYNC_ENABLED = "false";
  process.env.MATTERMOST_URL = "https://mattermost.example.com";
  process.env.MATTERMOST_JIRA_REMINDER_ENABLED = "false";

  const app = await buildServer({ logger: false, registerOptionalIntegrations: true });
  try {
    const response = await app.inject({
      method: "POST",
      url: "/webhooks/github/push",
      headers: {
        "content-type": "application/json",
        "x-github-event": "push",
      },
      payload: Buffer.alloc(1024 * 1024 + 1, "x"),
    });

    assert.equal(response.statusCode, 413);
    assert.match(response.body, /payload is too large/);
  } finally {
    await app.close();
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});
