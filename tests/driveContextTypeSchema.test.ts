import assert from "node:assert/strict";
import test from "node:test";
import { validateDriveContextTypeEnum } from "../server/db/schemaGuard";

test("drive context type enum covers work resource link targets", () => {
  assert.deepEqual(validateDriveContextTypeEnum({
    labels: ["project", "objective", "result", "task", "feedback", "workLog", "chatChannel", "chatMessage", "chatThread"],
  }), []);
});

test("drive context type enum reports missing work resource link targets", () => {
  const errors = validateDriveContextTypeEnum({
    labels: ["project", "objective", "chatChannel"],
  });

  assert.match(errors.join("\n"), /result/);
  assert.match(errors.join("\n"), /task/);
  assert.match(errors.join("\n"), /feedback/);
  assert.match(errors.join("\n"), /workLog/);
  assert.match(errors.join("\n"), /chatMessage/);
  assert.match(errors.join("\n"), /chatThread/);
});
