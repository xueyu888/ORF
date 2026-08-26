import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canPreviewFeedbackReportAttachment,
  feedbackNotificationCardReferenceFromPayload,
  feedbackNotificationEventKindFromPayload,
  feedbackReferenceCardDataFromReadModel,
  feedbackReportAttachmentDto,
  feedbackReportAttachmentPreviewKind,
  feedbackNotificationEventPlanSchema,
  feedbackTransitionInputSchema,
  planFeedbackAssigneeChangedNotification,
  planFeedbackCommentCreatedNotification,
  planFeedbackCreatedNotification,
  planFeedbackFollowUpNotification,
  planFeedbackLifecycleChangedNotification,
  type FeedbackEntitySnapshot,
  type FeedbackIssueReadModelData,
} from "@orf/feedback-module/contracts";
import {
  applyFeedbackTransition,
  canonicalizeFeedbackRelation,
  commitFeedbackFollowUp,
  deriveFeedbackCapabilities,
  feedbackActorFixture,
  feedbackEntityFixture,
  validateFeedbackLifecycle,
} from "@orf/feedback-module/testing";

const occurredAt = "2026-08-07T09:00:00.000Z";

type FeedbackFollowUpRow = {
  readonly assigneeUserId: string | null;
  readonly closedAt: string | null;
  readonly closedByUserId: string | null;
  readonly createdAt: string;
  readonly createdBy: string;
  readonly description: string;
  readonly id: string;
  readonly impact: FeedbackEntitySnapshot["impact"];
  readonly priority: FeedbackEntitySnapshot["priority"];
  readonly projectId: string | null;
  readonly resolution: FeedbackEntitySnapshot["resolution"];
  readonly stage: FeedbackEntitySnapshot["stage"];
  readonly teamId: string;
  readonly title: string;
  readonly updatedAt: string;
  readonly updatedBy: string | null;
  readonly version: number;
};

function feedbackFollowUpRowFixture(overrides: Partial<FeedbackEntitySnapshot> = {}): FeedbackFollowUpRow {
  const entity = feedbackEntityFixture(overrides);
  return {
    assigneeUserId: entity.assigneeUserId ?? null,
    closedAt: entity.closedAt ?? null,
    closedByUserId: entity.closedByUserId ?? null,
    createdAt: occurredAt,
    createdBy: entity.createdByUserId,
    description: "原始报告正文",
    id: entity.id,
    impact: entity.impact,
    priority: entity.priority ?? null,
    projectId: entity.projectId ?? null,
    resolution: entity.resolution,
    stage: entity.stage,
    teamId: entity.teamId,
    title: "页面滚动位置异常",
    updatedAt: occurredAt,
    updatedBy: entity.createdByUserId,
    version: entity.version,
  };
}

function fakeFeedbackFollowUpDatabase(target: FeedbackFollowUpRow) {
  const updates: Array<Record<string, unknown>> = [];
  const insertConflictChain = {
    onConflictDoNothing: async () => undefined,
    onConflictDoUpdate: async () => undefined,
  };

  return {
    database: {
      select(selection?: Record<string, unknown>) {
        if (selection && "targetFeedbackId" in selection) {
          return {
            from: () => ({
              where: async () => [],
            }),
          };
        }

        return {
          from: () => ({
            where: () => ({
              limit: () => ({
                for: async () => [target],
              }),
            }),
          }),
        };
      },
      update() {
        return {
          set(value: Record<string, unknown>) {
            updates.push(value);
            return {
              where: async () => undefined,
            };
          },
        };
      },
      insert() {
        return {
          values() {
            return insertConflictChain;
          },
        };
      },
    } as never,
    updates,
  };
}

