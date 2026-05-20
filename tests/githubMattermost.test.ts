import assert from "node:assert/strict";
import test from "node:test";
import { buildServer } from "../server/app";
import {
  formatGitHubCommitSyncMessage,
  formatGitHubIssuesMessage,
  formatGitHubPushMessage,
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
  assert.match(message, /xueyu pushed 1 commit to `main`/);
  assert.match(message, /`2222222`/);
  assert.match(message, /feat: sync GitHub pushes - xueyu/);
  assert.doesNotMatch(message, /Body is omitted/);
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
  assert.match(message, /Detected 1 pushed commit on `xy`/);
  assert.match(message, /`3333333`/);
  assert.match(message, /docs: update sync instructions - xueyu/);
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
    MATTERMOST_CHANNEL_ID: process.env.MATTERMOST_CHANNEL_ID,
    MATTERMOST_JIRA_REMINDER_ENABLED: process.env.MATTERMOST_JIRA_REMINDER_ENABLED,
    MATTERMOST_LOGIN_ID: process.env.MATTERMOST_LOGIN_ID,
    MATTERMOST_PASSWORD: process.env.MATTERMOST_PASSWORD,
    MATTERMOST_URL: process.env.MATTERMOST_URL,
  };

  process.env.GITHUB_WEBHOOK_SECRET = "test-webhook-secret-value";
  process.env.MATTERMOST_CHANNEL_ID = "channel-id";
  process.env.MATTERMOST_LOGIN_ID = "bot@example.com";
  process.env.MATTERMOST_PASSWORD = "password";
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
