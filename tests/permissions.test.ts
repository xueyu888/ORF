import assert from "node:assert/strict";
import test from "node:test";
import { hasRolePermission, normalizePermissionKeys, permissionKeys, rolePermissionKeys } from "../src/config/permissions";
import type { PermissionRule } from "../src/types/orf";

const expectedPermissionKeys = [
  "objective.create",
  "objective.edit",
  "objective.delete",
  "result.create",
  "result.edit",
  "result.delete",
  "result.reviewCandidate",
  "challenge.assign",
  "challengeApplication.review",
  "task.delete",
  "subtask.delete",
  "settlement.review",
  "comment.manage",
];

test("permission key list only contains documented configurable permissions", () => {
  assert.deepEqual([...permissionKeys], expectedPermissionKeys);
  assert.equal((permissionKeys as readonly string[]).includes("challenge.apply"), false);
  assert.equal((permissionKeys as readonly string[]).includes("comment.editOwn"), false);
  assert.equal((permissionKeys as readonly string[]).includes("task.edit"), false);
});

test("permission helpers normalize keys and keep admin fixed", () => {
  const rules: PermissionRule[] = [
    {
      role: "member",
      permissions: ["comment.manage", "result.create"],
    },
  ];

  assert.deepEqual(normalizePermissionKeys(["comment.manage", "unknown.permission", "result.create"]), ["result.create", "comment.manage"]);
  assert.deepEqual(rolePermissionKeys(rules, "member"), ["result.create", "comment.manage"]);
  assert.equal(hasRolePermission("admin", [], "objective.delete"), true);
  assert.equal(hasRolePermission("member", rules, "result.create"), true);
  assert.equal(hasRolePermission("member", rules, "objective.create"), false);
});
