import type {
  ChatPresenceState,
  ChatUser,
  ClientPresenceSource,
  ClientSystemIdleState,
  UserPresenceActivityInput,
} from "../../src/types/orf";

type PresenceRuntimeState = "active" | "idle" | "offline";

type PresenceClientSnapshot = {
  documentFocused?: boolean;
  documentVisible?: boolean;
  source: ClientPresenceSource;
  systemIdleSeconds?: number | null;
  systemIdleState?: ClientSystemIdleState;
  windowFocused?: boolean;
  windowMinimized?: boolean;
  windowVisible?: boolean;
};

type PresenceEvidence = {
  clientId: string;
  lastActiveAt: string;
  lastSeenAt: string;
  snapshot: PresenceClientSnapshot;
  teamId: string;
  userId: string;
};

type PresenceSession = PresenceEvidence & {
  connectedAt: string;
  id: string;
};

type PresenceActivityRecord = PresenceEvidence & {
  id: string;
};

export const PRESENCE_ACTIVE_IDLE_THRESHOLD_SECONDS = 10 * 60;
const PRESENCE_ACTIVE_IDLE_THRESHOLD_MS = PRESENCE_ACTIVE_IDLE_THRESHOLD_SECONDS * 1000;
export const PRESENCE_ACTIVITY_HEARTBEAT_WINDOW_MS = 2 * 60 * 1000;
const PRESENCE_RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;
const defaultPresenceSource: ClientPresenceSource = "unknown";

const sessionsById = new Map<string, PresenceSession>();
const sessionIdsByUser = new Map<string, Set<string>>();
const activityRecordsById = new Map<string, PresenceActivityRecord>();
const activityRecordIdsByUser = new Map<string, Set<string>>();
const publishedStateByUser = new Map<string, PresenceRuntimeState>();

function userKey(teamId: string, userId: string) {
  return `${teamId}:${userId}`;
}

function nowIso(nowMs = Date.now()) {
  return new Date(nowMs).toISOString();
}

function parseIsoMs(value: string | null | undefined) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sanitizeClientId(value: string | null | undefined, fallback: string) {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, 128) : fallback;
}

function activityRecordId(teamId: string, userId: string, clientId: string) {
  return `${userKey(teamId, userId)}:${clientId}`;
}

function normalizeSource(value: unknown): ClientPresenceSource {
  return value === "android" || value === "browser" || value === "desktop" ? value : defaultPresenceSource;
}

function activeAtFromActivity(input: UserPresenceActivityInput | undefined, nowMs: number) {
  const idleSeconds = typeof input?.systemIdleSeconds === "number" && Number.isFinite(input.systemIdleSeconds)
    ? Math.max(0, input.systemIdleSeconds)
    : null;
  if (idleSeconds !== null) {
    return nowMs - idleSeconds * 1000;
  }

  const interactionMs = parseIsoMs(input?.lastInteractionAt);
  if (interactionMs) return interactionMs;

  return nowMs;
}

function normalizeSnapshot(input: UserPresenceActivityInput | undefined): PresenceClientSnapshot {
  return {
    documentFocused: input?.documentFocused,
    documentVisible: input?.documentVisible,
    source: normalizeSource(input?.source),
    systemIdleSeconds: typeof input?.systemIdleSeconds === "number" && Number.isFinite(input.systemIdleSeconds)
      ? Math.max(0, input.systemIdleSeconds)
      : null,
    systemIdleState: input?.systemIdleState,
    windowFocused: input?.windowFocused,
    windowMinimized: input?.windowMinimized,
    windowVisible: input?.windowVisible,
  };
}

function sessionIdsForUser(teamId: string, userId: string) {
  return sessionIdsByUser.get(userKey(teamId, userId)) ?? new Set<string>();
}

function sessionsForUser(teamId: string, userId: string) {
  return Array.from(sessionIdsForUser(teamId, userId))
    .map((sessionId) => sessionsById.get(sessionId))
    .filter((session): session is PresenceSession => Boolean(session));
}

function activityRecordIdsForUser(teamId: string, userId: string) {
  return activityRecordIdsByUser.get(userKey(teamId, userId)) ?? new Set<string>();
}

