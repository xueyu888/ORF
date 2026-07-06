import assert from "node:assert/strict";
import test from "node:test";
import { isReportsReadModelPath, reportsPagePath, shouldLoadTaskManagementReadModel, taskManagementPathForRole } from "../src/state/orfDataLoading";

test("reports page uses the public reports read model independently from role task models", () => {
  assert.equal(isReportsReadModelPath("/reports"), true);
  assert.equal(isReportsReadModelPath("/reports/member"), true);
  assert.equal(reportsPagePath(), "/api/reports-page");
});

test("non-report pages keep role-specific task management read models", () => {
  assert.equal(isReportsReadModelPath("/tasks"), false);
  assert.equal(taskManagementPathForRole("admin"), "/api/tasks-page");
  assert.equal(taskManagementPathForRole("member"), "/api/my-challenges?scope=mine");
});

test("resources page loads task context for drive work links", () => {
  assert.equal(shouldLoadTaskManagementReadModel("/resources"), true);
  assert.equal(shouldLoadTaskManagementReadModel("/resources/drive-node-1"), true);
  assert.equal(shouldLoadTaskManagementReadModel("/resources/drive-node-1/preview"), true);
});
