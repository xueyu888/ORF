import {
  createWorkbenchLocation,
  emptyWorkbenchNavigationStack,
  normalizeWorkbenchNavigationSource,
  type WorkbenchLocation,
  type WorkbenchNavigationStack,
  type WorkbenchViewportPosition,
} from "./workbenchNavigationModel";

const stackStoragePrefix = "orf.workbench.navigation.stack.";
const lastLocationStoragePrefix = "orf.workbench.navigation.last.";
const memoryStacks = new Map<string, WorkbenchNavigationStack>();
const memoryLastLocations = new Map<string, WorkbenchLocation>();

function stackStorageKey(userId: string) {
  return `${stackStoragePrefix}${userId}`;
}

function lastLocationStorageKey(userId: string) {
  return `${lastLocationStoragePrefix}${userId}`;
}

export function readWorkbenchNavigationStack(userId: string | null | undefined) {
  if (!userId) return emptyWorkbenchNavigationStack();
  const memory = memoryStacks.get(userId);
  if (typeof window === "undefined") return memory ?? emptyWorkbenchNavigationStack();
  try {
    return normalizeWorkbenchNavigationStack(JSON.parse(window.sessionStorage.getItem(stackStorageKey(userId)) ?? "null"));
  } catch {
    return memory ?? emptyWorkbenchNavigationStack();
  }
}

export function writeWorkbenchNavigationStack(userId: string | null | undefined, stack: WorkbenchNavigationStack) {
  if (!userId) return;
  const normalized = normalizeWorkbenchNavigationStack(stack);
  memoryStacks.set(userId, normalized);
  if (normalized.current) writeLastWorkbenchLocation(userId, normalized.current);
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(stackStorageKey(userId), JSON.stringify(normalized));
  } catch {
    // Workbench navigation is local UI state; storage failures degrade to memory.
  }
}

export function readLastWorkbenchLocation(userId: string | null | undefined) {
  if (!userId) return null;
  const memory = memoryLastLocations.get(userId);
  if (typeof window === "undefined") return memory ?? null;
  try {
    return normalizeWorkbenchLocation(JSON.parse(window.localStorage.getItem(lastLocationStorageKey(userId)) ?? "null")) ?? memory ?? null;
  } catch {
    return memory ?? null;
  }
}

export function readLastWorkbenchLocationHref(userId: string | null | undefined) {
  return readLastWorkbenchLocation(userId)?.href ?? null;
}

export function writeLastWorkbenchLocation(userId: string | null | undefined, location: WorkbenchLocation) {
  if (!userId) return;
  const normalized = normalizeWorkbenchLocation(location);
  if (!normalized) return;
  memoryLastLocations.set(userId, normalized);
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(lastLocationStorageKey(userId), JSON.stringify(normalized));
  } catch {
    // Last location is optional local UI state; persistence must not block the app.
  }
}

export function clearWorkbenchNavigationMemory(userId?: string) {
  if (userId) {
    memoryStacks.delete(userId);
    memoryLastLocations.delete(userId);
    return;
  }
  memoryStacks.clear();
  memoryLastLocations.clear();
}

function normalizeWorkbenchNavigationStack(raw: unknown): WorkbenchNavigationStack {
  if (!raw || typeof raw !== "object") return emptyWorkbenchNavigationStack();
  const input = raw as Partial<WorkbenchNavigationStack>;
  const current = normalizeWorkbenchLocation(input.current);
  return {
    back: Array.isArray(input.back) ? input.back.map(normalizeWorkbenchLocation).filter((item): item is WorkbenchLocation => Boolean(item)) : [],
    current,
    forward: Array.isArray(input.forward) ? input.forward.map(normalizeWorkbenchLocation).filter((item): item is WorkbenchLocation => Boolean(item)) : [],
    version: 1,
  };
}

function normalizeWorkbenchLocation(raw: unknown): WorkbenchLocation | null {
  if (!raw || typeof raw !== "object") return null;
  const input = raw as Partial<WorkbenchLocation>;
  if (input.version !== 1 || typeof input.href !== "string") return null;
  const viewport = normalizeViewport(input.viewport);
  return createWorkbenchLocation({
    capturedAt: typeof input.capturedAt === "string" ? input.capturedAt : undefined,
    href: input.href,
    source: normalizeWorkbenchNavigationSource(input.source),
    title: typeof input.title === "string" ? input.title : undefined,
    viewport,
  });
}

function normalizeViewport(raw: unknown): WorkbenchViewportPosition | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const input = raw as Partial<WorkbenchViewportPosition>;
  if (input.containerId !== "window" || typeof input.scrollTop !== "number") return undefined;
  return {
    anchorId: typeof input.anchorId === "string" ? input.anchorId : undefined,
    containerId: "window" as const,
    offsetTop: typeof input.offsetTop === "number" ? Math.max(-1000, Math.min(1000, input.offsetTop)) : undefined,
    scrollTop: Math.max(0, Math.round(input.scrollTop)),
  };
}