function forgetActivityRecord(record: PresenceActivityRecord) {
  activityRecordsById.delete(record.id);

  const key = userKey(record.teamId, record.userId);
  const activityRecordIds = activityRecordIdsByUser.get(key);
  activityRecordIds?.delete(record.id);
  if (activityRecordIds?.size === 0) {
    activityRecordIdsByUser.delete(key);
  }
}

function activityRecordsForUser(teamId: string, userId: string, nowMs: number) {
  const records: PresenceActivityRecord[] = [];
  for (const recordId of activityRecordIdsForUser(teamId, userId)) {
    const record = activityRecordsById.get(recordId);
    if (!record) continue;
    if (nowMs - parseIsoMs(record.lastSeenAt) > PRESENCE_ACTIVITY_HEARTBEAT_WINDOW_MS) {
      forgetActivityRecord(record);
      continue;
    }
    records.push(record);
  }
  return records;
}

function rememberActivityRecord(input: {
  clientId: string;
  lastActiveAt: string;
  lastSeenAt: string;
  snapshot: PresenceClientSnapshot;
  teamId: string;
  userId: string;
}) {
  const id = activityRecordId(input.teamId, input.userId, input.clientId);
  const record: PresenceActivityRecord = { ...input, id };
  activityRecordsById.set(record.id, record);

  const key = userKey(record.teamId, record.userId);
  const activityRecordIds = activityRecordIdsByUser.get(key) ?? new Set<string>();
  activityRecordIds.add(record.id);
  activityRecordIdsByUser.set(key, activityRecordIds);
  return record;
}

function presenceEvidenceForUser(teamId: string, userId: string, nowMs: number) {
  return [
    ...activityRecordsForUser(teamId, userId, nowMs),
    ...sessionsForUser(teamId, userId),
  ];
}

function isActivePresenceEvidence(evidence: PresenceEvidence, nowMs: number) {
  const idleSeconds = evidence.snapshot.systemIdleSeconds;
  const idleState = evidence.snapshot.systemIdleState;
  if (idleState === "locked") return false;
  if (typeof idleSeconds === "number" && Number.isFinite(idleSeconds)) {
    return idleSeconds < PRESENCE_ACTIVE_IDLE_THRESHOLD_SECONDS;
  }
  if (idleState === "active") return true;
  if (idleState === "idle") return false;

  if (evidence.snapshot.source === "desktop") {
    if (evidence.snapshot.windowVisible === false || evidence.snapshot.windowMinimized === true) return false;
    if (evidence.snapshot.windowFocused === false) return false;
  } else {
    if (evidence.snapshot.documentVisible === false || evidence.snapshot.documentFocused === false) return false;
  }

  return nowMs - parseIsoMs(evidence.lastActiveAt) < PRESENCE_ACTIVE_IDLE_THRESHOLD_MS;
}

function runtimeStateForUser(teamId: string, userId: string, nowMs = Date.now()): PresenceRuntimeState {
  const evidence = presenceEvidenceForUser(teamId, userId, nowMs);
  if (evidence.length === 0) return "offline";
  return evidence.some((item) => isActivePresenceEvidence(item, nowMs)) ? "active" : "idle";
}

function storePublishedState(teamId: string, userId: string, state: PresenceRuntimeState) {
  const key = userKey(teamId, userId);
  if (state === "offline") {
    publishedStateByUser.delete(key);
  } else {
    publishedStateByUser.set(key, state);
  }
}

function rememberPublishedStateTransition(teamId: string, userId: string, previousState: PresenceRuntimeState, nextState: PresenceRuntimeState) {
  storePublishedState(teamId, userId, nextState);
  return previousState !== nextState;
}

