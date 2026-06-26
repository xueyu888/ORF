export const E2E_NOTIFICATION_ACTOR_NAME_MARKER = "E2E";
export const E2E_NOTIFICATION_ACTOR_NAME_SQL_PATTERN = `%${E2E_NOTIFICATION_ACTOR_NAME_MARKER}%`;

export const E2E_NOTIFICATION_VIEWER_EMAILS = [
  "tangyl@sdrising.com",
  "zrx831@gmail.com",
] as const;

export type NotificationParticipantIdentity = {
  email?: string | null;
  name?: string | null;
};

export type NotificationActorIdentity = {
  fallbackActorName?: string | null;
  userName?: string | null;
};

function normalizeEmail(email: string | null | undefined) {
  return email?.trim().toLowerCase() ?? "";
}

export function normalizedE2eNotificationViewerEmails() {
  return E2E_NOTIFICATION_VIEWER_EMAILS.map((email) => normalizeEmail(email));
}

export function isE2eNotificationActorName(name: string | null | undefined) {
  return (name ?? "").toUpperCase().includes(E2E_NOTIFICATION_ACTOR_NAME_MARKER);
}

export function notificationActorIsolationName(identity: NotificationActorIdentity) {
  return identity.userName?.trim() || identity.fallbackActorName?.trim() || "";
}

export function isE2eNotificationActor(identity: NotificationActorIdentity) {
  return isE2eNotificationActorName(notificationActorIsolationName(identity));
}

export function canReceiveE2eActorNotification(participant: NotificationParticipantIdentity) {
  return normalizedE2eNotificationViewerEmails().includes(normalizeEmail(participant.email))
    || isE2eNotificationActorName(participant.name);
}

export function shouldSuppressE2eActorNotificationForRecipient(input: {
  actorName?: string | null;
  recipient: NotificationParticipantIdentity;
}) {
  return isE2eNotificationActorName(input.actorName) && !canReceiveE2eActorNotification(input.recipient);
}

export function e2eNotificationRecipientVisibilitySql(input: {
  actorNamePatternParam: string;
  actorNameSql: string;
  recipientEmailSql: string;
  recipientNameSql: string;
  viewerEmailsParam: string;
}) {
  return `(
    ${input.actorNameSql} NOT ILIKE ${input.actorNamePatternParam}
    OR lower(coalesce(${input.recipientEmailSql}, '')) = ANY(${input.viewerEmailsParam}::text[])
    OR ${input.recipientNameSql} ILIKE ${input.actorNamePatternParam}
  )`;
}

export function visibleSystemNotificationMessageSql(input: {
  actorNamePatternParam: string;
  messageSql: string;
  recipientUserIdParam: string;
  viewerEmailsParam: string;
}) {
  return `NOT EXISTS (
    SELECT 1
    FROM notification_events isolated_event
    LEFT JOIN users isolated_actor ON isolated_actor.id = isolated_event.actor_user_id
    INNER JOIN users isolated_recipient ON isolated_recipient.id = ${input.recipientUserIdParam}::uuid
    WHERE ${input.messageSql}.source = 'system'
      AND isolated_event.id = ${input.messageSql}.system_metadata->>'notificationEventId'
      AND NOT ${e2eNotificationRecipientVisibilitySql({
        actorNamePatternParam: input.actorNamePatternParam,
        actorNameSql: "coalesce(isolated_actor.name, isolated_event.actor_name)",
        recipientEmailSql: "isolated_recipient.email",
        recipientNameSql: "isolated_recipient.name",
        viewerEmailsParam: input.viewerEmailsParam,
      })}
  )`;
}
