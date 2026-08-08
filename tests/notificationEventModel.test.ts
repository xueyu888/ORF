import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCommentNotificationContent,
  buildNotificationSystemMetadata,
  commentNotificationImageAttachmentIdsFromMetadata,
  formatNotificationChatBody,
  notificationActionFor,
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
import {
  parseDataSyncEventPayload,
  selectDataSyncRecipientMembership,
  dataSyncEventMetadata,
} from "../server/notifications/dataSyncNotificationModel";
import { workLogSubmissionNotificationBody } from "../server/workLogs/workLogSubmissionNotification";
import type { NotificationKind, NotificationTargetType } from "../src/types/orf";

test("personal notifications dedupe recipients and exclude the actor", () => {
  const recipients = resolveNotificationRecipients({
    actorUserId: "user-a",
    createdAt: "2026-06-19T10:00:00.000Z",
    recipientUserIds: ["user-a", "user-b", " user-b ", "user-c"],
    stream: "personalNotification",
  });

  assert.deepEqual(recipients, [
    { attentionLevel: "normal", deliveryClass: "ordinary", readAt: null, reasons: [], userId: "user-b" },
    { attentionLevel: "normal", deliveryClass: "ordinary", readAt: null, reasons: [], userId: "user-c" },
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
    { attentionLevel: "normal", deliveryClass: "ordinary", readAt: "2026-06-19T10:00:00.000Z", reasons: [], userId: "user-a" },
    { attentionLevel: "normal", deliveryClass: "ordinary", readAt: null, reasons: [], userId: "user-b" },
  ]);
});

