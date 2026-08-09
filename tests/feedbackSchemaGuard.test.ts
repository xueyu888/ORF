import assert from "node:assert/strict";
import test from "node:test";
import {
  validateFeedbackDailyDigestRunSchema,
  validateFeedbackLifecycleEnums,
  validateFeedbackMetadataSubscriptionSchema,
  validateTeamFeedbackSchema,
} from "../server/db/schemaGuard";

test("feedback schema requires nullable project ownership and rejects old metric bindings", () => {
  assert.deepEqual(validateTeamFeedbackSchema({
    columns: [
      rootColumn("id"),
      rootColumn("team_id"),
      rootColumn("project_id", "YES"),
      rootColumn("title"),
      rootColumn("description"),
      rootColumn("stage"),
      rootColumn("resolution", "YES"),
      rootColumn("impact"),
      rootColumn("priority", "YES"),
      rootColumn("assignee_user_id", "YES"),
      rootColumn("created_by"),
      rootColumn("updated_by", "YES"),
      rootColumn("version"),
      rootColumn("created_at"),
      rootColumn("updated_at"),
      rootColumn("closed_at", "YES"),
      rootColumn("closed_by_user_id", "YES"),
    ],
    constraints: [],
  }), []);

  const errors = validateTeamFeedbackSchema({
    columns: [
      rootColumn("project_id", "NO"),
      rootColumn("linked_objective_id", "YES"),
      rootColumn("phenomenon"),
    ],
    constraints: [],
  });
  assert.match(errors.join("\n"), /feedback\.project_id must be nullable/);
  assert.match(errors.join("\n"), /linked_objective_id must be dropped/);
  assert.match(errors.join("\n"), /phenomenon must be dropped/);
});

test("feedback schema guard covers metadata activity and subscription tables", () => {
  assert.deepEqual(validateFeedbackMetadataSubscriptionSchema({
    columns: [
      column("feedback_activity_events", "id"),
      column("feedback_activity_events", "team_id"),
      column("feedback_activity_events", "feedback_id"),
      column("feedback_activity_events", "actor_user_id", "YES"),
      column("feedback_activity_events", "activity_type"),
      column("feedback_activity_events", "payload"),
      column("feedback_activity_events", "sequence"),
      column("feedback_activity_events", "created_at"),
      column("feedback_subscriptions", "team_id"),
      column("feedback_subscriptions", "feedback_id"),
      column("feedback_subscriptions", "user_id"),
      column("feedback_subscriptions", "mode"),
      column("feedback_subscriptions", "created_at"),
      column("feedback_subscriptions", "updated_at"),
      column("feedback_report_attachments", "id"),
      column("feedback_report_attachments", "team_id"),
      column("feedback_report_attachments", "feedback_id"),
      column("feedback_report_attachments", "object_key"),
      column("feedback_report_attachments", "file_name"),
      column("feedback_report_attachments", "mime_type"),
      column("feedback_report_attachments", "file_size"),
      column("feedback_report_attachments", "width", "YES"),
      column("feedback_report_attachments", "height", "YES"),
      column("feedback_report_attachments", "sort_order"),
      column("feedback_report_attachments", "created_by", "YES"),
      column("feedback_report_attachments", "created_at"),
      column("feedback_report_attachments", "source_comment_attachment_id", "YES"),
      column("feedback_cause_categories", "feedback_id"),
      column("feedback_relations", "id"),
      column("feedback_user_views", "feedback_id"),
      column("feedback_participants", "feedback_id"),
      column("feedback_event_dispatches", "id"),
      column("feedback_event_dispatch_recipients", "dispatch_id"),
      column("feedback_import_batches", "id"),
      column("feedback_import_origins", "feedback_id"),
    ],
  }), []);

  const errors = validateFeedbackMetadataSubscriptionSchema({
    columns: [
      column("feedback_activity_events", "id"),
      column("feedback_subscriptions", "team_id"),
    ],
  });
  assert.match(errors.join("\n"), /feedback_activity_events\.feedback_id/);
  assert.match(errors.join("\n"), /feedback_subscriptions\.mode/);
  assert.match(errors.join("\n"), /feedback_report_attachments\.object_key/);
});

