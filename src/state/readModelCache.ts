type ReadModelEntry = {
  request: Promise<unknown> | null;
  updatedAt: number;
  value: unknown;
};

const entries = new Map<string, ReadModelEntry>();
const queuedForceRequests = new Map<string, Promise<unknown>>();
let cacheGeneration = 0;

export type ReadModelLoadOptions = {
  force?: boolean;
  maxAgeMs?: number;
};

export function readModelSnapshot<T>(key: string): T | undefined {
  return entries.get(key)?.value as T | undefined;
}

export function setReadModelSnapshot<T>(key: string, value: T) {
  entries.set(key, { request: null, updatedAt: Date.now(), value });
  return value;
}

export function invalidateReadModel(key: string) {
  const entry = entries.get(key);
  if (entry) entry.updatedAt = 0;
}

export function invalidateReadModelPrefix(prefix: string) {
  for (const [key, entry] of entries) {
    if (key.startsWith(prefix)) entry.updatedAt = 0;
  }
}

export function clearReadModelCache() {
  cacheGeneration += 1;
  entries.clear();
  queuedForceRequests.clear();
}

export function readModelCacheGeneration() {
  return cacheGeneration;
}

export function loadReadModel<T>(
  key: string,
  loader: () => Promise<T>,
  options: ReadModelLoadOptions = {},
): Promise<T> {
  const maxAgeMs = options.maxAgeMs ?? 30_000;
  const existing = entries.get(key);
  if (!options.force && existing && Date.now() - existing.updatedAt <= maxAgeMs) {
    return Promise.resolve(existing.value as T);
  }
  if (existing?.request) {
    if (!options.force) return existing.request as Promise<T>;
    const queued = queuedForceRequests.get(key) as Promise<T> | undefined;
    if (queued) return queued;
    const queuedGeneration = cacheGeneration;
    let forcedRequest!: Promise<T>;
    const startForcedRequest = (): Promise<T> => {
      if (queuedForceRequests.get(key) === forcedRequest) queuedForceRequests.delete(key);
      return loadReadModel(key, loader, { ...options, force: true });
    };
    forcedRequest = (existing.request as Promise<T>).then(
      (value) => queuedGeneration === cacheGeneration
        ? startForcedRequest()
        : value,
      (error) => queuedGeneration === cacheGeneration
        ? startForcedRequest()
        : Promise.reject(error),
    ).finally(() => {
      if (queuedForceRequests.get(key) === forcedRequest) queuedForceRequests.delete(key);
    });
    queuedForceRequests.set(key, forcedRequest);
    return forcedRequest;
  }

  const requestGeneration = cacheGeneration;
  const request = loader()
    .then((value) => {
      if (requestGeneration === cacheGeneration && entries.get(key)?.request === request) {
        setReadModelSnapshot(key, value);
      }
      return value;
    })
    .finally(() => {
      const current = entries.get(key);
      if (current?.request === request) current.request = null;
    });
  entries.set(key, {
    request,
    updatedAt: existing?.updatedAt ?? 0,
    value: existing?.value,
  });
  return request;
}
