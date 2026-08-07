import assert from "node:assert/strict";
import test from "node:test";
import { canChangeFeedbackAssignee, canEditFeedbackMetadata } from "../src/features/feedback/model/feedbackCapabilities";
import type { Feedback, OrfUser } from "../src/types/orf";

test("feedback metadata editing follows active-user visibility gates", () => {
  const creator = user({ id: "user-creator", role: "member" });
  const assignee = user({ id: "user-assignee", role: "member" });
  const admin = user({ id: "user-admin", role: "admin" });
  const stranger = user({ id: "user-stranger", role: "member" });
  const inactiveMember = user({ id: "user-disabled", role: "member", status: "disabled" });

  assert.equal(canEditFeedbackMetadata(feedback({ stage: "open" }), creator), true);
  assert.equal(canEditFeedbackMetadata(feedback({ stage: "open" }), assignee), true);
  assert.equal(canEditFeedbackMetadata(feedback({ stage: "open" }), stranger), true);
  assert.equal(canEditFeedbackMetadata(feedback({ stage: "closed", resolution: "resolved", closedAt: "2026-07-08", closedByUserId: "user-creator" }), admin), true);
  assert.equal(canEditFeedbackMetadata(feedback({ stage: "open" }), inactiveMember), false);
});

test("feedback assignment keeps closed feedback admin-gated in the frontend", () => {
  const creator = user({ id: "user-creator", role: "member" });
  const assignee = user({ id: "user-assignee", role: "member" });
  const admin = user({ id: "user-admin", role: "admin" });
  const stranger = user({ id: "user-stranger", role: "member" });
  const inactiveMember = user({ id: "user-disabled", role: "member", status: "disabled" });

  assert.equal(canChangeFeedbackAssignee(feedback({ stage: "open" }), creator), true);
  assert.equal(canChangeFeedbackAssignee(feedback({ stage: "open" }), assignee), true);
  assert.equal(canChangeFeedbackAssignee(feedback({ stage: "open" }), stranger), true);
  assert.equal(canChangeFeedbackAssignee(feedback({ stage: "open" }), inactiveMember), false);

  assert.equal(canChangeFeedbackAssignee(feedback({ stage: "closed", resolution: "resolved", closedAt: "2026-07-08", closedByUserId: "user-creator" }), stranger), false);
  assert.equal(canChangeFeedbackAssignee(feedback({ stage: "closed", resolution: "resolved", closedAt: "2026-07-08", closedByUserId: "user-creator" }), admin), true);
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

function feedback(input: Partial<Feedback>): Feedback {
  return {
    activity: [],
    causeCategories: ["技术问题"],
    createdAt: "2026-07-07",
    createdBy: "user-creator",
    id: "fb-1",
    impact: "high",
    priority: null,
    reportAttachments: [],
    relations: [],
    assigneeUserId: "user-assignee",
    title: "标题",
    description: "正文",
    projectId: null,
    stage: "open",
    resolution: null,
    updatedAt: "2026-07-07",
    updatedBy: "user-creator",
    version: 0,
    closedAt: null,
    closedByUserId: null,
    ...input,
  };
}
