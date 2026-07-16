const realtimeClientIdStorageKey = "orf.realtime.clientId";

function randomClientId() {
  const random = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `orf-client-${random}`;
}

export function getRealtimeClientId() {
  if (typeof window === "undefined") {
    return randomClientId();
  }

  try {
    const stored = window.localStorage.getItem(realtimeClientIdStorageKey);
    if (stored) return stored;

    const legacySessionId = window.sessionStorage.getItem(realtimeClientIdStorageKey);
    if (legacySessionId) {
      window.localStorage.setItem(realtimeClientIdStorageKey, legacySessionId);
      window.sessionStorage.removeItem(realtimeClientIdStorageKey);
      return legacySessionId;
    }
  } catch {
    return randomClientId();
  }

  const next = randomClientId();
  try {
    window.localStorage.setItem(realtimeClientIdStorageKey, next);
  } catch {
    return next;
  }
  return next;
}
