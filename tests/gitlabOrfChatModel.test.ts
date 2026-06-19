import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGitLabProjectChannelName,
  formatGitLabWebhookChatMessage,
  parseGitLabWebhookEvent,
  type GitLabOrfChatProject,
} from "../server/integrations/gitlab-orf-chat/model";
import { mergeGitLabOrfChatProjectBindings } from "../server/integrations/gitlab-orf-chat/settingsModel";

const project: GitLabOrfChatProject = {
  id: "12345",
  path: "develop/platform/orf-api",
  url: "https://gitlab.example.com/develop/platform/orf-api",
};

test("GitLab project channel name is stable, bounded, and includes project identity", () => {
  const first = buildGitLabProjectChannelName(project);
  const second = buildGitLabProjectChannelName({ ...project, id: "67890" });

  assert.equal(first, "gitlab-develop-platform-orf-api-12345");
  assert.notEqual(first, second);
  assert.ok(first.length <= 48);
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

test("GitLab ORF chat settings merge GitLab projects with existing channel mappings", () => {
  const projects = mergeGitLabOrfChatProjectBindings({
    gitlabProjects: [
      { id: "1", path: "develop/a", url: "https://gitlab.example.com/develop/a" },
      { id: "2", path: "develop/b-renamed", url: "https://gitlab.example.com/develop/b-renamed" },
    ],
    mappings: [
      {
        channelDisplayName: "GitLab - develop/b",
        channelId: "chat-channel-b",
        channelType: "public",
        createdAt: "2026-06-19T01:00:00.000Z",
        lastSeenAt: "2026-06-19T01:00:00.000Z",
        projectId: "2",
        projectPath: "develop/b",
        projectUrl: "https://gitlab.example.com/develop/b",
        updatedAt: "2026-06-19T01:00:00.000Z",
      },
      {
        channelDisplayName: "GitLab - archived",
        channelId: "chat-channel-old",
        channelType: "private",
        createdAt: "2026-06-19T01:00:00.000Z",
        lastSeenAt: "2026-06-19T01:00:00.000Z",
        projectId: "9",
        projectPath: "develop/old",
        projectUrl: "",
        updatedAt: "2026-06-19T01:00:00.000Z",
      },
    ],
  });

  assert.deepEqual(
    projects.map((item) => ({
      channelId: item.channelId,
      projectId: item.projectId,
      projectPath: item.projectPath,
      source: item.source,
    })),
    [
      { channelId: null, projectId: "1", projectPath: "develop/a", source: "gitlab" },
      { channelId: "chat-channel-b", projectId: "2", projectPath: "develop/b-renamed", source: "gitlab" },
      { channelId: "chat-channel-old", projectId: "9", projectPath: "develop/old", source: "mapping" },
    ],
  );
});
