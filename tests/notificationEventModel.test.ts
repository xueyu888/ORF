import assert from "node:assert/strict";
import test from "node:test";
import {
  buildNotificationSystemMetadata,
  formatNotificationChatBody,
  notificationChatDeliveryId,
  resolveNotificationRecipients,
} from "../server/notifications/notificationEventModel";
import {
  canReceiveE2eActorNotification,
  isE2eNotificationActor,
  isE2eNotificationActorName,
  notificationActorIsolationName,
  shouldSuppressE2eActorNotificationForRecipient,
} from "../server/notifications/notificationIsolationPolicy";
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

test("E2E actor notification isolation is based on actor name and recipient identity", () => {
  assert.equal(isE2eNotificationActorName("ORF Member Review E2E"), true);
  assert.equal(isE2eNotificationActorName("tangyl"), false);
  assert.equal(notificationActorIsolationName({ fallbackActorName: "Displayed E2E", userName: "普通用户" }), "普通用户");
  assert.equal(notificationActorIsolationName({ fallbackActorName: "System E2E", userName: "" }), "System E2E");
  assert.equal(isE2eNotificationActor({ fallbackActorName: "Displayed E2E", userName: "普通用户" }), false);
  assert.equal(isE2eNotificationActor({ fallbackActorName: "System E2E", userName: "" }), true);

  assert.equal(canReceiveE2eActorNotification({ email: "tangyl@sdrising.com", name: "唐" }), true);
  assert.equal(canReceiveE2eActorNotification({ email: "zrx831@gmail.com", name: "张" }), true);
  assert.equal(canReceiveE2eActorNotification({ email: "member@example.com", name: "ORF E2E Member" }), true);
  assert.equal(canReceiveE2eActorNotification({ email: "member@example.com", name: "普通成员" }), false);

  assert.equal(shouldSuppressE2eActorNotificationForRecipient({
    actorName: "ORF E2E Bot",
    recipient: { email: "member@example.com", name: "普通成员" },
  }), true);
  assert.equal(shouldSuppressE2eActorNotificationForRecipient({
    actorName: "tangyl",
    recipient: { email: "member@example.com", name: "普通成员" },
  }), false);
  assert.equal(shouldSuppressE2eActorNotificationForRecipient({
    actorName: "ORF E2E Bot",
    recipient: { email: "tangyl@sdrising.com", name: "唐" },
  }), false);
});
