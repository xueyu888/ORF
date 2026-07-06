import type { NotificationKind, NotificationTargetType } from "../../src/types/orf";

export const DATA_SYNC_NOTIFICATION_KIND: NotificationKind = "data.sync.conflict";
export const DATA_SYNC_NOTIFICATION_TARGET_TYPE: NotificationTargetType = "dataSync";
export const DATA_SYNC_DEFAULT_RECIPIENT_NAME = "薛雨";

export type DataSyncRecipientMembership = {
  email: string | null;
  name: string;
  teamId: string;
  userId: string;
};

export type DataSyncRecipientSelector = {
  email?: string;
  name?: string;
  teamId?: string;
  userId?: string;
};

export type DataSyncRecipientSelection = {
  email: string | null;
  name: string;
  teamId: string;
  userId: string;
};

export type DataSyncEventPayload = {
  body: string;
  eventType: string;
  fingerprint: string;
  payload: Record<string, unknown>;
  severity: string;
  title: string;
};

function clean(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function cleanEmail(value: string | null | undefined) {
  return clean(value).toLowerCase();
}

export function normalizeDataSyncRecipientSelector(input: DataSyncRecipientSelector): Required<DataSyncRecipientSelector> {
  return {
    email: cleanEmail(input.email),
    name: clean(input.name) || DATA_SYNC_DEFAULT_RECIPIENT_NAME,
    teamId: clean(input.teamId),
    userId: clean(input.userId),
  };
}

export function selectDataSyncRecipientMembership(
  memberships: readonly DataSyncRecipientMembership[],
  input: DataSyncRecipientSelector,
): DataSyncRecipientSelection {
  const selector = normalizeDataSyncRecipientSelector(input);
  const matches = memberships.filter((membership) => {
    if (selector.teamId && membership.teamId !== selector.teamId) return false;
    if (selector.userId && membership.userId !== selector.userId) return false;
    if (selector.email && cleanEmail(membership.email) !== selector.email) return false;
    if (selector.name && clean(membership.name) !== selector.name) return false;
    return true;
  });

  const identities = new Map(matches.map((membership) => [`${membership.teamId}:${membership.userId}`, membership]));
  if (identities.size !== 1) {
    throw new Error(
      [
        "data sync ORF notification recipient must resolve to exactly one active team member.",
        `matched=${identities.size}`,
        `requiredName=${selector.name || "-"}`,
        `requiredEmail=${selector.email || "-"}`,
        `requiredTeamId=${selector.teamId || "-"}`,
        `requiredUserId=${selector.userId || "-"}`,
      ].join(" "),
    );
  }

  const selected = Array.from(identities.values())[0];
  return {
    email: selected.email,
    name: selected.name,
    teamId: selected.teamId,
    userId: selected.userId,
  };
}

function eventStringField(raw: Record<string, unknown>, key: string) {
  const value = raw[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`data sync event file is missing string field: ${key}`);
  }
  return value.trim();
}

function eventPayloadField(raw: Record<string, unknown>) {
  const value = raw.payload;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

export function parseDataSyncEventPayload(raw: unknown): DataSyncEventPayload {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("data sync event file must contain a JSON object");
  }
  const record = raw as Record<string, unknown>;
  return {
    body: eventStringField(record, "body"),
    eventType: eventStringField(record, "event_type"),
    fingerprint: eventStringField(record, "fingerprint"),
    payload: eventPayloadField(record),
    severity: eventStringField(record, "severity"),
    title: eventStringField(record, "title"),
  };
}

export function dataSyncEventMetadata(event: DataSyncEventPayload): Record<string, string> {
  return {
    dataSyncEventType: event.eventType,
    dataSyncFingerprint: event.fingerprint,
    dataSyncPayloadJson: JSON.stringify(event.payload),
    dataSyncSeverity: event.severity,
    targetTitle: event.title,
  };
}
