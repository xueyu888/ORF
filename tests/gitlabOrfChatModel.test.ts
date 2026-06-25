import assert from "node:assert/strict";
import test from "node:test";
import {
  formatGitLabWebhookChatMessage,
  gitLabProjectPathMatchesGroup,
  normalizeGitLabOrfChatEventTypes,
  parseGitLabWebhookEvent,
  type GitLabOrfChatProject,
} from "../server/integrations/gitlab-orf-chat/model";

const project: GitLabOrfChatProject = {
  id: "12345",
  path: "develop/platform/orf-api",
  url: "https://gitlab.example.com/develop/platform/orf-api",
};

test("GitLab subscription event types are normalized to known webhook events", () => {
  assert.deepEqual(normalizeGitLabOrfChatEventTypes(["push", "push", "unknown", "pipeline"]), ["push", "pipeline"]);
  assert.deepEqual(normalizeGitLabOrfChatEventTypes([]), ["push", "tag_push", "merge_request", "issue", "pipeline"]);
});

test("GitLab push webhook prefers event UUID for delivery key and formats commits", () => {
  const event = parseGitLabWebhookEvent({
    headers: {
      "x-gitlab-event": "Push Hook",
      "x-gitlab-event-uuid": "event-uuid-1",
    },
    payload: {
      object_kind: "push",
      ref: "refs/heads/main",
      before: "1111111111111111111111111111111111111111",
      after: "2222222222222222222222222222222222222222",
      total_commits_count: 1,
      user_username: "alice",
      project: {
        id: 12345,
        path_with_namespace: project.path,
        web_url: project.url,
      },
      commits: [
        {
          id: "2222222222222222222222222222222222222222",
          message: "Implement native chat delivery\n\nbody",
          url: "https://gitlab.example.com/commit/2222",
          author: { name: "Alice" },
        },
      ],
    },
  });

  assert.ok(event);
  assert.equal(event.eventKey, "gitlab:12345:uuid:event-uuid-1");
  assert.equal(event.eventType, "push");

  const message = formatGitLabWebhookChatMessage(event);
  assert.match(message, /\*\*GitLab push\*\*/);
  assert.match(message, /alice pushed 1 commit to branch `main`/);
  assert.match(message, /Implement native chat delivery/);
});

test("GitLab fallback event key is deterministic without event UUID", () => {
  const payload = {
    object_kind: "pipeline",
    user_username: "ci",
    project: {
      id: "12345",
      path_with_namespace: project.path,
      web_url: project.url,
    },
    object_attributes: {
      id: 99,
      ref: "main",
      sha: "abcdef1234567890",
      status: "success",
    },
  };

  const first = parseGitLabWebhookEvent({ payload });
  const second = parseGitLabWebhookEvent({ payload });

  assert.ok(first);
  assert.ok(second);
  assert.equal(first.eventKey, second.eventKey);
  assert.equal(first.eventType, "pipeline");
});

test("GitLab merge request webhook formats project and branch context", () => {
  const event = parseGitLabWebhookEvent({
    headers: { "x-gitlab-event": "Merge Request Hook" },
    payload: {
      object_kind: "merge_request",
      user: { username: "bob" },
      project: {
        id: 12345,
        path_with_namespace: project.path,
        web_url: project.url,
      },
      object_attributes: {
        iid: 7,
        title: "Ship ORF chat integration",
        action: "open",
        state: "opened",
        source_branch: "feature/gitlab-chat",
        target_branch: "main",
        url: "https://gitlab.example.com/develop/platform/orf-api/-/merge_requests/7",
      },
    },
  });

  assert.ok(event);
  const message = formatGitLabWebhookChatMessage(event);
  assert.match(message, /\*\*GitLab merge request\*\*/);
  assert.match(message, /bob open/);
  assert.match(message, /`feature\/gitlab-chat` -> `main`/);
});

test("GitLab group subscription matches projects inside the configured group only", () => {
  assert.equal(gitLabProjectPathMatchesGroup("develop/platform/orf-api", "develop"), true);
  assert.equal(gitLabProjectPathMatchesGroup("develop/platform/orf-api", "/Develop/Platform/"), true);
  assert.equal(gitLabProjectPathMatchesGroup("development/platform/orf-api", "develop"), false);
});