describe("feedback module domain", () => {
  it("enforces lifecycle invariants as the single stage/resolution source", () => {
    assert.deepEqual(
      validateFeedbackLifecycle({
        feedback: feedbackEntityFixture({ stage: "open", resolution: null }),
      }),
      [],
    );

    assert.equal(
      validateFeedbackLifecycle({
        feedback: feedbackEntityFixture({ stage: "open", resolution: "resolved" }),
      })[0]?.code,
      "lifecycle_invariant_violation",
    );

    assert.equal(
      validateFeedbackLifecycle({
        feedback: feedbackEntityFixture({ stage: "closed", resolution: "resolved" }),
      })[0]?.code,
      "lifecycle_invariant_violation",
    );

    assert.deepEqual(
      validateFeedbackLifecycle({
        feedback: feedbackEntityFixture({
          stage: "closed",
          resolution: "resolved",
          closedAt: occurredAt,
          closedByUserId: "reporter-1",
        }),
      }),
      [],
    );
  });

  it("rejects unspecified resolution in new transition commands", () => {
    const parsed = feedbackTransitionInputSchema.safeParse({
      type: "submit_verification",
      expectedVersion: 0,
      resolution: "unspecified",
      note: "done",
    });

    assert.equal(parsed.success, false);
  });

  it("lets the assignee start work and submit reporter verification", () => {
    const feedback = feedbackEntityFixture();
    const actor = feedbackActorFixture({ id: "assignee-1" });

    const started = applyFeedbackTransition({
      feedback,
      actor,
      occurredAt,
      command: { type: "start", expectedVersion: 0 },
    });

    assert.equal(started.ok, true);
    assert.equal(started.value.feedback.stage, "in_progress");
    assert.equal(started.value.feedback.version, 1);
    assert.equal(started.value.activityType, "feedback.lifecycle.changed");

    const submitted = applyFeedbackTransition({
      feedback: started.value.feedback,
      actor,
      occurredAt,
      command: {
        type: "submit_verification",
        expectedVersion: 1,
        resolution: "resolved",
        note: "fixed",
      },
    });

    assert.equal(submitted.ok, true);
    assert.equal(submitted.value.feedback.stage, "pending_verification");
    assert.equal(submitted.value.feedback.resolution, "resolved");
    assert.equal(submitted.value.feedback.closedAt, null);
    assert.equal(submitted.value.feedback.version, 2);
  });

  it("keeps reporter-only verification closure out of assignee authority", () => {
    const feedback = feedbackEntityFixture({
      stage: "pending_verification",
      resolution: "resolved",
      version: 2,
    });

    const accepted = applyFeedbackTransition({
      feedback,
      actor: feedbackActorFixture({ id: "assignee-1" }),
      occurredAt,
      command: { type: "accept_verification", expectedVersion: 2 },
    });

    assert.equal(accepted.ok, false);
    assert.equal(accepted.error.code, "forbidden");
  });

  it("lets the reporter close verified feedback and records close facts", () => {
    const feedback = feedbackEntityFixture({
      stage: "pending_verification",
      resolution: "resolved",
      version: 2,
    });

    const accepted = applyFeedbackTransition({
      feedback,
      actor: feedbackActorFixture({ id: "reporter-1" }),
      occurredAt,
      command: { type: "accept_verification", expectedVersion: 2 },
    });

    assert.equal(accepted.ok, true);
    assert.equal(accepted.value.feedback.stage, "closed");
    assert.equal(accepted.value.feedback.resolution, "resolved");
    assert.equal(accepted.value.feedback.closedAt, occurredAt);
    assert.equal(accepted.value.feedback.closedByUserId, "reporter-1");
  });

  it("requires a takeover reason when an admin performs reporter-only transitions", () => {
    const feedback = feedbackEntityFixture({
      stage: "pending_verification",
      resolution: "resolved",
      version: 2,
    });
    const admin = feedbackActorFixture({ id: "admin-1", role: "admin" });

    const withoutReason = applyFeedbackTransition({
      feedback,
      actor: admin,
      occurredAt,
      command: { type: "accept_verification", expectedVersion: 2 },
    });

    assert.equal(withoutReason.ok, false);
    assert.equal(withoutReason.error.code, "administrative_takeover_reason_required");

    const withReason = applyFeedbackTransition({
      feedback,
      actor: admin,
      occurredAt,
      command: {
        type: "accept_verification",
        expectedVersion: 2,
        administrativeTakeover: { reason: "reporter unavailable" },
      },
    });

    assert.equal(withReason.ok, true);
    assert.equal(withReason.value.feedback.closedByUserId, "admin-1");
  });

  it("requires a duplicate relation before duplicate verification can enter the lifecycle", () => {
    const feedback = feedbackEntityFixture();
    const actor = feedbackActorFixture({ id: "assignee-1" });

    const missingRelation = applyFeedbackTransition({
      feedback,
      actor,
      occurredAt,
      command: {
        type: "submit_verification",
        expectedVersion: 0,
        resolution: "duplicate",
        duplicateTargetFeedbackId: "feedback-2",
        note: "same as feedback-2",
      },
    });

    assert.equal(missingRelation.ok, false);
    assert.equal(missingRelation.error.code, "duplicate_relation_required");

    const withRelation = applyFeedbackTransition({
      feedback,
      actor,
      occurredAt,
      duplicateRelations: { duplicateTargetFeedbackIds: ["feedback-2"] },
      command: {
        type: "submit_verification",
        expectedVersion: 0,
        resolution: "duplicate",
        duplicateTargetFeedbackId: "feedback-2",
        note: "same as feedback-2",
      },
    });

    assert.equal(withRelation.ok, true);
    assert.equal(withRelation.value.feedback.resolution, "duplicate");

    const missingTarget = applyFeedbackTransition({
      feedback,
      actor,
      occurredAt,
      duplicateRelations: { duplicateTargetFeedbackIds: ["feedback-2"] },
      command: {
        type: "submit_verification",
        expectedVersion: 0,
        resolution: "duplicate",
        note: "same as another feedback",
      },
    });

    assert.equal(missingTarget.ok, false);
    assert.equal(missingTarget.error.code, "duplicate_relation_required");
  });

  it("withdraws and reopens feedback through explicit lifecycle transitions", () => {
    const openFeedback = feedbackEntityFixture({ version: 3 });
    const reporter = feedbackActorFixture({ id: "reporter-1" });

    const withdrawn = applyFeedbackTransition({
      feedback: openFeedback,
      actor: reporter,
      occurredAt,
      command: { type: "withdraw", expectedVersion: 3, note: "no longer needed" },
    });

    assert.equal(withdrawn.ok, true);
    assert.equal(withdrawn.value.feedback.stage, "closed");
    assert.equal(withdrawn.value.feedback.resolution, "not_needed");

    const reopened = applyFeedbackTransition({
      feedback: withdrawn.value.feedback,
      actor: reporter,
      occurredAt: "2026-08-07T10:00:00.000Z",
      command: { type: "reopen", expectedVersion: 4, note: "issue returned" },
    });

    assert.equal(reopened.ok, true);
    assert.equal(reopened.value.feedback.stage, "open");
    assert.equal(reopened.value.feedback.resolution, null);
    assert.equal(reopened.value.feedback.closedAt, null);
    assert.equal(reopened.value.feedback.closedByUserId, null);
  });

  it("persists follow-up lifecycle snapshots without restoring superseded nullable facts", async () => {
    const { database, updates } = fakeFeedbackFollowUpDatabase(feedbackFollowUpRowFixture({
      stage: "pending_verification",
      resolution: "resolved",
      version: 2,
    }));

    const result = await commitFeedbackFollowUp(database, {
      comment: { messageId: "comment-1", threadId: "thread-1" },
      expectedVersion: 2,
      feedbackId: "feedback-1",
      notificationDispatch: null,
      transition: {
        type: "reject_verification",
        expectedVersion: 2,
        note: "验证不通过，退回处理。",
      },
    }, feedbackActorFixture({ id: "reporter-1" }));

    assert.deepEqual(result, { status: "ok", changed: true });
    assert.equal(updates.length, 1);
    assert.equal(updates[0]?.stage, "in_progress");
    assert.equal(updates[0]?.resolution, null);
    assert.equal(updates[0]?.closedAt, null);
    assert.equal(updates[0]?.closedByUserId, null);
    assert.equal(updates[0]?.version, 3);
  });

  it("derives command and metadata capabilities from actor scope", () => {
    const feedback = feedbackEntityFixture();
    const memberCapabilities = deriveFeedbackCapabilities({
      feedback,
      actor: feedbackActorFixture({ id: "member-1" }),
    });

    assert.equal(memberCapabilities.canView, true);
    assert.equal(memberCapabilities.canSetPriority, true);
    assert.equal(memberCapabilities.canEditReport, true);
    assert.equal(memberCapabilities.canChangeAssignee, true);
    assert.equal(memberCapabilities.canImportExport, true);
    assert.equal(memberCapabilities.canStart, false);

    const assigneeCapabilities = deriveFeedbackCapabilities({
      feedback,
      actor: feedbackActorFixture({ id: "assignee-1" }),
    });
    assert.equal(assigneeCapabilities.canStart, true);

    const inactiveCapabilities = deriveFeedbackCapabilities({
      feedback,
      actor: feedbackActorFixture({ id: "assignee-1", status: "inactive" }),
    });
    assert.equal(inactiveCapabilities.canView, false);
    assert.equal(inactiveCapabilities.canSetPriority, false);
  });

  it("canonicalizes symmetric feedback relations and rejects self relations", () => {
    const related = canonicalizeFeedbackRelation({
      sourceFeedbackId: "feedback-b",
      targetFeedbackId: "feedback-a",
      type: "related",
    });

    assert.equal(related.ok, true);
    assert.deepEqual(related.value, {
      sourceFeedbackId: "feedback-a",
      targetFeedbackId: "feedback-b",
      type: "related",
    });

    const blocks = canonicalizeFeedbackRelation({
      sourceFeedbackId: "feedback-b",
      targetFeedbackId: "feedback-a",
      type: "blocks",
    });

    assert.equal(blocks.ok, true);
    assert.deepEqual(blocks.value, {
      sourceFeedbackId: "feedback-b",
      targetFeedbackId: "feedback-a",
      type: "blocks",
    });

    const self = canonicalizeFeedbackRelation({
      sourceFeedbackId: "feedback-a",
      targetFeedbackId: "feedback-a",
      type: "related",
    });

    assert.equal(self.ok, false);
    assert.equal(self.error.code, "invalid_relation");
  });

  it("rejects stale lifecycle commands by expected version", () => {
    const result = applyFeedbackTransition({
      feedback: feedbackEntityFixture({ version: 5 }),
      actor: feedbackActorFixture({ id: "assignee-1" }),
      occurredAt,
      command: { type: "start", expectedVersion: 4 },
    });

    assert.equal(result.ok, false);
    assert.equal(result.error.code, "expected_version_mismatch");
  });

  it("reports invalid transition sources through the lifecycle state machine", () => {
    const result = applyFeedbackTransition({
      feedback: feedbackEntityFixture({
        stage: "closed",
        resolution: "resolved",
        closedAt: occurredAt,
        closedByUserId: "reporter-1",
      }),
      actor: feedbackActorFixture({ id: "assignee-1" }),
      occurredAt,
      command: { type: "start", expectedVersion: 0 },
    });

    assert.equal(result.ok, false);
    assert.equal(result.error.code, "invalid_transition_source");
  });

  it("plans feedback notifications as personal-only events without project channel destinations", () => {
    const project = { id: "project-1", name: "客户端" };
    const recipients = ["admin-1", "assignee-1"];
    const plans = [
      planFeedbackCreatedNotification({
        actorName: "薛雨",
        actorUserId: "actor-1",
        assigneeName: "处理人",
        feedbackId: "feedback-1",
        project,
        recipientUserIds: recipients,
        teamId: "team-1",
        title: "页面滚动位置异常",
      }),
      planFeedbackLifecycleChangedNotification({
        actorName: "薛雨",
        actorUserId: "actor-1",
        feedbackId: "feedback-1",
        project,
        recipientUserIds: recipients,
        resolution: "resolved",
        stage: "pending_verification",
        teamId: "team-1",
        title: "页面滚动位置异常",
      }),
      planFeedbackAssigneeChangedNotification({
        actorName: "薛雨",
        actorUserId: "actor-1",
        feedbackId: "feedback-1",
        nextAssigneeName: "新处理人",
        previousAssigneeName: "旧处理人",
        recipientUserIds: recipients,
        teamId: "team-1",
        title: "页面滚动位置异常",
      }),
      planFeedbackCommentCreatedNotification({
        actorName: "薛雨",
        actorUserId: "actor-1",
        body: "薛雨 回复了反馈「页面滚动位置异常」：",
        commentMessageId: "comment-1",
        commentMetadata: { commentImageAttachmentIds: "att-1" },
        commentThreadId: "thread-1",
        feedbackId: "feedback-1",
        project,
        recipientUserIds: recipients,
        targetTitle: "页面滚动位置异常",
        teamId: "team-1",
      }),
    ];

    assert.deepEqual(plans.map((plan) => feedbackNotificationEventKindFromPayload(plan.payload)), [
      "feedback.created",
      "feedback.lifecycle.changed",
      "feedback.assignee.changed",
      "feedback.comment.created",
    ]);
    assert.deepEqual(plans.map((plan) => plan.payload.type), [
      "created",
      "lifecycle_changed",
      "assignee_changed",
      "comment_created",
    ]);
    for (const plan of plans) {
      assert.deepEqual(plan.recipientUserIds, recipients);
      assert.equal(plan.payload.version, 1);
    }
    assert.deepEqual(plans[0]?.payload, {
      version: 1,
      type: "created",
      actor: { id: "actor-1", name: "薛雨" },
      assignee: { id: null, name: "处理人" },
      feedback: {
        id: "feedback-1",
        project,
        title: "页面滚动位置异常",
      },
    });
    assert.deepEqual(plans[3]?.payload, {
      version: 1,
      type: "comment_created",
      actor: { id: "actor-1", name: "薛雨" },
      attachmentCount: 1,
      commentExcerpt: "薛雨 回复了反馈「页面滚动位置异常」：",
      commentMessageId: "comment-1",
      commentThreadId: "thread-1",
      feedback: {
        id: "feedback-1",
        project,
        title: "页面滚动位置异常",
      },
    });
    assert.deepEqual(feedbackNotificationCardReferenceFromPayload(plans[0].payload, "activity-1"), {
      version: 1,
      kind: "feedback",
      activityId: "activity-1",
      feedbackId: "feedback-1",
      payloadType: "created",
    });
    assert.deepEqual(feedbackNotificationCardReferenceFromPayload(plans[3].payload, "activity-4"), {
      version: 1,
      kind: "comment",
      activityId: "activity-4",
      commentMessageId: "comment-1",
      feedbackId: "feedback-1",
      payloadType: "comment_created",
    });
    assert.equal(feedbackNotificationEventPlanSchema.safeParse(plans[0]).success, true);
    assert.equal(feedbackNotificationEventPlanSchema.safeParse({
      ...plans[0],
      payload: undefined,
    }).success, false);
    assert.equal(feedbackNotificationEventPlanSchema.safeParse({
      ...plans[0],
      title: "旧的展示字段不再属于通知事实",
    }).success, false);

    const followUp = planFeedbackFollowUpNotification({
      actorName: "薛雨",
      actorUserId: "actor-1",
      assignee: { nextName: "新处理人", previousName: "旧处理人" },
      body: "薛雨 跟进了反馈并更新了生命周期和处理人。",
      comment: { messageId: "comment-2", metadata: {}, threadId: "thread-1" },
      feedbackId: "feedback-1",
      lifecycle: { resolution: "resolved", stage: "pending_verification" },
      project,
      recipientUserIds: recipients,
      teamId: "team-1",
      title: "页面滚动位置异常",
    });
    assert.equal(feedbackNotificationEventKindFromPayload(followUp.payload), "feedback.follow_up.created");
    assert.deepEqual(feedbackNotificationCardReferenceFromPayload(followUp.payload, "activity-5"), {
      version: 1,
      kind: "comment",
      activityId: "activity-5",
      commentMessageId: "comment-2",
      feedbackId: "feedback-1",
      payloadType: "follow_up",
    });
  });

  it("does not create card references for feedback digest payloads", () => {
    assert.equal(feedbackNotificationCardReferenceFromPayload({
      version: 1,
      type: "assignee_digest",
      assigneeUserId: "assignee-1",
      items: [],
      localDate: "2026-08-08",
      pendingCount: 0,
    }, "activity-digest"), null);
  });

  it("projects feedback reference cards from the authorized detail read model", () => {
    const readModel: FeedbackIssueReadModelData = {
      comments: [{
        createdAt: occurredAt,
        createdBy: "reporter-1",
        id: "thread-1",
        messages: [{
          attachments: [{
            contentUrl: "/api/comment-attachments/comment-att-1/content",
            downloadUrl: "/api/comment-attachments/comment-att-1/content?disposition=attachment",
            fileName: "reply.png",
            fileSize: 2048,
            id: "comment-att-1",
            mimeType: "image/png",
            previewKind: "image",
            previewUrl: "/api/comment-attachments/comment-att-1/content?disposition=inline",
          }],
          author: "评论人",
          authorUserId: "commenter-1",
          body: "评论正文",
          createdAt: "2026-08-07T09:05:00.000Z",
          id: "comment-1",
        }],
        status: "open",
        targetId: "feedback-1",
        targetTitle: "页面滚动位置异常",
        targetType: "feedback",
        updatedAt: "2026-08-07T09:05:00.000Z",
      }],
      feedback: [{
        activity: [{
          actorUserId: "reporter-1",
          activityType: "feedback.created",
          at: occurredAt,
          id: "activity-1",
          payload: {},
          sequence: 1,
        }, {
          actorUserId: "actor-1",
          activityType: "feedback.comment.created",
          at: "2026-08-07T09:05:00.000Z",
          id: "activity-2",
          payload: { commentMessageId: "comment-1" },
          sequence: 2,
        }],
        assigneeUserId: "assignee-1",
        capabilities: {
          canAcceptVerification: true,
          canChangeAssignee: true,
          canEditReport: true,
          canImportExport: true,
          canRejectVerification: true,
          canReopen: true,
          canSetPriority: true,
          canStart: true,
          canSubmitVerification: true,
          canView: true,
          canWithdraw: true,
        },
        causeCategories: ["技术问题"],
        closedAt: null,
        closedByUserId: null,
        createdAt: occurredAt,
        createdBy: "reporter-1",
        description: "原始报告正文",
        id: "feedback-1",
        impact: "high",
        lastActivityByUserId: "actor-1",
        lastActivitySequence: 2,
        lastSeenSequence: 1,
        priority: "p1",
        projectId: "project-1",
        relations: [],
        reportAttachments: [{
          contentUrl: "/api/feedback/report-attachments/report-att-1/content",
          downloadUrl: "/api/feedback/report-attachments/report-att-1/content?disposition=attachment",
          fileName: "capture.png",
          fileSize: 1024,
          id: "report-att-1",
          mimeType: "image/png",
          previewKind: "image",
          previewUrl: "/api/feedback/report-attachments/report-att-1/content?disposition=inline",
        }],
        requiresAction: true,
        resolution: null,
        stage: "in_progress",
        title: "页面滚动位置异常",
        unread: true,
        updatedAt: "2026-08-07T09:05:00.000Z",
        updatedBy: "actor-1",
        version: 2,
      }],
      projects: [{
        createdAt: occurredAt,
        id: "project-1",
        name: "客户端",
        updatedAt: occurredAt,
      }],
      users: [
        { id: "reporter-1", name: "报告人", role: "member", status: "active" },
        { id: "actor-1", name: "处理人", role: "member", status: "active" },
        { id: "assignee-1", name: "当前处理人", role: "member", status: "active" },
        { id: "commenter-1", name: "评论人", role: "member", status: "active" },
        { id: "other-1", name: "无关成员", role: "member", status: "active" },
      ],
    };

    const commentReference = feedbackReferenceCardDataFromReadModel(readModel, {
      activityId: "activity-2",
      commentMessageId: "comment-1",
      feedbackId: "feedback-1",
    });
    assert.equal(commentReference?.feedback.id, "feedback-1");
    assert.equal(commentReference?.activity?.id, "activity-2");
    assert.equal(commentReference?.comment?.id, "comment-1");
    assert.equal(commentReference?.project?.name, "客户端");
    assert.deepEqual(commentReference?.users.map((user) => user.id).sort(), [
      "actor-1",
      "assignee-1",
      "commenter-1",
      "reporter-1",
    ]);

    const feedbackReference = feedbackReferenceCardDataFromReadModel(readModel, {
      activityId: "activity-1",
      feedbackId: "feedback-1",
    });
    assert.equal(feedbackReference?.activity?.id, "activity-1");
    assert.equal(feedbackReference?.comment, null);
    assert.equal(feedbackReference?.thread, null);
    assert.equal(feedbackReference?.feedback.reportAttachments.length, 1);

    assert.equal(feedbackReferenceCardDataFromReadModel(readModel, {
      commentMessageId: "missing-comment",
      feedbackId: "feedback-1",
    }), null);
    assert.equal(feedbackReferenceCardDataFromReadModel(readModel, {
      activityId: "activity-1",
      commentMessageId: "comment-1",
      feedbackId: "feedback-1",
    }), null);
    assert.equal(feedbackReferenceCardDataFromReadModel(readModel, {
      activityId: "missing-activity",
      feedbackId: "feedback-1",
    }), null);
  });

  it("maps feedback report attachments through the module-owned attachment contract", () => {
    assert.equal(feedbackReportAttachmentPreviewKind({ fileName: "report.md", mimeType: "text/plain" }), "markdown");
    assert.equal(feedbackReportAttachmentPreviewKind({ fileName: "screen.mp4", mimeType: "video/mp4" }), "video");
    assert.equal(feedbackReportAttachmentPreviewKind({ fileName: "legacy.mp4", mimeType: "application/octet-stream" }), "video");
    assert.equal(feedbackReportAttachmentPreviewKind({ fileName: "spoof.mp4", mimeType: "text/html" }), "download");
    assert.equal(feedbackReportAttachmentPreviewKind({ fileName: "raw.svg", mimeType: "text/plain" }), "download");
    assert.equal(canPreviewFeedbackReportAttachment({ fileName: "capture.png", mimeType: "image/png" }), true);

    assert.deepEqual(feedbackReportAttachmentDto({
      fileName: "capture.png",
      fileSize: 1234,
      height: 720,
      id: "ratt-1",
      mimeType: "image/png",
      width: 1280,
    }), {
      contentUrl: "/api/feedback/report-attachments/ratt-1/content",
      downloadUrl: "/api/feedback/report-attachments/ratt-1/content?disposition=attachment",
      fileName: "capture.png",
      fileSize: 1234,
      height: 720,
      id: "ratt-1",
      mimeType: "image/png",
      previewKind: "image",
      previewUrl: "/api/feedback/report-attachments/ratt-1/content?disposition=inline",
      width: 1280,
    });
  });
});