export function connectRealtimePresence(input: {
  clientId?: string | null;
  sessionId: string;
  teamId: string;
  userId: string;
}) {
  const nowMs = Date.now();
  const previousState = runtimeStateForUser(input.teamId, input.userId, nowMs);
  const session: PresenceSession = {
    clientId: sanitizeClientId(input.clientId, input.sessionId),
    connectedAt: nowIso(nowMs),
    id: input.sessionId,
    lastActiveAt: nowIso(nowMs),
    lastSeenAt: nowIso(nowMs),
    snapshot: {
      source: defaultPresenceSource,
      systemIdleSeconds: null,
      systemIdleState: "unknown",
    },
    teamId: input.teamId,
    userId: input.userId,
  };

  sessionsById.set(session.id, session);
  const key = userKey(session.teamId, session.userId);
  const sessionIds = sessionIdsByUser.get(key) ?? new Set<string>();
  sessionIds.add(session.id);
  sessionIdsByUser.set(key, sessionIds);
  const nextState = runtimeStateForUser(session.teamId, session.userId, nowMs);
  return rememberPublishedStateTransition(session.teamId, session.userId, previousState, nextState);
}

export function disconnectRealtimePresence(sessionId: string) {
  const session = sessionsById.get(sessionId);
  if (!session) return false;
  const nowMs = Date.now();
  const previousState = runtimeStateForUser(session.teamId, session.userId, nowMs);
  sessionsById.delete(sessionId);

  const key = userKey(session.teamId, session.userId);
  const sessionIds = sessionIdsByUser.get(key);
  sessionIds?.delete(sessionId);
  if (sessionIds?.size === 0) {
    sessionIdsByUser.delete(key);
  }

  const nextState = runtimeStateForUser(session.teamId, session.userId, nowMs);
  return rememberPublishedStateTransition(session.teamId, session.userId, previousState, nextState);
}

export function recordRealtimePresenceActivity(input: {
  activity?: UserPresenceActivityInput;
  clientId?: string | null;
  teamId: string;
  userId: string;
}) {
  const nowMs = Date.now();
  const previousState = runtimeStateForUser(input.teamId, input.userId, nowMs);
  const sessionClientId = sanitizeClientId(input.clientId ?? input.activity?.clientId, "");
  const activityClientId = sanitizeClientId(input.clientId ?? input.activity?.clientId, "activity");
  const sessions = sessionsForUser(input.teamId, input.userId)
    .filter((session) => !sessionClientId || session.clientId === sessionClientId);
  const snapshot = normalizeSnapshot(input.activity);
  const lastActiveAt = nowIso(activeAtFromActivity(input.activity, nowMs));
  const lastSeenAt = nowIso(nowMs);

  for (const session of sessions) {
    session.snapshot = snapshot;
    session.lastActiveAt = lastActiveAt;
    session.lastSeenAt = lastSeenAt;
  }
  rememberActivityRecord({
    clientId: activityClientId,
    lastActiveAt,
    lastSeenAt,
    snapshot,
    teamId: input.teamId,
    userId: input.userId,
  });
  const nextState = runtimeStateForUser(input.teamId, input.userId, nowMs);

  return {
    active: nextState === "active",
    changed: rememberPublishedStateTransition(input.teamId, input.userId, previousState, nextState),
  };
}

export function resolveRealtimeUserPresence(input: {
  lastOnlineAt?: Date | string | null;
  teamId: string;
  userId: string;
}): ChatUser["presence"] {
  const nowMs = Date.now();
  const sessions = sessionsForUser(input.teamId, input.userId);
  const activityRecords = activityRecordsForUser(input.teamId, input.userId, nowMs);
  const evidence = [...activityRecords, ...sessions];
  const connected = evidence.length > 0;
  const activeEvidence = evidence.filter((item) => isActivePresenceEvidence(item, nowMs));
  const runtimeState = activeEvidence.length > 0 ? "active" : connected ? "idle" : "offline";
  const lastActiveMs = Math.max(
    parseIsoMs(input.lastOnlineAt instanceof Date ? input.lastOnlineAt.toISOString() : input.lastOnlineAt),
    ...evidence.map((item) => parseIsoMs(item.lastActiveAt)),
  );
  const recent = !connected && lastActiveMs > 0 && nowMs - lastActiveMs < PRESENCE_RECENT_WINDOW_MS;
  const state: ChatPresenceState = runtimeState === "offline" && recent ? "recent" : runtimeState;
  const active = state === "active";

  return {
    active,
    connected,
    lastActiveAt: lastActiveMs ? nowIso(lastActiveMs) : null,
    online: active,
    source: activeEvidence[0]?.snapshot.source ?? evidence[0]?.snapshot.source ?? defaultPresenceSource,
    state,
  };
}
