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

  const stored = window.sessionStorage.getItem(realtimeClientIdStorageKey);
  if (stored) return stored;

  const next = randomClientId();
  window.sessionStorage.setItem(realtimeClientIdStorageKey, next);
  return next;
}
