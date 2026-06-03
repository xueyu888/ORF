import assert from "node:assert/strict";
import test from "node:test";
import {
  projectHookMatchesTarget,
  readGitLabMattermostWebhookReconcilerConfig,
  reconcileGitLabMattermostProjectWebhooks,
} from "../server/integrations/gitlab-mattermost-webhook-reconciler";

const baseEnv = {
  GITLAB_MATTERMOST_WEBHOOK_RECONCILE_ENABLED: "true",
  GITLAB_URL: "https://gitlab.example.com",
  GITLAB_USER: "xueyu",
  GITLAB_MATTERMOST_WEBHOOK_RECONCILE_PASSWORD: "password",
  GITLAB_MATTERMOST_WEBHOOK_RECONCILE_GROUP: "develop",
  GITLAB_MATTERMOST_WEBHOOK_URL: "https://mattermost.example.com/plugins/com.github.manland.mattermost-plugin-gitlab/webhook",
  GITLAB_MATTERMOST_WEBHOOK_SECRET: "webhook-secret",
  GITLAB_MATTERMOST_WEBHOOK_RECONCILE_PUSH_EVENT_HOOKS_LIMIT: "1000",
} satisfies NodeJS.ProcessEnv;

test("GitLab Mattermost reconciler disabled config does not require GitLab settings", () => {
  const config = readGitLabMattermostWebhookReconcilerConfig({});

  assert.equal(config.enabled, false);
  assert.equal(config.gitlabUrl, "");
  assert.equal(config.webhookUrl, "");
});

test("GitLab Mattermost hook target requires all branches and push events", () => {
  assert.equal(
    projectHookMatchesTarget({
      id: 1,
      url: baseEnv.GITLAB_MATTERMOST_WEBHOOK_URL,
      push_events: true,
      tag_push_events: true,
      merge_requests_events: true,
      issues_events: true,
      confidential_issues_events: true,
      note_events: true,
      confidential_note_events: true,
      job_events: true,
      pipeline_events: true,
      wiki_page_events: true,
      deployment_events: true,
      releases_events: true,
      enable_ssl_verification: true,
      branch_filter_strategy: "all_branches",
      push_events_branch_filter: null,
    }),
    true,
  );

  assert.equal(
    projectHookMatchesTarget({
      id: 1,
      url: baseEnv.GITLAB_MATTERMOST_WEBHOOK_URL,
      push_events: true,
      tag_push_events: true,
      merge_requests_events: true,
      issues_events: true,
      confidential_issues_events: true,
      note_events: true,
      confidential_note_events: true,
      job_events: true,
      pipeline_events: true,
      wiki_page_events: true,
      deployment_events: true,
      releases_events: true,
      enable_ssl_verification: true,
      branch_filter_strategy: "wildcard",
      push_events_branch_filter: "main",
    }),
    false,
  );
});

test("GitLab Mattermost reconciler creates missing hooks and repairs drift", async () => {
  const fetcher = new FakeGitLabFetch();
  const config = readGitLabMattermostWebhookReconcilerConfig(baseEnv);

  const result = await reconcileGitLabMattermostProjectWebhooks(config, { fetchImpl: fetcher.fetch });

  assert.deepEqual(result.created, ["develop/new-project"]);
  assert.deepEqual(result.updated, ["develop/drifted-project"]);
  assert.deepEqual(result.failed, []);
  assert.deepEqual(result.duplicates, []);
  assert.deepEqual(result.pushEventHooksLimit, { before: 3, after: 1000, updated: true });
  assert.equal(fetcher.createdHooks.length, 1);
  assert.equal(fetcher.updatedHooks.length, 1);
  assert.match(String(fetcher.createdHooks[0].body), /branch_filter_strategy=all_branches/);
  assert.match(String(fetcher.updatedHooks[0].body), /push_events=true/);
});

class FakeGitLabFetch {
  createdHooks: RequestInit[] = [];
  updatedHooks: RequestInit[] = [];
  private settings = { push_event_hooks_limit: 3 };

  fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";

    if (url.pathname === "/oauth/token" && method === "POST") {
      return jsonResponse({ access_token: "gitlab-token" });
    }

    if (url.pathname === "/api/v4/application/settings" && method === "GET") {
      return jsonResponse(this.settings);
    }

    if (url.pathname === "/api/v4/application/settings" && method === "PUT") {
      this.settings = { push_event_hooks_limit: 1000 };
      return jsonResponse(this.settings);
    }

    if (url.pathname === "/api/v4/groups/develop/projects") {
      return jsonResponse([
        { id: 1, path_with_namespace: "develop/new-project" },
        { id: 2, path_with_namespace: "develop/drifted-project" },
      ]);
    }

    if (url.pathname === "/api/v4/projects/1/hooks" && method === "GET") {
      return jsonResponse([]);
    }

    if (url.pathname === "/api/v4/projects/1/hooks" && method === "POST") {
      this.createdHooks.push(init ?? {});
      return jsonResponse({ id: 11 });
    }

    if (url.pathname === "/api/v4/projects/2/hooks" && method === "GET") {
      return jsonResponse([
        {
          id: 22,
          url: baseEnv.GITLAB_MATTERMOST_WEBHOOK_URL,
          push_events: true,
          tag_push_events: true,
          merge_requests_events: true,
          issues_events: true,
          confidential_issues_events: true,
          note_events: true,
          confidential_note_events: true,
          job_events: true,
          pipeline_events: true,
          wiki_page_events: true,
          deployment_events: true,
          releases_events: true,
          enable_ssl_verification: true,
          branch_filter_strategy: "wildcard",
          push_events_branch_filter: "main",
        },
      ]);
    }

    if (url.pathname === "/api/v4/projects/2/hooks/22" && method === "PUT") {
      this.updatedHooks.push(init ?? {});
      return jsonResponse({ id: 22 });
    }

    return new Response(JSON.stringify({ error: "unexpected request", path: url.pathname, method }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  };
}

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
