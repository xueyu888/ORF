import assert from "node:assert/strict";
import test from "node:test";
import { notificationTargetHref } from "../src/features/notifications/notificationTargets";
import type { AppNotification } from "../src/types/orf";

function notification(overrides: Partial<AppNotification>): AppNotification {
  return {
    id: "notification-1",
    kind: "challenge.application.rejected",
    recipientUserId: "user-1",
    actorUserId: "admin-1",
    actorName: "指挥官",
    title: "挑战申请未通过",
    body: "你申请挑战未通过。",
    targetType: "objective",
    targetId: "objective-1",
    targetHref: "",
    readAt: null,
    createdAt: "2026-06-18T00:00:00.000Z",
    metadata: {},
    ...overrides,
  };
}

test("rejected challenge application notification opens the bounty target", () => {
  assert.equal(
    notificationTargetHref(notification({ kind: "challenge.application.rejected" })),
    "/bounties#objective:objective-1",
  );
});

test("created challenge application notification opens the task target", () => {
  assert.equal(
    notificationTargetHref(notification({ kind: "challenge.application.created" })),
    "/tasks#objective:objective-1",
  );
});
