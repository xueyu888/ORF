import assert from "node:assert/strict";
import test from "node:test";
import { scopeStateCaseData, type TestdRunScope } from "../testd/_framework/run-scope";

const scope = {
  runId: "td-20260604120000-fixed",
  runToken: "4b24f71e5e",
  caseId: "comments.edit.non-author-forbidden.objective",
  caseToken: "a0857aea",
  workerIndex: 4,
  label: "r4b24f71e5e-ca0857aea-w4",
} satisfies TestdRunScope;

test("testd run scope keeps long emails unique within the 63 character local-part limit", () => {
  const data = scopeStateCaseData(
    {
      email: "orf-comment-edit-forbidden-objective@orf.local",
      secondaryEmail: "orf-comment-edit-forbidden-objective-participant@orf.local",
    },
    scope,
  );

  const [emailLocal] = data.email.split("@");
  const [secondaryEmailLocal] = data.secondaryEmail.split("@");

  assert.notEqual(data.email, data.secondaryEmail);
  assert.ok(emailLocal.length <= 63);
  assert.ok(secondaryEmailLocal.length <= 63);
  assert.match(data.email, /-[a-f0-9]{6}-td-4b24f71e5e-a0857aea-w4@orf\.local$/);
  assert.match(data.secondaryEmail, /-[a-f0-9]{6}-td-4b24f71e5e-a0857aea-w4@orf\.local$/);
});

test("testd run scope derives ids, filenames and display text without changing roles or passwords", () => {
  const data = scopeStateCaseData(
    {
      id: "obj-comment-fixture",
      role: "member",
      password: "OrfPassword!2026",
      permissionKey: "comment.manage",
      memberName: "ORF Member Recruit Member E2E",
      objectiveTitle: "E2E objective",
      taskDescription: "执行支撑目标的下一步技术任务。",
      commentBodyMarker: "E2E-COMMENT-EDIT-FORBIDDEN-OBJECTIVE:",
      rootCommentBody: "E2E-COMMENT-EDIT-FORBIDDEN-OBJECTIVE: 原始评论正文",
      invalidFileName: "comment-upload.txt",
    },
    scope,
  );

  assert.equal(data.id, "obj-comment-fixture-r4b24f71e5e-ca0857aea-w4");
  assert.equal(data.role, "member");
  assert.equal(data.password, "OrfPassword!2026");
  assert.equal(data.permissionKey, "comment.manage");
  assert.equal(data.memberName, "ORF Member Recruit Member E2E [r4b24f71e5e-ca0857aea-w4]");
  assert.equal(data.objectiveTitle, "E2E objective [r4b24f71e5e-ca0857aea-w4]");
  assert.equal(data.taskDescription, "执行支撑目标的下一步技术任务。");
  assert.equal(data.commentBodyMarker, "E2E-COMMENT-EDIT-FORBIDDEN-OBJECTIVE: [r4b24f71e5e-ca0857aea-w4]");
  assert.equal(data.rootCommentBody, "E2E-COMMENT-EDIT-FORBIDDEN-OBJECTIVE: [r4b24f71e5e-ca0857aea-w4] 原始评论正文");
  assert.ok(data.rootCommentBody.includes(data.commentBodyMarker));
  assert.equal(data.invalidFileName, "comment-upload-r4b24f71e5e-ca0857aea-w4.txt");
});
