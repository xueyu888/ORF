import assert from "node:assert/strict";
import test from "node:test";
import {
  buildNotificationSystemMetadata,
  formatNotificationChatBody,
  notificationChatDeliveryId,
  resolveNotificationRecipients,
} from "../server/notifications/notificationEventModel";
import { notificationPolicy } from "../server/notifications/policies/registry";

test("personal notifications dedupe recipients and exclude the actor", () => {
  const recipients = resolveNotificationRecipients({
    actorUserId: "user-a",
    createdAt: "2026-06-19T10:00:00.000Z",
    recipientUserIds: ["user-a", "user-b", " user-b ", "user-c"],
    stream: "personalNotification",
  });

  assert.deepEqual(recipients, [
    { readAt: null, userId: "user-b" },
    { readAt: null, userId: "user-c" },
  ]);
});

test("team announcements keep the actor receipt but mark it read", () => {
  const recipients = resolveNotificationRecipients({
    actorUserId: "user-a",
    createdAt: "2026-06-19T10:00:00.000Z",
    recipientUserIds: ["user-a", "user-b", "user-b"],
    stream: "teamAnnouncement",
  });

  assert.deepEqual(recipients, [
    { readAt: "2026-06-19T10:00:00.000Z", userId: "user-a" },
    { readAt: null, userId: "user-b" },
  ]);
});

test("chat delivery ids are stable per event and recipient boundary", () => {
  assert.equal(
    notificationChatDeliveryId("nevt-1", "user-a"),
    notificationChatDeliveryId("nevt-1", "user-a"),
  );
  assert.notEqual(
    notificationChatDeliveryId("nevt-1", "user-a"),
    notificationChatDeliveryId("nevt-1", "user-b"),
  );
  assert.notEqual(
    notificationChatDeliveryId("nevt-1"),
    notificationChatDeliveryId("nevt-1", "user-a"),
  );
});

test("system chat projection metadata points back to the notification event", () => {
  const metadata = buildNotificationSystemMetadata({
    actorName: "薛雨",
    actorUserId: "user-a",
    body: "请补充信息",
    kind: "feedback.commented",
    metadata: { targetTitle: "聊天界面内存管理有问题" },
    replyTargetId: "fb-1",
    replyTargetType: "feedback",
    stream: "personalNotification",
    targetHref: "/feedback/fb-1",
    targetId: "fb-1",
    targetType: "feedback",
    title: "反馈有新评论",
  }, "nevt-1", "user-b");

  assert.equal(metadata.notificationEventId, "nevt-1");
  assert.equal(metadata.recipientUserId, "user-b");
  assert.equal(metadata.targetTitle, "聊天界面内存管理有问题");
  assert.equal(formatNotificationChatBody({ body: "请补充信息", targetHref: "/feedback/fb-1", title: "反馈有新评论" }), "**反馈有新评论**\n\n请补充信息\n\n[打开目标](/feedback/fb-1)");
});

test("settlement notifications are personal reminders without comment reply target", () => {
  assert.deepEqual(notificationPolicy("objective.settled"), {
    kind: "objective.settled",
    replyTarget: "none",
    stream: "personalNotification",
  });
});
