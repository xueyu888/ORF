export const workbenchNavigationSources = ["command", "deepLink", "notification", "route", "search", "user"] as const;

export type WorkbenchNavigationSource = (typeof workbenchNavigationSources)[number];

export type WorkbenchRouteKey =
  | "bounties"
  | "chat"
  | "feedback"
  | "reports"
  | "resources"
  | "settings"
  | "system"
  | "tasks"
  | "workLogs";

export type WorkbenchViewportPosition = {
  anchorId?: string;
  containerId: "window";
  offsetTop?: number;
  scrollTop: number;
};

export type WorkbenchLocation = {
  capturedAt: string;
  href: string;
  id: string;
  routeKey: WorkbenchRouteKey;
  source: WorkbenchNavigationSource;
  title?: string;
  version: 1;
  viewport?: WorkbenchViewportPosition;
};

export type WorkbenchNavigationStack = {
  back: WorkbenchLocation[];
  current: WorkbenchLocation | null;
  forward: WorkbenchLocation[];
  version: 1;
};

export type WorkbenchNavigationType = "POP" | "PUSH" | "REPLACE";

export const workbenchNavigationStackLimit = 80;

export function emptyWorkbenchNavigationStack(): WorkbenchNavigationStack {
  return { back: [], current: null, forward: [], version: 1 };
}

export function workbenchHrefFromLocation(location: { hash?: string; pathname: string; search?: string }) {
  return `${location.pathname}${location.search ?? ""}${location.hash ?? ""}`;
}

