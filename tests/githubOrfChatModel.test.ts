import assert from "node:assert/strict";
import test from "node:test";
import {
  formatGitHubCommitSyncMessage,
  formatGitHubIssuesMessage,
  formatGitHubPushMessage,
  gitHubIssueDeliveryKey,
  gitHubPushDeliveryKey,
  readGitHubOrfChatConfig,
  selectNewGitHubApiCommits,
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
  assert.equal(config.GITHUB_SYNC_STATE_FILE, ".orf/integrations/github-sync-state.json");
  assert.equal(config.GITHUB_SYNC_STATE_FILE.startsWith(".artifacts/"), false);
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
    before: "1111111111111111111111111111111111111111",
    after: "3333333333333333333333333333333333333333",
    compare: "https://github.com/xueyu888/ORF/compare/1111...3333",
    sender: { login: "alice", html_url: "https://github.com/alice" },
    commits: [
      {
        id: "2222222222222222222222222222222222222222",
        message: "Move notifications into native chat\n\nbody",
        url: "https://github.com/xueyu888/ORF/commit/2222",
        timestamp: "2026-06-19T01:00:00Z",
        author: { username: "alice" },
      },
      {
        id: "3333333333333333333333333333333333333333",
        message: "Make newest commits visible first",
        url: "https://github.com/xueyu888/ORF/commit/3333",
        timestamp: "2026-06-19T02:00:00Z",
        author: { username: "bob" },
      },
    ],
  });

  assert.match(message, /alice.*推送了 2 个提交到.*xueyu888\/ORF.*`main` 分支/);
  assert.match(message, /\[\*\*alice\*\*\]\(https:\/\/github\.com\/alice\)/);
  assert.match(message, /\[xueyu888\/ORF\]\(https:\/\/github\.com\/xueyu888\/ORF\)/);
  assert.match(message, /\[\`3333333\`\]\(https:\/\/github\.com\/xueyu888\/ORF\/commit\/3333\)/);
  assert.ok(message.indexOf("Make newest commits visible first") < message.indexOf("Move notifications into native chat"));
  assert.match(message, /查看全部变更/);
  assert.doesNotMatch(message, /#### GitHub push/);
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
        author: { login: "bob", html_url: "https://github.com/bob" },
      },
    ],
  });

  assert.match(message, /1 个提交已推送到.*xueyu888\/ORF.*`main` 分支/);
  assert.match(message, /3333333/);
  assert.match(message, /Deliver GitHub events to ORF chat/);
  assert.match(message, /\[bob\]\(https:\/\/github\.com\/bob\)/);
  assert.match(message, /查看全部变更/);
});

test("GitHub polling keeps the API newest-first order when selecting unseen commits", () => {
  const commits = ["newest", "middle", "seen", "oldest"].map((sha) => ({
    sha,
    commit: { message: sha, author: { name: "Alice" } },
    author: null,
  }));

  assert.deepEqual(
    selectNewGitHubApiCommits(commits, "seen").map((commit) => commit.sha),
    ["newest", "middle"],
  );
  assert.deepEqual(
    selectNewGitHubApiCommits(commits, "missing").map((commit) => commit.sha),
    ["newest"],
  );
});

test("GitHub push only renders the latest five commits after normalization", () => {
  const commits = Array.from({ length: 7 }, (_, index) => ({
    id: `sha-${index + 1}`,
    message: `commit-${index + 1}`,
    timestamp: `2026-06-19T0${index + 1}:00:00Z`,
  }));
  const message = formatGitHubPushMessage({
    ref: "refs/heads/main",
    before: "sha-0",
    after: "sha-7",
    size: 7,
    repository: { full_name: "xueyu888/ORF" },
    commits,
  });

  assert.ok(message.indexOf("commit-7") < message.indexOf("commit-6"));
  assert.match(message, /commit-3/);
  assert.doesNotMatch(message, /commit-2|commit-1/);
  assert.match(message, /另有 2 个提交未逐条显示/);
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
