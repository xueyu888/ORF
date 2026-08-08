import type { FeedbackNotificationPort } from "@orf/feedback-module/server";
import { pool } from "../db/client";
import { publishNotificationEvent } from "../notifications/publisher";

export const feedbackNotificationPort: FeedbackNotificationPort = async (plan, context) => {
  const existing = await pool.query<{ id: string }>(
    `
      SELECT id
      FROM notification_events
      WHERE team_id = $1
        AND metadata ->> 'feedbackDispatchId' = $2
      ORDER BY created_at ASC, id ASC
      LIMIT 1
    `,
    [plan.teamId, context.dispatchId],
  );
  if (existing.rows[0]?.id) {
    return { notificationEventId: existing.rows[0].id };
  }

  const notifications = await publishNotificationEvent({
    ...plan,
    metadata: {
      ...plan.metadata,
      feedbackDispatchId: context.dispatchId,
      feedbackDispatchKey: context.idempotencyKey,
    },
  });
  return { notificationEventId: notifications[0]?.id ?? null };
};
