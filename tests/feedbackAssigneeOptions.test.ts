import assert from "node:assert/strict";
import test from "node:test";
import {
  ensureFeedbackAssigneeOption,
  feedbackAssigneeOptionsFromUsers,
  mergeFeedbackAssigneeOptions,
} from "@orf/feedback-module/testing";
import type { OrfUser } from "../src/types/orf";

test("feedback assignee options are active scoped members, not the visible users collection", () => {
  const visibleUsers = feedbackAssigneeOptionsFromUsers([
    user({ id: "current", name: "当前用户", status: "active" }),
  ]);
  const scopedAssignees = [
    { avatarUrl: null, id: "alice", name: "阿丽" },
    { avatarUrl: null, id: "bob", name: "博文" },
  ];

  const options = mergeFeedbackAssigneeOptions(scopedAssignees, visibleUsers);

  assert.deepEqual(new Set(options.map((option) => option.id)), new Set(["alice", "bob", "current"]));
});

test("feedback assignee options exclude inactive users from local fallback", () => {
  const options = feedbackAssigneeOptionsFromUsers([
    user({ id: "active", name: "激活成员", status: "active" }),
    user({ id: "disabled", name: "停用成员", status: "disabled" }),
  ]);

  assert.deepEqual(options.map((option) => option.id), ["active"]);
});

test("feedback assignee options preserve the selected owner for an existing issue", () => {
  const options = ensureFeedbackAssigneeOption(
    [{ avatarUrl: null, id: "active", name: "激活成员" }],
    { avatarUrl: null, id: "legacy", name: "历史处理人" },
  );

  assert.deepEqual(new Set(options.map((option) => option.id)), new Set(["active", "legacy"]));
});

function user(input: Pick<OrfUser, "id" | "name" | "status">): OrfUser {
  return {
    email: `${input.id}@example.com`,
    id: input.id,
    name: input.name,
    role: "member",
    status: input.status,
  };
}
