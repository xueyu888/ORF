export type NativeNotificationPresentationStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

export type NativeNotificationPresentationReservation =
  | { key: string; status: "duplicate" | "reserved" }
  | { reason: "invalid_key" | "missing_key"; status: "not_tracked" };

type NativeNotificationPresentationClaim = {
  claimedAtMs: number;
  key: string;
};

const nativeNotificationPresentationStorageKey = "orf.nativeNotification.presentationClaims.v1";
const nativeNotificationPresentationClaimTtlMs = 24 * 60 * 60 * 1000;
const maxNativeNotificationPresentationClaims = 512;
const maxNativeNotificationPresentationKeyLength = 220;

const fallbackClaims = new Map<string, number>();

export function chatMessageNativeNotificationPresentationKey(messageId: string | null | undefined) {
  const id = cleanNativeNotificationPresentationPart(messageId);
  return id ? normalizeNativeNotificationPresentationKey(`chat.message.created:${id}`) : null;
}

export function nativeNotificationPresentationKey(input: {
  fallbackSeed?: string | null;
  kind?: string | null;
  messageId?: string | null;
}) {
  if (input.kind === "chat.message.created") {
    const chatKey = chatMessageNativeNotificationPresentationKey(input.messageId);
    if (chatKey) return chatKey;
  }
  const kind = cleanNativeNotificationPresentationPart(input.kind);
  const fallbackSeed = cleanNativeNotificationPresentationPart(input.fallbackSeed);
  return kind && fallbackSeed ? normalizeNativeNotificationPresentationKey(`native.${kind}:${fallbackSeed}`) : null;
}

export function reserveNativeNotificationPresentation(input: {
  key: string | null | undefined;
  nowMs?: number;
  storage?: NativeNotificationPresentationStorage | null;
}): NativeNotificationPresentationReservation {
  const key = normalizeNativeNotificationPresentationKey(input.key);
  if (input.key == null || String(input.key).trim() === "") {
    return { reason: "missing_key", status: "not_tracked" };
  }
  if (!key) {
    return { reason: "invalid_key", status: "not_tracked" };
  }

  const nowMs = validNowMs(input.nowMs);
  const store = resolveNativeNotificationPresentationStorage(input.storage);
  const claims = readNativeNotificationPresentationClaims(store, nowMs);
  if (claims.has(key)) {
    return { key, status: "duplicate" };
  }

  claims.set(key, nowMs);
  writeNativeNotificationPresentationClaims(store, claims, nowMs);
  return { key, status: "reserved" };
}

export function releaseNativeNotificationPresentation(input: {
  key: string | null | undefined;
  nowMs?: number;
  storage?: NativeNotificationPresentationStorage | null;
}) {
  const key = normalizeNativeNotificationPresentationKey(input.key);
  if (!key) return;
  const nowMs = validNowMs(input.nowMs);
  const store = resolveNativeNotificationPresentationStorage(input.storage);
  const claims = readNativeNotificationPresentationClaims(store, nowMs);
  if (!claims.delete(key)) return;
  writeNativeNotificationPresentationClaims(store, claims, nowMs);
}

function resolveNativeNotificationPresentationStorage(
  storage: NativeNotificationPresentationStorage | null | undefined,
) {
  if (storage !== undefined) return storage;
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function readNativeNotificationPresentationClaims(
  storage: NativeNotificationPresentationStorage | null,
  nowMs: number,
) {
  const claims = new Map<string, number>();
  for (const [key, claimedAtMs] of fallbackClaims) {
    if (isFreshNativeNotificationPresentationClaim(claimedAtMs, nowMs)) {
      claims.set(key, claimedAtMs);
    }
  }

  if (!storage) return trimNativeNotificationPresentationClaims(claims, nowMs);

  try {
    const raw = storage.getItem(nativeNotificationPresentationStorageKey);
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        const key = normalizeNativeNotificationPresentationKey((item as Partial<NativeNotificationPresentationClaim>)?.key);
        const claimedAtMs = Number((item as Partial<NativeNotificationPresentationClaim>)?.claimedAtMs);
        if (key && isFreshNativeNotificationPresentationClaim(claimedAtMs, nowMs)) {
          claims.set(key, claimedAtMs);
        }
      }
    }
  } catch {
    try {
      storage.removeItem(nativeNotificationPresentationStorageKey);
    } catch {
      // Storage is best effort. The in-memory fallback still protects the current session.
    }
  }

  return trimNativeNotificationPresentationClaims(claims, nowMs);
}

function writeNativeNotificationPresentationClaims(
  storage: NativeNotificationPresentationStorage | null,
  claims: Map<string, number>,
  nowMs: number,
) {
  const trimmed = trimNativeNotificationPresentationClaims(claims, nowMs);
  fallbackClaims.clear();
  for (const [key, claimedAtMs] of trimmed) {
    fallbackClaims.set(key, claimedAtMs);
  }

  if (!storage) return;

  const serialized: NativeNotificationPresentationClaim[] = Array.from(trimmed.entries()).map(
    ([key, claimedAtMs]) => ({ claimedAtMs, key }),
  );
  try {
    storage.setItem(nativeNotificationPresentationStorageKey, JSON.stringify(serialized));
  } catch {
    fallbackClaims.clear();
    for (const [key, claimedAtMs] of trimNativeNotificationPresentationClaims(trimmed, nowMs)) {
      fallbackClaims.set(key, claimedAtMs);
    }
  }
}

function trimNativeNotificationPresentationClaims(
  claims: Map<string, number>,
  nowMs = Date.now(),
) {
  return new Map(
    Array.from(claims.entries())
      .filter(([, claimedAtMs]) => isFreshNativeNotificationPresentationClaim(claimedAtMs, nowMs))
      .sort((left, right) => right[1] - left[1])
      .slice(0, maxNativeNotificationPresentationClaims),
  );
}

function isFreshNativeNotificationPresentationClaim(claimedAtMs: number, nowMs: number) {
  return Number.isFinite(claimedAtMs)
    && claimedAtMs > 0
    && nowMs - claimedAtMs <= nativeNotificationPresentationClaimTtlMs;
}

function normalizeNativeNotificationPresentationKey(value: unknown) {
  if (typeof value !== "string") return null;
  const key = value.trim();
  if (!key || key.length > maxNativeNotificationPresentationKeyLength) return null;
  return /^[\w:./~%?=&-]+$/.test(key) ? key : null;
}

function cleanNativeNotificationPresentationPart(value: string | null | undefined) {
  const text = typeof value === "string" ? value.trim() : "";
  return text && text.length <= 160 ? text : null;
}

function validNowMs(value: number | null | undefined) {
  return Number.isFinite(value) && Number(value) > 0 ? Number(value) : Date.now();
}
