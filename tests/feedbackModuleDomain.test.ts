import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canPreviewFeedbackReportAttachment,
  feedbackReportAttachmentDto,
  feedbackReportAttachmentPreviewKind,
  feedbackTransitionInputSchema,
  planFeedbackAssigneeChangedNotification,
  planFeedbackCommentCreatedNotification,
  planFeedbackCreatedNotification,
  planFeedbackLifecycleChangedNotification,
} from "@orf/feedback-module/contracts";
import {
  applyFeedbackTransition,
  canonicalizeFeedbackRelation,
  deriveFeedbackCapabilities,
  feedbackActorFixture,
  feedbackEntityFixture,
  validateFeedbackLifecycle,
} from "@orf/feedback-module/testing";

const occurredAt = "2026-08-07T09:00:00.000Z";

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

    assert.deepEqual(plans.map((plan) => plan.kind), [
      "feedback.created",
      "feedback.lifecycle.changed",
      "feedback.assignee.changed",
      "feedback.comment.created",
    ]);
    for (const plan of plans) {
      assert.deepEqual(plan.recipientUserIds, recipients);
      assert.equal(plan.targetType, "feedback");
    }
    assert.deepEqual(plans[0]?.metadata, {
      assignee: "处理人",
      feedbackTitle: "页面滚动位置异常",
      projectId: "project-1",
      projectName: "客户端",
    });
    assert.equal(plans[3]?.targetHref, "/feedback/feedback-1?comment=comment-1");
  });

  it("maps feedback report attachments through the module-owned attachment contract", () => {
    assert.equal(feedbackReportAttachmentPreviewKind({ fileName: "report.md", mimeType: "text/plain" }), "markdown");
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