test("feedback lifecycle enum guard rejects old status enum and validates module enums", () => {
  assert.deepEqual(validateFeedbackLifecycleEnums({
    feedback_activity_type: { labels: ["feedback.created", "feedback.metadata.changed", "feedback.assignee.changed", "feedback.lifecycle.changed", "feedback.relation.added", "feedback.relation.removed", "feedback.comment.created", "feedback.comment.edited", "feedback.report.changed", "feedback.imported"] },
    feedback_impact: { labels: ["low", "medium", "high", "critical"] },
    feedback_priority: { labels: ["p0", "p1", "p2", "p3"] },
    feedback_relation_type: { labels: ["related", "duplicates", "blocks"] },
    feedback_resolution: { labels: ["resolved", "not_needed", "cannot_resolve", "duplicate", "unspecified"] },
    feedback_stage: { labels: ["open", "in_progress", "pending_verification", "closed"] },
  }), []);

  const errors = validateFeedbackLifecycleEnums({
    feedback_activity_type: { labels: [] },
    feedback_impact: { labels: ["Low", "High"] },
    feedback_priority: { labels: ["p0", "p1", "p2", "p3"] },
    feedback_relation_type: { labels: ["related", "duplicates", "blocks"] },
    feedback_resolution: { labels: ["resolved", "not_needed", "cannot_resolve", "duplicate", "unspecified"] },
    feedback_stage: { labels: ["open", "closed"] },
    feedback_status: { labels: ["Open", "Closed"] },
  });
  assert.match(errors.join("\n"), /feedback_impact enum/);
  assert.match(errors.join("\n"), /feedback_stage enum/);
  assert.match(errors.join("\n"), /feedback_status enum must be dropped/);
});

test("feedback daily digest schema guard keeps the per-assignee per-day idempotency key", () => {
  assert.deepEqual(validateFeedbackDailyDigestRunSchema({
    columns: [
      column("feedback_daily_digest_runs", "team_id"),
      column("feedback_daily_digest_runs", "assignee_user_id"),
      column("feedback_daily_digest_runs", "local_date", "NO", "date"),
      column("feedback_daily_digest_runs", "status"),
      column("feedback_daily_digest_runs", "feedback_count"),
      column("feedback_daily_digest_runs", "notification_event_id", "YES"),
      column("feedback_daily_digest_runs", "last_error", "YES"),
      column("feedback_daily_digest_runs", "attempts"),
      column("feedback_daily_digest_runs", "created_at"),
      column("feedback_daily_digest_runs", "updated_at"),
    ],
    constraints: [
      {
        constraintName: "feedback_daily_digest_runs_pk",
        definition: "PRIMARY KEY (team_id, assignee_user_id, local_date)",
      },
      {
        constraintName: "feedback_daily_digest_runs_status_check",
        definition: "CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text])))",
      },
      {
        constraintName: "feedback_daily_digest_runs_attempts_check",
        definition: "CHECK ((attempts >= 0))",
      },
      {
        constraintName: "feedback_daily_digest_runs_feedback_count_check",
        definition: "CHECK ((feedback_count >= 0))",
      },
    ],
  }), []);

  const errors = validateFeedbackDailyDigestRunSchema({
    columns: [
      column("feedback_daily_digest_runs", "team_id"),
      column("feedback_daily_digest_runs", "assignee_user_id"),
      column("feedback_daily_digest_runs", "local_date"),
      column("feedback_daily_digest_runs", "status"),
      column("feedback_daily_digest_runs", "feedback_count"),
      column("feedback_daily_digest_runs", "attempts"),
      column("feedback_daily_digest_runs", "created_at"),
      column("feedback_daily_digest_runs", "updated_at"),
    ],
    constraints: [
      {
        constraintName: "feedback_daily_digest_runs_pk",
        definition: "PRIMARY KEY (team_id, local_date)",
      },
    ],
  });
  assert.match(errors.join("\n"), /notification_event_id/);
  assert.match(errors.join("\n"), /last_error/);
  assert.match(errors.join("\n"), /primary key must include assignee_user_id/);
  assert.match(errors.join("\n"), /status pending is missing/);
  assert.match(errors.join("\n"), /attempts must have a non-negative check constraint/);
  assert.match(errors.join("\n"), /feedback_count must have a non-negative check constraint/);
});

function column(
  tableName: string,
  columnName: string,
  isNullable: "YES" | "NO" = "NO",
  dataType?: string,
) {
  return { columnName, dataType, isNullable, tableName };
}

function rootColumn(columnName: string, isNullable: "YES" | "NO" = "NO") {
  return { columnName, isNullable };
}
