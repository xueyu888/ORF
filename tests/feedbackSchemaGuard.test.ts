import assert from "node:assert/strict";
import test from "node:test";
import {
  validateFeedbackDailyDigestRunSchema,
  validateFeedbackMetadataSubscriptionSchema,
  validateTeamFeedbackSchema,
} from "../server/db/schemaGuard";

test("feedback schema requires nullable project ownership and rejects old metric bindings", () => {
  assert.deepEqual(validateTeamFeedbackSchema({
    columns: [{ columnName: "project_id", isNullable: "YES" }],
    constraints: [],
  }), []);

  const errors = validateTeamFeedbackSchema({
    columns: [
      { columnName: "project_id", isNullable: "NO" },
      { columnName: "linked_objective_id", isNullable: "YES" },
    ],
    constraints: [],
  });
  assert.match(errors.join("\n"), /feedback\.project_id must be nullable/);
  assert.match(errors.join("\n"), /linked_objective_id must be dropped/);
});

test("feedback schema guard covers metadata activity and subscription tables", () => {
  assert.deepEqual(validateFeedbackMetadataSubscriptionSchema({
    columns: [
      column("feedback_activity_events", "id"),
      column("feedback_activity_events", "team_id"),
      column("feedback_activity_events", "feedback_id"),
      column("feedback_activity_events", "actor_user_id", "YES"),
      column("feedback_activity_events", "actor_name"),
      column("feedback_activity_events", "action"),
      column("feedback_activity_events", "metadata"),
      column("feedback_activity_events", "created_at"),
      column("feedback_subscriptions", "team_id"),
      column("feedback_subscriptions", "feedback_id"),
      column("feedback_subscriptions", "user_id"),
      column("feedback_subscriptions", "mode"),
      column("feedback_subscriptions", "created_at"),
      column("feedback_subscriptions", "updated_at"),
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
});

test("feedback daily digest schema guard keeps the per-assignee per-day idempotency key", () => {
  assert.deepEqual(validateFeedbackDailyDigestRunSchema({
    columns: [
      column("feedback_daily_digest_runs", "team_id"),
      column("feedback_daily_digest_runs", "assignee_user_id"),
      column("feedback_daily_digest_runs", "local_date"),
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
});

function column(tableName: string, columnName: string, isNullable: "YES" | "NO" = "NO") {
  return { columnName, isNullable, tableName };
}
