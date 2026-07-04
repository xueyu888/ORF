import assert from "node:assert/strict";
import test from "node:test";
import {
  ApiError,
  apiJson,
  getChatBootstrap,
  getChatUsers,
  getUserPreferences,
  invalidateUserPreferencesCache,
  saveUserPreferences,
  type ChatBootstrapResponse,
  type UserPreferences,
} from "../src/state/apiClient";
import { readModelInvalidationKey } from "../src/features/realtime/readModelInvalidations";
import { confirmApiAuthenticationExpiredSession } from "../src/state/orfProviderAuth";
import { loadEmptyOrfStateSnapshot } from "../src/state/orfStateSnapshot";
import type { AuthSession } from "../src/state/apiClient";
import type { OrfReadModelInvalidation } from "../src/types/realtime";
import type { OrfState, OrfUser } from "../src/types/orf";

function userPreferences(userId: string, overrides: Partial<UserPreferences> = {}): UserPreferences {
  return {
    appBackground: null,
    backgrounds: {},
    chatTheme: "light",
    defaultLandingPath: "/bounties",
    display: {
      contentFontSize: 14,
      contrast: "default",
      density: "default",
      interfaceFontSize: 14,
      workbenchZoomLevel: 0,
    },
    notificationDisplay: {
      toastEnabled: true,
    },
    sidebarCollapsed: false,
    userId,
    workspaceLayout: {
      secondaryPanel: null,
      secondaryWidthPx: 420,
      version: 1,
    },
    ...overrides,
  };
}

function chatBootstrap(overrides: Partial<ChatBootstrapResponse> = {}): ChatBootstrapResponse {
  return {
    channels: [],
    permissions: {
      canCreatePrivateChannel: false,
      canCreatePublicChannel: false,
      canManageAnyChannel: false,
      canManageAnyMembers: false,
      canRead: true,
      canWrite: true,
    },
    settings: {
      attachmentMaxBytes: 10,
      infrastructureMaxBytes: 10,
    },
    users: [],
    ...overrides,
  };
}

test("apiJson hides HTML gateway error pages behind a readable service message", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
    invalidateUserPreferencesCache();
  });
  globalThis.fetch = (async () =>
    new Response("<html><head><title>502 Bad Gateway</title></head><body>nginx</body></html>", {
      headers: { "content-type": "text/html" },
      status: 502,
    })) as typeof fetch;

  await assert.rejects(
    apiJson("/api/work-logs/objectives"),
    (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 502);
      assert.equal(error.message, "服务暂时不可用，请稍后重试");
      return true;
    },
  );
});

test("getUserPreferences reuses the same user request and cache without crossing users", async (t) => {
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  const responses = [
    userPreferences("user-a", { defaultLandingPath: "/tasks" }),
    userPreferences("user-b", { defaultLandingPath: "/chat" }),
  ];

  t.after(() => {
    globalThis.fetch = originalFetch;
    invalidateUserPreferencesCache();
  });
  invalidateUserPreferencesCache();

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requests.push(String(input));
    const data = responses.shift();
    if (!data) {
      throw new Error("unexpected preferences request");
    }
    return new Response(JSON.stringify({ code: 0, data, message: "ok" }), {
      headers: { "content-type": "application/json" },
      status: 200,
    });
  }) as typeof fetch;

  const [first, second] = await Promise.all([
    getUserPreferences({ userId: "user-a" }),
    getUserPreferences({ userId: "user-a" }),
  ]);
  assert.equal(first.defaultLandingPath, "/tasks");
  assert.equal(second.defaultLandingPath, "/tasks");
  assert.equal(requests.length, 1);

  const cached = await getUserPreferences({ userId: "user-a" });
  assert.equal(cached.defaultLandingPath, "/tasks");
  assert.equal(requests.length, 1);

  const otherUser = await getUserPreferences({ userId: "user-b" });
  assert.equal(otherUser.defaultLandingPath, "/chat");
  assert.equal(requests.length, 2);
});

test("saveUserPreferences replaces the cached preferences fact", async (t) => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ body: string | null; method: string; url: string }> = [];
  const initial = userPreferences("user-a", { defaultLandingPath: "/tasks" });
  const saved = userPreferences("user-a", { defaultLandingPath: "/reports" });

  t.after(() => {
    globalThis.fetch = originalFetch;
    invalidateUserPreferencesCache();
  });
  invalidateUserPreferencesCache();

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({
      body: typeof init?.body === "string" ? init.body : null,
      method: init?.method ?? "GET",
      url: String(input),
    });
    const data = init?.method === "PUT" ? saved : initial;
    return new Response(JSON.stringify({ code: 0, data, message: "ok" }), {
      headers: { "content-type": "application/json" },
      status: 200,
    });
  }) as typeof fetch;

  assert.equal((await getUserPreferences({ userId: "user-a" })).defaultLandingPath, "/tasks");
  assert.equal((await saveUserPreferences({ defaultLandingPath: "/reports" })).defaultLandingPath, "/reports");
  assert.equal((await getUserPreferences({ userId: "user-a" })).defaultLandingPath, "/reports");
  assert.deepEqual(requests.map((request) => request.method), ["GET", "PUT"]);
});