export function normalizeWorkbenchHref(input: string) {
  const trimmed = input.trim();
  if (!trimmed || !trimmed.startsWith("/")) return null;

  try {
    const url = new URL(trimmed, "http://orf.local");
    if (url.origin !== "http://orf.local") {
      return null;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function normalizeWorkbenchNavigationSource(source: unknown): WorkbenchNavigationSource | undefined {
  return typeof source === "string" && workbenchNavigationSources.includes(source as WorkbenchNavigationSource)
    ? source as WorkbenchNavigationSource
    : undefined;
}

export function workbenchRouteKeyFromHref(href: string): WorkbenchRouteKey | null {
  const normalized = normalizeWorkbenchHref(href);
  if (!normalized) return null;
  const pathname = normalized.split(/[?#]/, 1)[0] || "/";
  if (pathname === "/bounties" || pathname.startsWith("/bounties/")) return "bounties";
  if (pathname === "/chat" || pathname.startsWith("/chat/")) return "chat";
  if (pathname === "/feedback" || pathname.startsWith("/feedback/")) return "feedback";
  if (pathname === "/reports" || pathname.startsWith("/reports/")) return "reports";
  if (pathname === "/resources" || pathname.startsWith("/resources/")) return "resources";
  if (pathname === "/settings" || pathname.startsWith("/settings/")) return "settings";
  if (pathname === "/system" || pathname.startsWith("/system/")) return "system";
  if (pathname === "/tasks" || pathname.startsWith("/tasks/")) return "tasks";
  if (pathname === "/work-logs" || pathname.startsWith("/work-logs/")) return "workLogs";
  return null;
}

export function createWorkbenchLocation(input: {
  capturedAt?: string;
  href: string;
  source?: WorkbenchNavigationSource;
  title?: string;
  viewport?: WorkbenchViewportPosition;
}): WorkbenchLocation | null {
  const href = normalizeWorkbenchHref(input.href);
  if (!href) return null;
  const routeKey = workbenchRouteKeyFromHref(href);
  if (!routeKey) return null;
  const capturedAt = input.capturedAt ?? new Date().toISOString();
  return {
    capturedAt,
    href,
    id: `${capturedAt}:${href}`,
    routeKey,
    source: input.source ?? "route",
    title: input.title,
    version: 1,
    viewport: input.viewport,
  };
}

export function pushWorkbenchLocation(
  stack: WorkbenchNavigationStack,
  location: WorkbenchLocation,
  limit = workbenchNavigationStackLimit,
): WorkbenchNavigationStack {
  const current = stack.current;
  if (current && sameWorkbenchHref(current, location)) {
    return replaceWorkbenchLocation(stack, mergeWorkbenchLocation(current, location));
  }
  return {
    back: trimWorkbenchLocations(current ? [...stack.back, current] : stack.back, limit),
    current: location,
    forward: [],
    version: 1,
  };
}

export function replaceWorkbenchLocation(
  stack: WorkbenchNavigationStack,
  location: WorkbenchLocation,
): WorkbenchNavigationStack {
  return {
    back: stack.back,
    current: stack.current ? mergeWorkbenchLocation(stack.current, location) : location,
    forward: stack.forward,
    version: 1,
  };
}

export function updateCurrentWorkbenchViewport(
  stack: WorkbenchNavigationStack,
  viewport: WorkbenchViewportPosition,
): WorkbenchNavigationStack {
  if (!stack.current) return stack;
  return {
    ...stack,
    current: {
      ...stack.current,
      capturedAt: new Date().toISOString(),
      viewport,
    },
  };
}

export function goBackInWorkbenchStack(stack: WorkbenchNavigationStack): {
  stack: WorkbenchNavigationStack;
  target: WorkbenchLocation | null;
} {
  const target = stack.back.length > 0 ? stack.back[stack.back.length - 1] : null;
  if (!target) return { stack, target: null };
  return {
    stack: {
      back: stack.back.slice(0, -1),
      current: target,
      forward: stack.current ? [stack.current, ...stack.forward] : stack.forward,
      version: 1,
    },
    target,
  };
}

export function goForwardInWorkbenchStack(stack: WorkbenchNavigationStack): {
  stack: WorkbenchNavigationStack;
  target: WorkbenchLocation | null;
} {
  const target = stack.forward[0] ?? null;
  if (!target) return { stack, target: null };
  return {
    stack: {
      back: stack.current ? [...stack.back, stack.current] : stack.back,
      current: target,
      forward: stack.forward.slice(1),
      version: 1,
    },
    target,
  };
}

export function syncWorkbenchStackWithRouter(
  stack: WorkbenchNavigationStack,
  location: WorkbenchLocation,
  navigationType: WorkbenchNavigationType,
): WorkbenchNavigationStack {
  if (navigationType === "PUSH") return pushWorkbenchLocation(stack, location);
  if (navigationType === "REPLACE") return replaceWorkbenchLocation(stack, location);
  if (sameWorkbenchHref(stack.current, location)) return replaceWorkbenchLocation(stack, location);

  let backIndex = -1;
  for (let index = stack.back.length - 1; index >= 0; index -= 1) {
    if (stack.back[index].href === location.href) {
      backIndex = index;
      break;
    }
  }
  if (backIndex >= 0) {
    const target = stack.back[backIndex];
    return {
      back: stack.back.slice(0, backIndex),
      current: mergeWorkbenchLocation(target, location),
      forward: [
        ...(stack.current ? [stack.current] : []),
        ...stack.back.slice(backIndex + 1).reverse(),
        ...stack.forward,
      ],
      version: 1,
    };
  }

  const forwardIndex = stack.forward.findIndex((item) => item.href === location.href);
  if (forwardIndex >= 0) {
    const target = stack.forward[forwardIndex];
    return {
      back: [
        ...stack.back,
        ...(stack.current ? [stack.current] : []),
        ...stack.forward.slice(0, forwardIndex).reverse(),
      ],
      current: mergeWorkbenchLocation(target, location),
      forward: stack.forward.slice(forwardIndex + 1),
      version: 1,
    };
  }

  return replaceWorkbenchLocation(stack, location);
}

export function mergeWorkbenchLocation(
  previous: WorkbenchLocation,
  next: WorkbenchLocation,
): WorkbenchLocation {
  return {
    ...previous,
    ...next,
    viewport: next.viewport ?? previous.viewport,
  };
}

export function sameWorkbenchHref(left: WorkbenchLocation | null | undefined, right: WorkbenchLocation | null | undefined) {
  return Boolean(left && right && left.href === right.href);
}

function trimWorkbenchLocations(locations: WorkbenchLocation[], limit: number) {
  return locations.slice(Math.max(0, locations.length - Math.max(1, limit)));
}
