import assert from "node:assert/strict";
import test from "node:test";
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
