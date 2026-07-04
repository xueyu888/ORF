import assert from "node:assert/strict";
import test from "node:test";
import { ApiError, apiJson } from "../src/state/apiClient";
import { confirmApiAuthenticationExpiredSession } from "../src/state/orfProviderAuth";
import { loadEmptyOrfStateSnapshot } from "../src/state/orfStateSnapshot";
import type { AuthSession } from "../src/state/apiClient";
import type { OrfState, OrfUser } from "../src/types/orf";

test("apiJson hides HTML gateway error pages behind a readable service message", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
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
