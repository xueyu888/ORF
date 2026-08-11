const personalPreferencesChangedEvent = "orf:personal-preferences-changed";
const personalPreferencesRetryDelaysMs = [250, 750, 2_000] as const;

function waitForPreferenceRetry(delayMs: number, signal?: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timeout = globalThis.setTimeout(resolve, delayMs);
    signal?.addEventListener("abort", () => {
      globalThis.clearTimeout(timeout);
      resolve();
    }, { once: true });
  });
}

function isRetryablePreferenceReadError(error: unknown) {
  if (typeof error !== "object" || error === null || !("status" in error)) return true;
  const status = (error as { status?: unknown }).status;
  return typeof status !== "number" || status === 408 || status === 429 || status >= 500;
}

export async function readPersonalPreferencesWithRetry<T>(
  read: (attempt: number) => Promise<T>,
  signal?: AbortSignal,
  retryDelaysMs: readonly number[] = personalPreferencesRetryDelaysMs,
) {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
    if (signal?.aborted) throw lastError ?? new Error("personal preferences read cancelled");
    try {
      return await read(attempt);
    } catch (error) {
      lastError = error;
      const retryDelay = retryDelaysMs[attempt];
      if (retryDelay === undefined || !isRetryablePreferenceReadError(error)) break;
      await waitForPreferenceRetry(retryDelay, signal);
    }
  }
  throw lastError;
}

export function dispatchPersonalPreferencesChanged() {
  window.dispatchEvent(new Event(personalPreferencesChangedEvent));
}

export function subscribePersonalPreferencesChanged(listener: () => void) {
  window.addEventListener(personalPreferencesChangedEvent, listener);
  return () => window.removeEventListener(personalPreferencesChangedEvent, listener);
}
