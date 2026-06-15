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

type PresenceSession = {
  clientId: string;
  connectedAt: string;
  id: string;
  lastActiveAt: string;
  lastSeenAt: string;
  snapshot: PresenceClientSnapshot;
  teamId: string;
  userId: string;
};

export const PRESENCE_ACTIVE_IDLE_THRESHOLD_SECONDS = 10 * 60;
const PRESENCE_ACTIVE_IDLE_THRESHOLD_MS = PRESENCE_ACTIVE_IDLE_THRESHOLD_SECONDS * 1000;
const PRESENCE_RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;
const defaultPresenceSource: ClientPresenceSource = "unknown";

const sessionsById = new Map<string, PresenceSession>();
const sessionIdsByUser = new Map<string, Set<string>>();
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

function isActiveSession(session: PresenceSession, nowMs: number) {
  const idleSeconds = session.snapshot.systemIdleSeconds;
  const idleState = session.snapshot.systemIdleState;
  if (idleState === "locked") return false;
  if (typeof idleSeconds === "number" && Number.isFinite(idleSeconds)) {
    return idleSeconds < PRESENCE_ACTIVE_IDLE_THRESHOLD_SECONDS;
  }
  if (idleState === "active") return true;
  if (idleState === "idle") return false;

  if (session.snapshot.source === "desktop") {
    if (session.snapshot.windowVisible === false || session.snapshot.windowMinimized === true) return false;
    if (session.snapshot.windowFocused === false) return false;
  } else {
    if (session.snapshot.documentVisible === false || session.snapshot.documentFocused === false) return false;
  }

  return nowMs - parseIsoMs(session.lastActiveAt) < PRESENCE_ACTIVE_IDLE_THRESHOLD_MS;
}

function runtimeStateForUser(teamId: string, userId: string, nowMs = Date.now()): PresenceRuntimeState {
  const sessions = sessionsForUser(teamId, userId);
  if (sessions.length === 0) return "offline";
  return sessions.some((session) => isActiveSession(session, nowMs)) ? "active" : "idle";
}

function activityIsActive(input: UserPresenceActivityInput | undefined, nowMs: number) {
  if (!input) return true;
  const lastActiveAt = nowIso(activeAtFromActivity(input, nowMs));
  const snapshot = normalizeSnapshot(input);
  return isActiveSession({
    clientId: input.clientId ?? "activity",
    connectedAt: nowIso(nowMs),
    id: "activity",
    lastActiveAt,
    lastSeenAt: nowIso(nowMs),
    snapshot,
    teamId: "activity",
    userId: "activity",
  }, nowMs);
}

function rememberPublishedStateChange(teamId: string, userId: string, nowMs = Date.now()) {
  const key = userKey(teamId, userId);
  const nextState = runtimeStateForUser(teamId, userId, nowMs);
  const previousState = publishedStateByUser.get(key) ?? "offline";
  if (previousState === nextState) return false;
  if (nextState === "offline") {
    publishedStateByUser.delete(key);
  } else {
    publishedStateByUser.set(key, nextState);
  }
  return true;
}

export function connectRealtimePresence(input: {
  clientId?: string | null;
  sessionId: string;
  teamId: string;
  userId: string;
}) {
  const nowMs = Date.now();
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
  return rememberPublishedStateChange(session.teamId, session.userId, nowMs);
}

export function disconnectRealtimePresence(sessionId: string) {
  const session = sessionsById.get(sessionId);
  if (!session) return false;
  sessionsById.delete(sessionId);

  const key = userKey(session.teamId, session.userId);
  const sessionIds = sessionIdsByUser.get(key);
  sessionIds?.delete(sessionId);
  if (sessionIds?.size === 0) {
    sessionIdsByUser.delete(key);
  }

  return rememberPublishedStateChange(session.teamId, session.userId);
}

export function recordRealtimePresenceActivity(input: {
  activity?: UserPresenceActivityInput;
  clientId?: string | null;
  teamId: string;
  userId: string;
}) {
  const nowMs = Date.now();
  const clientId = sanitizeClientId(input.clientId ?? input.activity?.clientId, "");
  const sessions = sessionsForUser(input.teamId, input.userId)
    .filter((session) => !clientId || session.clientId === clientId);
  const snapshot = normalizeSnapshot(input.activity);
  const lastActiveAt = nowIso(activeAtFromActivity(input.activity, nowMs));
  const lastSeenAt = nowIso(nowMs);

  for (const session of sessions) {
    session.snapshot = snapshot;
    session.lastActiveAt = lastActiveAt;
    session.lastSeenAt = lastSeenAt;
  }

  return {
    active: sessions.some((session) => isActiveSession(session, nowMs)) || (sessions.length === 0 && activityIsActive(input.activity, nowMs)),
    changed: sessions.length > 0 ? rememberPublishedStateChange(input.teamId, input.userId, nowMs) : false,
  };
}

export function resolveRealtimeUserPresence(input: {
  lastOnlineAt?: Date | string | null;
  teamId: string;
  userId: string;
}): ChatUser["presence"] {
  const nowMs = Date.now();
  const sessions = sessionsForUser(input.teamId, input.userId);
  const connected = sessions.length > 0;
  const activeSessions = sessions.filter((session) => isActiveSession(session, nowMs));
  const runtimeState = activeSessions.length > 0 ? "active" : connected ? "idle" : "offline";
  const lastActiveMs = Math.max(
    parseIsoMs(input.lastOnlineAt instanceof Date ? input.lastOnlineAt.toISOString() : input.lastOnlineAt),
    ...sessions.map((session) => parseIsoMs(session.lastActiveAt)),
  );
  const recent = !connected && lastActiveMs > 0 && nowMs - lastActiveMs < PRESENCE_RECENT_WINDOW_MS;
  const state: ChatPresenceState = runtimeState === "offline" && recent ? "recent" : runtimeState;
  const active = state === "active";

  return {
    active,
    connected,
    lastActiveAt: lastActiveMs ? nowIso(lastActiveMs) : null,
    online: active,
    source: activeSessions[0]?.snapshot.source ?? sessions[0]?.snapshot.source ?? defaultPresenceSource,
    state,
  };
}
