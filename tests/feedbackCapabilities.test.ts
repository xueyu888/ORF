import assert from "node:assert/strict";
import test from "node:test";
import { canAssignFeedbackOwner, canEditFeedbackMetadata } from "../src/features/feedback/model/feedbackCapabilities";
import type { Feedback, OrfUser } from "../src/types/orf";

test("feedback metadata editing separates admin override from open participant edits", () => {
  const creator = user({ id: "user-creator", role: "member" });
  const owner = user({ id: "user-owner", role: "member" });
  const admin = user({ id: "user-admin", role: "admin" });
  const stranger = user({ id: "user-stranger", role: "member" });

  assert.equal(canEditFeedbackMetadata(feedback({ status: "Open" }), creator), true);
  assert.equal(canEditFeedbackMetadata(feedback({ status: "Open" }), owner), true);
  assert.equal(canEditFeedbackMetadata(feedback({ status: "Open" }), stranger), false);

  assert.equal(canEditFeedbackMetadata(feedback({ status: "Closed" }), creator), false);
  assert.equal(canEditFeedbackMetadata(feedback({ status: "Closed" }), owner), false);
  assert.equal(canEditFeedbackMetadata(feedback({ status: "Closed" }), admin), true);
});

test("feedback assignment is open to active members without opening all metadata fields", () => {
  const creator = user({ id: "user-creator", role: "member" });
  const owner = user({ id: "user-owner", role: "member" });
  const admin = user({ id: "user-admin", role: "admin" });
  const stranger = user({ id: "user-stranger", role: "member" });
  const inactiveMember = user({ id: "user-disabled", role: "member", status: "disabled" });

  assert.equal(canEditFeedbackMetadata(feedback({ status: "Open" }), stranger), false);
  assert.equal(canAssignFeedbackOwner(feedback({ status: "Open" }), creator), true);
  assert.equal(canAssignFeedbackOwner(feedback({ status: "Open" }), owner), true);
  assert.equal(canAssignFeedbackOwner(feedback({ status: "Open" }), stranger), true);
  assert.equal(canAssignFeedbackOwner(feedback({ status: "Open" }), inactiveMember), false);

  assert.equal(canAssignFeedbackOwner(feedback({ status: "Closed" }), stranger), false);
  assert.equal(canAssignFeedbackOwner(feedback({ status: "Closed" }), admin), true);
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

function feedback(input: Pick<Feedback, "status">): Feedback {
  return {
    activity: [],
    causeCategories: ["技术问题"],
    createdAt: "2026-07-07",
    createdBy: "user-creator",
    id: "fb-1",
    impact: "High",
    owner: "Owner",
    ownerUserId: "user-owner",
    phenomenon: "标题",
    projectId: null,
    status: input.status,
    suggestedAdjustment: "正文",
    updatedAt: "2026-07-07",
  };
}
