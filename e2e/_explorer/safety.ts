import type { ExplorerConfig, UiEvent, UiOperation } from "./types";

export function readExplorerConfig(baseURLFromPlaywright?: string): ExplorerConfig {
  const baseURL = process.env.UI_EXPLORER_BASE_URL ?? baseURLFromPlaywright ?? "http://127.0.0.1:5173";
  const targetPath = process.env.UI_EXPLORER_TARGET_PATH ?? "/auth";
  const seed = process.env.UI_EXPLORER_SEED ?? String(Date.now());
  const targetUrl = new URL(targetPath, baseURL);
  return {
    targetPath,
    steps: readPositiveInteger("UI_EXPLORER_STEPS", 200),
    seed,
    reportDir: process.env.UI_EXPLORER_REPORT_DIR ?? ".artifacts/ui-explorer",
    maxNoChange: readPositiveInteger("UI_EXPLORER_MAX_NO_CHANGE", 30),
    baseURL,
    allowedOrigins: splitEnv("UI_EXPLORER_ALLOWED_ORIGINS", [targetUrl.origin]),
    allowedPathPatterns: splitEnv("UI_EXPLORER_ALLOWED_PATH_PATTERNS", [escapePattern(targetUrl.pathname)]),
    blockedPathPatterns: splitEnv("UI_EXPLORER_BLOCKED_PATH_PATTERNS", [
      "/payment",
      "/checkout",
      "/billing",
      "/delete",
    ]),
    blockedOperationKinds: splitEnv("UI_EXPLORER_BLOCKED_OPERATION_KINDS", []) as UiOperation[],
    maxStepDuration: readPositiveInteger("UI_EXPLORER_MAX_STEP_DURATION_MS", 1500),
    resetOnRouteEscape: process.env.UI_EXPLORER_RESET_ON_ROUTE_ESCAPE !== "0",
    stopOnRouteEscape: process.env.UI_EXPLORER_STOP_ON_ROUTE_ESCAPE === "1",
    stateMode: process.env.UI_EXPLORER_STATE_MODE === "coarse" ? "coarse" : "normal",
    epsilon: readFraction("UI_EXPLORER_EPSILON", 0.2),
  };
}

export function targetUrl(config: ExplorerConfig) {
  return new URL(config.targetPath, config.baseURL).toString();
}

export function isInAllowedScope(url: string, config: ExplorerConfig) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (!config.allowedOrigins.includes(parsed.origin)) {
    return false;
  }
  if (config.blockedPathPatterns.some((pattern) => matchesPathPattern(parsed.pathname, pattern))) {
    return false;
  }
  return config.allowedPathPatterns.some((pattern) => matchesPathPattern(parsed.pathname, pattern));
}

export function shouldRunEvent(event: UiEvent, config: ExplorerConfig) {
  return !config.blockedOperationKinds.includes(event.operation);
}

export function matchesPathPattern(pathname: string, pattern: string) {
  if (pattern.startsWith("/") && !pattern.includes("*")) {
    return pathname === pattern || pathname.startsWith(`${pattern}/`);
  }
  const regex = new RegExp(`^${pattern.split("*").map(escapeRegex).join(".*")}$`);
  return regex.test(pathname);
}

function readPositiveInteger(name: string, fallback: number) {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readFraction(name: string, fallback: number) {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : fallback;
}

function splitEnv(name: string, fallback: string[]) {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function escapePattern(pathname: string) {
  return pathname || "/";
}

function escapeRegex(value: string) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}
