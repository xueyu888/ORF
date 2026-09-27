import type { NotificationEventInput } from "../repositories/notificationRepository";
import { resolveWorkLogAccess } from "../workLogs/workLogAccess";
import { audienceVisibleSql, workLogAudienceSql } from "../access/resourceAudience";

/** Event metadata preserves the audience even after the source log is deleted. */
export function notificationResourceVisibleSql(eventSql: string, viewerIdSql: string) {
  const authorId = `COALESCE(
    CASE WHEN ${eventSql}.target_type = 'workLog' THEN ${eventSql}.metadata->>'authorUserId' END,
    (SELECT wl.author_user_id::text FROM work_log_entries wl
      WHERE wl.team_id = ${eventSql}.team_id AND wl.id = CASE
        WHEN ${eventSql}.target_type = 'workLog' THEN ${eventSql}.target_id
        WHEN ${eventSql}.metadata->>'targetType' = 'workLog' THEN ${eventSql}.metadata->>'targetId'
      END)
  )`;
  return audienceVisibleSql(`COALESCE(${eventSql}.metadata->>'audienceId', ${workLogAudienceSql(authorId)})`, viewerIdSql);
}

/** Restrict recipients before receipts, delivery outbox or realtime projection exist. */
export async function restrictNotificationAudience(input: NotificationEventInput): Promise<NotificationEventInput | null> {
  const workLogId = input.targetType === "workLog" ? input.targetId
    : input.metadata?.targetType === "workLog" ? input.metadata.targetId : null;
  if (!workLogId || input.kind === "worklog.reminder") return input;
  const access = await resolveWorkLogAccess(input.teamId, workLogId, input.actorUserId ?? "");
  if (!access) return null;
  if (!access.audience) return input;
  const readers = access.audience.readerUserIds;
  return {
    ...input,
    stream: "personalNotification",
    metadata: { ...input.metadata, audienceId: access.audience.id },
    recipientUserIds: input.recipientUserIds.filter((id) => readers.includes(id)),
    recipientFacts: input.recipientFacts?.filter((recipient) => readers.includes(recipient.userId)),
  };
}
