import assert from "node:assert/strict";
import test from "node:test";
import { canCreateTeamFeedback } from "@orf/feedback-module/contracts";
import { updateFeedbackAssigneeForTesting } from "@orf/feedback-module/testing";
import type { OrfUser } from "../src/types/orf";

test("feedback creation follows the active-user frontend gate", () => {
  assert.equal(canCreateTeamFeedback(user({ id: "member-1", role: "member" })), true);
  assert.equal(canCreateTeamFeedback(user({ id: "admin-1", role: "admin" })), true);
  assert.equal(canCreateTeamFeedback(user({ id: "disabled-1", role: "member", status: "disabled" })), false);
  assert.equal(canCreateTeamFeedback(user({ id: "pending-1", role: "member", status: "pending" })), false);
  assert.equal(canCreateTeamFeedback(null), false);
});

test("feedback assignee web mutation uses PUT semantics", async (t) => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ body: string | null; contentType: string | null; method: string; url: string }> = [];

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    requests.push({
      body: typeof init?.body === "string" ? init.body : null,
      contentType: headers.get("Content-Type"),
      method: init?.method ?? "GET",
      url: String(input),
    });
    return new Response(null, { status: 204 });
  }) as typeof fetch;

  await updateFeedbackAssigneeForTesting("feedback 1", "user-1", 7);

  assert.deepEqual(requests, [{
    body: JSON.stringify({ assigneeUserId: "user-1", expectedVersion: 7 }),
    contentType: "application/json",
    method: "PUT",
    url: "/api/feedback/feedback%201/assignee",
  }]);
});

function user(input: Pick<OrfUser, "id" | "role"> & Partial<Pick<OrfUser, "status">>): OrfUser {
  return {
    email: `${input.id}@example.com`,
    id: input.id,
    name: input.id,
    role: input.role,
    status: input.status ?? "active",
  };
}
