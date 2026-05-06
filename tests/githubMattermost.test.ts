import assert from "node:assert/strict";
import test from "node:test";
import { formatGitHubCommitSyncMessage, formatGitHubPushMessage, type GitHubPushPayload } from "../server/integrations/github-mattermost-sync";

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

test("formats polled GitHub commits for Mattermost", () => {
  const message = formatGitHubCommitSyncMessage({
    repository: "xueyu888/ORF",
    branch: "main",
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

  assert.match(message, /GitHub sync: \[xueyu888\/ORF\]/);
  assert.match(message, /Detected 1 new commit on `main`/);
  assert.match(message, /`3333333`/);
  assert.match(message, /docs: update sync instructions - xueyu/);
  assert.doesNotMatch(message, /Long body/);
});
