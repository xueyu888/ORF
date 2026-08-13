import assert from "node:assert/strict";
import test from "node:test";
import { canCreateTeamFeedback } from "@orf/feedback-module/contracts";
import {
  submitFeedbackFollowUpForTesting,
} from "@orf/feedback-module/testing";
import type { OrfUser } from "../src/types/orf";

test("feedback creation follows the active-user frontend gate", () => {
  assert.equal(canCreateTeamFeedback(user({ id: "member-1", role: "member" })), true);
  assert.equal(canCreateTeamFeedback(user({ id: "admin-1", role: "admin" })), true);
  assert.equal(canCreateTeamFeedback(user({ id: "disabled-1", role: "member", status: "disabled" })), false);
  assert.equal(canCreateTeamFeedback(user({ id: "pending-1", role: "member", status: "pending" })), false);
  assert.equal(canCreateTeamFeedback(null), false);
});

test("feedback follow-up sends comment, lifecycle, and assignee through one endpoint", async (t) => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ body: string | null; method: string; url: string }> = [];

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({
      body: typeof init?.body === "string" ? init.body : null,
      method: init?.method ?? "GET",
      url: String(input),
    });
    return new Response(null, { status: 204 });
  }) as typeof fetch;

  const body = {
    expectedVersion: 7,
    comment: { body: "已完成修复并验证。" },
    assigneeUserId: "user-2",
    transition: { type: "submit_verification" as const, resolution: "resolved" as const, note: "已完成修复并验证。" },
  };
  await submitFeedbackFollowUpForTesting("feedback 1", body);

  assert.deepEqual(requests, [{
    body: JSON.stringify(body),
    method: "POST",
    url: "/api/feedback/feedback%201/follow-ups",
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
