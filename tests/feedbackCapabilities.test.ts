import assert from "node:assert/strict";
import test from "node:test";
import { canCreateTeamFeedback } from "../src/features/feedback/model/feedbackCapabilities";
import type { OrfUser } from "../src/types/orf";

test("feedback creation follows the active-user frontend gate", () => {
  assert.equal(canCreateTeamFeedback(user({ id: "member-1", role: "member" })), true);
  assert.equal(canCreateTeamFeedback(user({ id: "admin-1", role: "admin" })), true);
  assert.equal(canCreateTeamFeedback(user({ id: "disabled-1", role: "member", status: "disabled" })), false);
  assert.equal(canCreateTeamFeedback(user({ id: "pending-1", role: "member", status: "pending" })), false);
  assert.equal(canCreateTeamFeedback(null), false);
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