test("notification recipient facts merge reasons and strongest delivery semantics", () => {
  const recipients = resolveNotificationRecipients({
    actorUserId: "user-a",
    createdAt: "2026-06-19T10:00:00.000Z",
    recipientFacts: [
      { deliveryClass: "ordinary", reasons: ["participant"], userId: "user-b" },
      { attentionLevel: "action_required", deliveryClass: "direct", reasons: ["action_required"], userId: "user-b" },
      { deliveryClass: "mandatory", reasons: ["administrator"], userId: "user-c" },
    ],
    recipientUserIds: ["user-b", "user-d"],
    stream: "personalNotification",
  });

  assert.deepEqual(recipients, [
    {
      attentionLevel: "action_required",
      deliveryClass: "direct",
      readAt: null,
      reasons: ["action_required", "participant"],
      userId: "user-b",
    },
    {
      attentionLevel: "normal",
      deliveryClass: "mandatory",
      readAt: null,
      reasons: ["administrator"],
      userId: "user-c",
    },
    {
      attentionLevel: "normal",
      deliveryClass: "ordinary",
      readAt: null,
      reasons: [],
      userId: "user-d",
    },
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
  assert.equal(
    notificationChatDeliveryId("nevt-1", null, "channel-a"),
    notificationChatDeliveryId("nevt-1", null, "channel-a"),
  );
  assert.notEqual(
    notificationChatDeliveryId("nevt-1", "user-a"),
    notificationChatDeliveryId("nevt-1", null, "channel-a"),
  );
  assert.notEqual(
    notificationChatDeliveryId("nevt-1"),
    notificationChatDeliveryId("nevt-1", null, "channel-a"),
  );
});

test("system chat projection metadata points back to the notification event", () => {
  const metadata = buildNotificationSystemMetadata({
    actorName: "薛雨",
    actorUserId: "user-a",
    body: "请补充信息",
    kind: "feedback.comment.created",
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
  assert.equal(formatNotificationChatBody({
    body: "请补充信息",
    kind: "feedback.comment.created",
    targetHref: "/feedback/fb-1?comment=comment-1",
    targetType: "feedback",
    title: "反馈有新评论",
  }), "**反馈有新评论**\n\n请补充信息\n\n[打开评论](/feedback/fb-1?comment=comment-1)");
});

test("notification actions use the target-specific label", () => {
  assert.deepEqual(notificationActionFor({
    body: "张骞 提交了 2026-08-04 的工作日志。",
    kind: "worklog.submitted",
    targetHref: "/work-logs?date=2026-08-04&view=today&entry=worklog-1",
    targetType: "workLog",
    title: "新的工作日志",
  }), {
    href: "/work-logs?date=2026-08-04&view=today&entry=worklog-1",
    label: "打开工作日志",
  });

  assert.deepEqual(notificationActionFor({
    body: "请处理",
    kind: "objective.settled",
    targetHref: "/reports?date=2026-08-04&objective=objective-1",
    targetType: "objective",
    title: "目标已结算",
  }), {
    href: "/reports?date=2026-08-04&objective=objective-1",
    label: "打开统计",
  });
});

test("work log submission notification body stays compact because chat renders the log card separately", () => {
  assert.equal(
    workLogSubmissionNotificationBody({
      authorName: "张骞",
      workDate: "2026-08-04",
    }),
    "张骞 提交了 2026-08-04 的工作日志。",
  );
});

test("known notification kinds have explicit action labels", () => {
  const samples: Array<{
    kind: NotificationKind;
    label: string;
    targetHref: string;
    targetType: NotificationTargetType;
  }> = [
    { kind: "objective.published", label: "打开悬赏", targetHref: "/bounties#objective:objective-1", targetType: "objective" },
    { kind: "challenge.application.created", label: "处理申请", targetHref: "/tasks#objective:objective-1", targetType: "objective" },
    { kind: "challenge.application.approved", label: "打开悬赏", targetHref: "/bounties#objective:objective-1", targetType: "objective" },
    { kind: "challenge.application.rejected", label: "打开悬赏", targetHref: "/bounties#objective:objective-1", targetType: "objective" },
    { kind: "objective.recruitment.created", label: "响应征召", targetHref: "/bounties#objective:objective-1", targetType: "objective" },
    { kind: "objective.reinforcement.added", label: "打开我的挑战", targetHref: "/tasks#objective:objective-1", targetType: "objective" },
    { kind: "objective.challenge.accepted", label: "打开挑战", targetHref: "/tasks#objective:objective-1", targetType: "objective" },
    { kind: "objective.alignment.requested", label: "处理对齐", targetHref: "/tasks#objective:objective-1", targetType: "objective" },
    { kind: "objective.alignment.reviewed", label: "查看对齐", targetHref: "/tasks#objective:objective-1", targetType: "objective" },
    { kind: "objective.loot.submitted", label: "验收战利品", targetHref: "/tasks/objectives/objective-1/loot", targetType: "objectiveLoot" },
    { kind: "objective.revision.required", label: "打开战利品", targetHref: "/tasks/objectives/objective-1/loot", targetType: "objective" },
    { kind: "objective.peerReview.requested", label: "检查互评", targetHref: "/tasks/objectives/objective-1/loot", targetType: "objective" },
    { kind: "objective.settlement.updated", label: "打开统计", targetHref: "/reports?date=2026-08-04&objective=objective-1", targetType: "objective" },
    { kind: "objective.settled", label: "打开统计", targetHref: "/reports?date=2026-08-04&objective=objective-1", targetType: "objective" },
    { kind: "feedback.created", label: "打开反馈", targetHref: "/feedback/feedback-1", targetType: "feedback" },
    { kind: "feedback.comment.created", label: "打开评论", targetHref: "/feedback/feedback-1?comment=comment-1", targetType: "feedback" },
    { kind: "feedback.lifecycle.changed", label: "打开反馈", targetHref: "/feedback/feedback-1", targetType: "feedback" },
    { kind: "feedback.assignee.changed", label: "打开反馈", targetHref: "/feedback/feedback-1", targetType: "feedback" },
    { kind: "feedback.assignee.digest", label: "打开反馈列表", targetHref: "/feedback?state=open&assignee=user-1", targetType: "feedback" },
    { kind: "comment.reply.created", label: "打开评论", targetHref: "/tasks?comment=comment-1#objective:objective-1", targetType: "comment" },
    { kind: "comment.thread.status.changed", label: "打开评论", targetHref: "/tasks?comment=thread-1#objective:objective-1", targetType: "comment" },
    { kind: "comment.mention.created", label: "打开评论", targetHref: "/tasks?comment=comment-1#objective:objective-1", targetType: "comment" },
    { kind: "data.sync.conflict", label: "打开通知中心", targetHref: "/chat/system/personalNotifications", targetType: "dataSync" },
    { kind: "worklog.submitted", label: "打开工作日志", targetHref: "/work-logs?date=2026-08-04&view=today&entry=worklog-1", targetType: "workLog" },
    { kind: "worklog.reminder", label: "去补工作日志", targetHref: "/work-logs?date=2026-08-04&view=today", targetType: "workLog" },
  ];

  for (const sample of samples) {
    assert.deepEqual(notificationActionFor({
      body: "通知正文",
      kind: sample.kind,
      targetHref: sample.targetHref,
      targetType: sample.targetType,
      title: "通知标题",
    }), {
      href: sample.targetHref,
      label: sample.label,
    });
  }
});

test("comment notification content keeps text and image attachments without file attachment projection", () => {
  const content = buildCommentNotificationContent({
    attachments: [
      { fileName: "screen.png", id: "image-1", mimeType: "image/png", previewKind: "image" },
      { fileName: "report.pdf", id: "file-1", mimeType: "application/pdf", previewKind: "pdf" },
    ],
    commentBody: [
      "请看截图。",
      "![screen.png](orf-attachment:image-1)",
      "![report.pdf](orf-attachment:file-1)",
    ].join("\n"),
    summary: "邓滨虎 回复了反馈「上传失败」：",
  });

  assert.equal(content.body, "邓滨虎 回复了反馈「上传失败」：\n\n> 请看截图。\n\n![screen.png](orf-attachment:image-1)");
  assert.deepEqual(commentNotificationImageAttachmentIdsFromMetadata(content.metadata), ["image-1"]);
});

test("comment notification content quotes text around image previews", () => {
  const content = buildCommentNotificationContent({
    attachments: [
      { fileName: "screen.png", id: "image-1", mimeType: "image/png", previewKind: "image" },
    ],
    commentBody: [
      "前面说明。",
      "![screen.png](orf-attachment:image-1)",
      "后面补充。",
    ].join("\n"),
    summary: "朱锐轩 回复了反馈「反馈中心应该有草稿」：",
  });

  assert.equal(
    content.body,
    "朱锐轩 回复了反馈「反馈中心应该有草稿」：\n\n> 前面说明。\n\n![screen.png](orf-attachment:image-1)\n\n> 后面补充。",
  );
  assert.deepEqual(commentNotificationImageAttachmentIdsFromMetadata(content.metadata), ["image-1"]);
});

test("settlement notifications are personal reminders without comment reply target", () => {
  assert.deepEqual(notificationPolicy("objective.settlement.updated"), {
    kind: "objective.settlement.updated",
    replyTarget: "none",
    stream: "personalNotification",
  });
  assert.deepEqual(notificationPolicy("objective.settled"), {
    kind: "objective.settled",
    replyTarget: "none",
    stream: "personalNotification",
  });
});

test("data sync conflict notifications are personal reminders without comment reply target", () => {
  assert.deepEqual(notificationPolicy("data.sync.conflict"), {
    kind: "data.sync.conflict",
    replyTarget: "none",
    stream: "personalNotification",
  });
});

test("work log submission notifications are team announcements", () => {
  assert.deepEqual(notificationPolicy("worklog.submitted"), {
    kind: "worklog.submitted",
    replyTarget: "none",
    stream: "teamAnnouncement",
  });
});

test("data sync ORF recipient must resolve to exactly one Xueyu membership", () => {
  const memberships = [
    { email: "other@example.com", name: "其他人", teamId: "team-1", userId: "user-other" },
    { email: "xueyu@example.com", name: "薛雨", teamId: "team-1", userId: "user-xueyu" },
  ];

  assert.deepEqual(selectDataSyncRecipientMembership(memberships, {}), {
    email: "xueyu@example.com",
    name: "薛雨",
    teamId: "team-1",
    userId: "user-xueyu",
  });
  assert.throws(
    () => selectDataSyncRecipientMembership([...memberships, { email: "xueyu-2@example.com", name: "薛雨", teamId: "team-2", userId: "user-xueyu-2" }], {}),
    /exactly one active team member/,
  );
  assert.throws(
    () => selectDataSyncRecipientMembership(memberships, { userId: "user-other" }),
    /matched=0/,
  );
});

test("data sync event payload keeps raw data outbox facts as metadata", () => {
  const event = parseDataSyncEventPayload({
    body: "冲突明细",
    event_type: "sync.conflict.detected",
    fingerprint: "fp-1",
    payload: { db_conflict_count: 1 },
    severity: "blocking",
    title: "[data-sync][冲突]",
  });

  assert.equal(event.eventType, "sync.conflict.detected");
  assert.deepEqual(dataSyncEventMetadata(event), {
    dataSyncEventType: "sync.conflict.detected",
    dataSyncFingerprint: "fp-1",
    dataSyncPayloadJson: "{\"db_conflict_count\":1}",
    dataSyncSeverity: "blocking",
    targetTitle: "[data-sync][冲突]",
  });
});

test("revision and peer review notifications point back to the objective", () => {
  assert.deepEqual(notificationPolicy("objective.revision.required"), {
    kind: "objective.revision.required",
    replyTarget: "notification-target",
    stream: "personalNotification",
  });
  assert.deepEqual(notificationPolicy("objective.peerReview.requested"), {
    kind: "objective.peerReview.requested",
    replyTarget: "notification-target",
    stream: "personalNotification",
  });
});

test("feedback assignee change notifications stay replyable on the feedback target", () => {
  assert.deepEqual(notificationPolicy("feedback.assignee.changed"), {
    kind: "feedback.assignee.changed",
    replyTarget: "notification-target",
    stream: "personalNotification",
  });
});

test("feedback assignee digest is a personal notification without reply target", () => {
  assert.deepEqual(notificationPolicy("feedback.assignee.digest"), {
    kind: "feedback.assignee.digest",
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
