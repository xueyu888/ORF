import assert from "node:assert/strict";
import test from "node:test";
import {
  canEnableUserAccount,
  userAccountLifecycleActions,
} from "../src/domain/userAccountLifecycle";

test("user account lifecycle exposes registration review actions only for pending users", () => {
  assert.deepEqual(userAccountLifecycleActions("pending"), ["approve", "reject"]);
});

test("user account lifecycle exposes enable only for disabled users", () => {
  assert.deepEqual(userAccountLifecycleActions("disabled"), ["enable"]);
  assert.equal(canEnableUserAccount("disabled"), true);
});

test("user account lifecycle does not treat rejected users as enableable", () => {
  assert.deepEqual(userAccountLifecycleActions("rejected"), ["disable"]);
  assert.equal(canEnableUserAccount("rejected"), false);
});

test("user account lifecycle keeps active users on the disable path", () => {
  assert.deepEqual(userAccountLifecycleActions("active"), ["disable"]);
  assert.equal(canEnableUserAccount("active"), false);
});
