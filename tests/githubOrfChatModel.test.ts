import assert from "node:assert/strict";
import test from "node:test";
import {
  formatGitHubCommitSyncMessage,
  formatGitHubIssuesMessage,
  formatGitHubPushMessage,
  gitHubIssueDeliveryKey,
  gitHubPushDeliveryKey,
  readGitHubOrfChatConfig,
} from "../server/integrations/github-orf-chat";

test("GitHub ORF chat config ignores removed external chat variables", () => {
  const legacyUrlKey = "MATTER" + "MOST_URL";
  const legacyChannelKey = "GITHUB_" + "MATTER" + "MOST_CHANNEL_ID";
  const config = readGitHubOrfChatConfig({
    GITHUB_SYNC_ENABLED: "true",
    GITHUB_ISSUES_SYNC_ENABLED: "true",
    GITHUB_ORF_CHAT_CHANNEL_NAME: "engineering",
    [legacyUrlKey]: "http://legacy.example.com",
    [legacyChannelKey]: "legacy-channel",
  });

  assert.equal(config.GITHUB_SYNC_ENABLED, true);
  assert.equal(config.GITHUB_ISSUES_SYNC_ENABLED, true);
  assert.equal(config.GITHUB_ORF_CHAT_CHANNEL_NAME, "engineering");
  assert.equal(legacyUrlKey in config, false);
  assert.equal(legacyChannelKey in config, false);
});

test("GitHub push delivery key is stable and normalizes deleted refs", () => {
  assert.equal(
    gitHubPushDeliveryKey({
      repository: "xueyu888/ORF",
      ref: "main",
      afterSha: "2222222222222222222222222222222222222222",
    }),
    "github-push:xueyu888/ORF:main:2222222222222222222222222222222222222222",
  );
  assert.equal(gitHubPushDeliveryKey({ repository: "xueyu888/ORF", ref: "main", afterSha: "0000000" }), "github-push:xueyu888/ORF:main:deleted");
});

test("GitHub issue delivery key includes action and occurrence", () => {
  assert.equal(
    gitHubIssueDeliveryKey({
      action: "reopened",
      issueNumber: 42,
      occurrence: "2026-06-19T02:00:00Z",
      repository: "xueyu888/ORF",
    }),
    "github-issue:xueyu888/ORF:42:reopened:2026-06-19T02:00:00Z",
  );
});

test("GitHub push payload formats commits for ORF chat", () => {
  const message = formatGitHubPushMessage({
    ref: "refs/heads/main",
    repository: {
      full_name: "xueyu888/ORF",
      html_url: "https://github.com/xueyu888/ORF",
    },
    commits: [
      {
        id: "2222222222222222222222222222222222222222",
        message: "Move notifications into native chat\n\nbody",
        url: "https://github.com/xueyu888/ORF/commit/2222",
        author: { username: "alice" },
      },
    ],
  });

  assert.match(message, /#### GitHub push/);
  assert.match(message, /xueyu888\/ORF/);
  assert.match(message, /Move notifications into native chat/);
  assert.match(message, /alice/);
});

test("GitHub polling commit sync formats branch commits", () => {
  const message = formatGitHubCommitSyncMessage({
    repository: "xueyu888/ORF",
    branch: "main",
    commits: [
      {
        sha: "3333333333333333333333333333333333333333",
        html_url: "https://github.com/xueyu888/ORF/commit/3333",
        commit: {
          message: "Deliver GitHub events to ORF chat",
          author: { name: "Bob" },
        },
        author: { login: "bob" },
      },
    ],
  });

  assert.match(message, /#### GitHub push/);
  assert.match(message, /3333333/);
  assert.match(message, /Deliver GitHub events to ORF chat/);
});

test("GitHub issues format current and new issue summaries", () => {
  const message = formatGitHubIssuesMessage({
    repository: "xueyu888/ORF",
    mode: "new",
    issues: [
      {
        number: 7,
        title: "Route engineering updates into native chat",
        html_url: "https://github.com/xueyu888/ORF/issues/7",
        state: "open",
        created_at: "2026-06-19T01:00:00Z",
        user: { login: "carol" },
      },
    ],
  });

  assert.match(message, /#### GitHub issues/);
  assert.match(message, /newly open or reopened/);
  assert.match(message, /#7/);
  assert.match(message, /carol/);
});
