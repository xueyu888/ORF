import type { ExplorerConfig, ExplorerTestKind, UiEvent, UiOperation } from "./types";
import { resolveExplorerSafetyProfile } from "./safetyBoundaryConfig";

export function readExplorerConfig(baseURLFromPlaywright?: string): ExplorerConfig {
  const baseURL = process.env.UI_EXPLORER_BASE_URL ?? baseURLFromPlaywright ?? "http://127.0.0.1:5173";
  const safety = resolveExplorerSafetyProfile(process.env.UI_EXPLORER_SAFETY_PROFILE, process.env.UI_EXPLORER_TARGET_PATH);
  const targetPath = process.env.UI_EXPLORER_TARGET_PATH ?? safety.profile.targetPath;
  const seed = process.env.UI_EXPLORER_SEED ?? String(Date.now());
  const targetUrl = new URL(targetPath, baseURL);
  const testKind = readTestKind();
  return {
    testKind,
    safetyProfile: safety.name,
    targetPath,
    steps: readPositiveInteger("UI_EXPLORER_STEPS", 1000),
    maxDurationMs: readNonNegativeInteger("UI_EXPLORER_MAX_DURATION_MS", 0),
    seed,
    reportDir: process.env.UI_EXPLORER_REPORT_DIR ?? ".artifacts/ui-explorer",
    maxNoChange: readPositiveInteger("UI_EXPLORER_MAX_NO_CHANGE", 30),
    baseURL,
    allowedOrigins: splitEnv("UI_EXPLORER_ALLOWED_ORIGINS", [targetUrl.origin]),
    allowedPathPatterns: splitEnv("UI_EXPLORER_ALLOWED_PATH_PATTERNS", safety.profile.allowedPathPatterns),
    blockedPathPatterns: splitEnv("UI_EXPLORER_BLOCKED_PATH_PATTERNS", safety.profile.blockedPathPatterns),
    blockedOperationKinds: splitEnv("UI_EXPLORER_BLOCKED_OPERATION_KINDS", safety.profile.blockedOperationKinds) as UiOperation[],
    blockedTargetTextPatterns: splitEnv("UI_EXPLORER_BLOCKED_TARGET_TEXT_PATTERNS", safety.profile.blockedTargetTextPatterns),
    maxStepDuration: readPositiveInteger("UI_EXPLORER_MAX_STEP_DURATION_MS", 1500),
    resetOnRouteEscape: process.env.UI_EXPLORER_RESET_ON_ROUTE_ESCAPE !== "0",
    stopOnRouteEscape: process.env.UI_EXPLORER_STOP_ON_ROUTE_ESCAPE === "1",
    stateAbstractor: process.env.UI_EXPLORER_STATE_ABSTRACTOR ?? defaultStateAbstractor(testKind),
    epsilon: readFraction("UI_EXPLORER_EPSILON", 0.2),
    runRepeatableRegionTests: process.env.UI_EXPLORER_REPEATABLE_REGION_TESTS !== "0",
    repeatableRegionMaxObjects: readPositiveInteger("UI_EXPLORER_REPEATABLE_REGION_MAX_OBJECTS", 12),
    repeatableRegionStepsPerObject: readPositiveInteger("UI_EXPLORER_REPEATABLE_REGION_STEPS", 8),
    screenshotDir:
      process.env.UI_EXPLORER_SCREENSHOT_DIR ??
      `${process.env.UI_EXPLORER_REPORT_DIR ?? ".artifacts/ui-explorer"}/.tmp-screenshots/${safeFilePart(seed)}-${Date.now()}`,
    stateScreenshotLimit: readNonNegativeInteger("UI_EXPLORER_STATE_SCREENSHOT_LIMIT", 200),
    issueScreenshotLimit: readNonNegativeInteger("UI_EXPLORER_ISSUE_SCREENSHOT_LIMIT", 80),
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
  if (config.blockedOperationKinds.includes(event.operation)) {
    return false;
  }
  if (!event.target) {
    return true;
  }
  return !config.blockedTargetTextPatterns.some((pattern) => targetMatchesTextPattern(event.target!, pattern));
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

function readNonNegativeInteger(name: string, fallback: number) {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
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

function readTestKind(): ExplorerTestKind {
  return process.env.UI_EXPLORER_TEST_KIND === "repeatableRegion" ? "repeatableRegion" : "stateExploration";
}

function defaultStateAbstractor(testKind: ExplorerTestKind) {
  if (process.env.UI_EXPLORER_STATE_MODE === "coarse") {
    return "coarse";
  }
  return testKind === "stateExploration" ? "stateExploration" : "normal";
}

function escapeRegex(value: string) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function safeFilePart(value: string) {
  return value.replace(/[^a-z0-9._-]+/gi, "-").slice(0, 80) || "seed";
}

function targetMatchesTextPattern(target: UiEvent["target"], pattern: string) {
  if (!target) {
    return false;
  }
  const normalizedPattern = pattern.trim().toLowerCase();
  if (!normalizedPattern) {
    return false;
  }
  return [target.textBucket, target.labelBucket, target.placeholderBucket].some((value) => value.includes(normalizedPattern));
}
