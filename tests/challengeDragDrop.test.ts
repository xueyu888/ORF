import assert from "node:assert/strict";
import test from "node:test";
import { canDropItem, projectDropTargetForEvent } from "../src/features/challenge/model/challengeDragDrop";

test("objective drag can move across projects and into the unassigned project bucket", () => {
  const objective = { type: "objective", id: "objective-1", projectId: "project-a" } as const;

  assert.deepEqual(projectDropTargetForEvent(objective, "project-b"), { type: "project", projectId: "project-b" });
  assert.equal(canDropItem(objective, { type: "project", projectId: "project-b" }), true);
  assert.equal(canDropItem(objective, { type: "project", projectId: null }), true);
  assert.equal(canDropItem(objective, { type: "project", projectId: "project-a" }), false);
});

test("project drop targets only accept objective drags", () => {
  assert.equal(projectDropTargetForEvent({ type: "action", id: "task-1", objectiveId: "objective-1" }, "project-a"), null);
});
