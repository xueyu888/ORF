import assert from "node:assert/strict";
import test from "node:test";
import { shouldFetchAdminCollections, taskManagementPathForRole } from "../src/state/orfDataLoading";

test("ordinary members use scoped challenge data and do not fetch admin collections", () => {
  assert.equal(taskManagementPathForRole("member"), "/api/my-challenges?scope=mine");
  assert.equal(shouldFetchAdminCollections("member"), false);
});

test("administrators load full task data and admin-only collections", () => {
  assert.equal(taskManagementPathForRole("admin"), "/api/tasks-page");
  assert.equal(shouldFetchAdminCollections("admin"), true);
});