test("chat bootstrap and chat users reuse in-flight requests without caching settled data", async (t) => {
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  let bootstrapResolve: ((response: Response) => void) | null = null;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    requests.push(url);
    if (url === "/api/chat/bootstrap" && !bootstrapResolve) {
      return new Promise<Response>((resolve) => {
        bootstrapResolve = resolve;
      });
    }
    if (url === "/api/chat/bootstrap") {
      return new Response(JSON.stringify(chatBootstrap({ settings: { attachmentMaxBytes: 30, infrastructureMaxBytes: 30 } })), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    }
    if (url === "/api/chat/users") {
      return new Response(JSON.stringify({ users: [] }), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    }
    throw new Error(`unexpected request ${url}`);
  }) as typeof fetch;

  const [firstBootstrap, secondBootstrap] = [getChatBootstrap(), getChatBootstrap()];
  assert.equal(requests.filter((url) => url === "/api/chat/bootstrap").length, 1);
  bootstrapResolve?.(new Response(JSON.stringify(chatBootstrap({ settings: { attachmentMaxBytes: 20, infrastructureMaxBytes: 20 } })), {
    headers: { "content-type": "application/json" },
    status: 200,
  }));
  assert.equal((await firstBootstrap).settings.attachmentMaxBytes, 20);
  assert.equal((await secondBootstrap).settings.attachmentMaxBytes, 20);

  assert.equal((await getChatBootstrap()).settings.attachmentMaxBytes, 30);
  assert.equal(requests.filter((url) => url === "/api/chat/bootstrap").length, 2);

  await Promise.all([getChatUsers(), getChatUsers()]);
  assert.equal(requests.filter((url) => url === "/api/chat/users").length, 1);
});

test("readModelInvalidationKey can separate presence updates from structural user changes", () => {
  const invalidations: OrfReadModelInvalidation[] = [
    {
      createdAt: "2026-07-04T01:00:00.000Z",
      id: "presence",
      models: ["users"],
      reason: "user.presence.changed",
      target: { id: "user-a", type: "user" },
    },
    {
      createdAt: "2026-07-04T01:01:00.000Z",
      id: "profile",
      models: ["users"],
      reason: "user.changed",
      target: { id: "user-a", type: "user" },
    },
  ];

  assert.equal(
    readModelInvalidationKey(invalidations, "users", { includeReasons: ["user.presence.changed"] }),
    "presence:user.presence.changed:user:user-a:2026-07-04T01:00:00.000Z",
  );
  assert.equal(
    readModelInvalidationKey(invalidations, "users", { excludeReasons: ["user.presence.changed"] }),
    "profile:user.changed:user:user-a:2026-07-04T01:01:00.000Z",
  );
});

function createAuthStateRecorder() {
  let state = loadEmptyOrfStateSnapshot();
  const authUserIds: Array<string | null> = [];
  const connectionErrors: Array<string | null> = [];

  return {
    authUserIds,
    connectionErrors,
    get state() {
      return state;
    },
    setAuthConnectionError(value: string | null | ((current: string | null) => string | null)) {
      const next = typeof value === "function" ? value(connectionErrors.at(-1) ?? null) : value;
      connectionErrors.push(next);
    },
    setAuthUserId(value: string | null | ((current: string | null) => string | null)) {
      const next = typeof value === "function" ? value(authUserIds.at(-1) ?? null) : value;
      authUserIds.push(next);
    },
    setState(value: OrfState | ((current: OrfState) => OrfState)) {
      state = typeof value === "function" ? value(state) : value;
    },
  };
}

const activeUser: OrfUser = {
  email: "active@example.com",
  id: "user-active",
  lastOnlineAt: null,
  name: "Active User",
  role: "member",
  status: "active",
};

test("authentication expiry confirmation keeps the session when auth dependency is unavailable", async () => {
  const recorder = createAuthStateRecorder();

  const result = await confirmApiAuthenticationExpiredSession({
    loadSession: async () => {
      throw new ApiError(503, "/api/auth/session", "数据服务暂时不可用，请稍后重试。");
    },
    setAuthConnectionError: recorder.setAuthConnectionError,
    setAuthUserId: recorder.setAuthUserId,
    setState: recorder.setState,
  });

  assert.equal(result, "unavailable");
  assert.deepEqual(recorder.authUserIds, []);
  assert.equal(recorder.connectionErrors.at(-1), "数据服务暂时不可用，请稍后重试。");
});

test("authentication expiry confirmation clears the user only after session endpoint confirms no session", async () => {
  const recorder = createAuthStateRecorder();

  const result = await confirmApiAuthenticationExpiredSession({
    loadSession: async (): Promise<AuthSession> => ({ authenticated: false, user: null }),
    setAuthConnectionError: recorder.setAuthConnectionError,
    setAuthUserId: recorder.setAuthUserId,
    setState: recorder.setState,
  });

  assert.equal(result, "expired");
  assert.deepEqual(recorder.authUserIds, [null]);
});

test("authentication expiry confirmation restores the authenticated user when the session is still valid", async () => {
  const recorder = createAuthStateRecorder();

  const result = await confirmApiAuthenticationExpiredSession({
    loadSession: async (): Promise<AuthSession> => ({ authenticated: true, user: activeUser }),
    setAuthConnectionError: recorder.setAuthConnectionError,
    setAuthUserId: recorder.setAuthUserId,
    setState: recorder.setState,
  });

  assert.equal(result, "authenticated");
  assert.deepEqual(recorder.authUserIds, [activeUser.id]);
  assert.equal(recorder.state.currentUserId, activeUser.id);
  assert.equal(recorder.state.users.find((user) => user.id === activeUser.id)?.email, activeUser.email);
});
