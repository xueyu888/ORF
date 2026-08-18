import assert from "node:assert/strict";
import test from "node:test";
import { validateDriveContextTypeEnum } from "../server/db/schemaGuard";
import {
  beginDriveFolderCreation,
  driveFolderCreationCanSubmit,
  failDriveFolderCreation,
  finishDriveFolderCreation,
  prepareDriveFolderCreationSubmission,
  updateDriveFolderCreationName,
} from "../src/features/drive/driveFolderCreationSession";

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

test("drive folder creation session keeps blank names editable until submit", () => {
  const editing = beginDriveFolderCreation();
  const blank = updateDriveFolderCreationName(editing, "");

  assert.deepEqual(blank, { name: "", status: "editing" });
  assert.equal(driveFolderCreationCanSubmit(blank), false);
  assert.equal(prepareDriveFolderCreationSubmission(blank), null);
  assert.deepEqual(finishDriveFolderCreation(), { status: "idle" });
});

test("drive folder creation session trims submitted name and restores failed submissions", () => {
  const editing = updateDriveFolderCreationName(beginDriveFolderCreation(), "  资料  ");
  const submission = prepareDriveFolderCreationSubmission(editing);

  assert.deepEqual(submission, {
    name: "资料",
    session: { name: "资料", status: "submitting" },
  });
  assert.deepEqual(failDriveFolderCreation(submission?.session ?? { status: "idle" }), { name: "资料", status: "editing" });
});
