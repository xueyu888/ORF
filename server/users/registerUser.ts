import { pool } from "../db/client";
import { flushNotificationChatDeliveriesForEvent } from "../messageSystem/notificationChatProjection";
import { publishRealtimeReadModelInvalidation } from "../realtime/realtimeEventBus";
import {
  enqueueNotificationEvent,
  getActiveAdminNotificationRecipients,
  publishCommittedNotificationEvent,
} from "../repositories/notificationRepository";
import { getDefaultRuntimeScope, runtimeScopeStorageId } from "../repositories/runtimeScope";

export type RegisteredUserInput = {
  id: string;
  name: string;
  email: string;
  oryIdentityId: string;
  lastOnlineAt: string | null;
};

/** Create the pending member and their review notification as one durable unit. */
export async function registerUser(input: RegisteredUserInput): Promise<void> {
  const scope = await getDefaultRuntimeScope();
  const teamId = scope ? runtimeScopeStorageId(scope) : null;
  const client = await pool.connect();
  let notificationEventId: string | null = null;
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO users (id, name, email, ory_identity_id, status, created_at, last_online_at)
       VALUES ($1, $2, $3, $4, 'pending', $5, $6)`,
      [input.id, input.name, input.email, input.oryIdentityId, new Date().toISOString().slice(0, 10), input.lastOnlineAt],
    );
    if (teamId) {
      await client.query("INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'member')", [teamId, input.id]);
      const recipientUserIds = await getActiveAdminNotificationRecipients(teamId, client);
      notificationEventId = await enqueueNotificationEvent(client, {
        actorName: input.name,
        actorUserId: input.id,
        body: `${input.name}（${input.email}）申请加入 ORF，请前往成员管理审核。`,
        kind: "registration.requested",
        recipientUserIds,
        recipientFacts: recipientUserIds.map((userId) => ({
          userId,
          deliveryClass: "direct",
          attentionLevel: "action_required",
          reasons: ["registration_reviewer"],
        })),
        sourceEventKey: `registration.requested:${input.id}`,
        stream: "personalNotification",
        targetHref: "/system/members",
        targetId: input.id,
        targetType: "user",
        teamId,
        title: "有新的注册申请",
      });
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  if (!teamId) return;
  publishRealtimeReadModelInvalidation(teamId, {
    actorUserId: input.id,
    models: ["users"],
    reason: "user.changed",
    target: { type: "user", id: input.id },
  });
  if (notificationEventId) {
    try {
      await publishCommittedNotificationEvent(teamId, notificationEventId);
      await flushNotificationChatDeliveriesForEvent(notificationEventId);
    } catch (error) {
      // The committed outbox is retried by the notification delivery scheduler.
      console.warn("Registration notification immediate delivery failed; persisted for retry", { notificationEventId, error });
    }
  }
}
