import { createHash, randomUUID } from "node:crypto";
import type { TestInfo } from "@playwright/test";
import { createStableUuid } from "../_shared/ids";
import type { StateCaseSpec } from "./types";

export type TestdRunScope = {
  runId: string;
  runToken: string;
  caseId: string;
  caseToken: string;
  workerIndex: number;
  label: string;
};

const scopedTextKeys = [
  "title",
  "body",
  "marker",
  "name",
  "metricname",
  "filename",
  "file",
  "content",
];
const exactUnscopedKeys = new Set([
  "password",
  "role",
  "status",
  "stage",
  "flowstatus",
  "workstatus",
  "targettype",
  "commenttargettype",
  "scene",
  "path",
  "pattern",
  "label",
  "method",
  "operator",
  "object",
  "permissionkey",
]);

export function createTestdRunId() {
  return `td-${compactDate()}-${randomUUID().slice(0, 8)}`;
}

export function ensureTestdRunId() {
  process.env.TESTD_RUN_ID ??= createTestdRunId();
  return process.env.TESTD_RUN_ID;
}

export function createTestdRunScope(
  testCase: Pick<StateCaseSpec, "id">,
  testInfo?: Pick<TestInfo, "workerIndex">,
): TestdRunScope {
  const runId = ensureTestdRunId();
  const runToken = shortHash(runId, 10);
  const caseToken = shortHash(testCase.id, 8);
  const workerIndex = testInfo?.workerIndex ?? Number(process.env.TEST_WORKER_INDEX ?? 0);
  const label = `r${runToken}-c${caseToken}-w${workerIndex}`;

  return {
    runId,
    runToken,
    caseId: testCase.id,
    caseToken,
    workerIndex,
    label,
  };
}

export function scopeStateCaseSpec<TData extends Record<string, unknown>>(
  testCase: StateCaseSpec<TData>,
  scope: TestdRunScope,
): StateCaseSpec<TData> {
  return {
    ...testCase,
    data: scopeStateCaseData(testCase.data, scope) as TData,
  };
}

export function scopeStateCaseData<TData extends Record<string, unknown>>(
  data: TData,
  scope: TestdRunScope,
): TData {
  return scopeValue(data, scope, []) as TData;
}

function scopeValue(value: unknown, scope: TestdRunScope, keyPath: string[]): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => scopeValue(item, scope, keyPath));
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, scopeValue(child, scope, [...keyPath, key])]),
    );
  }

  if (typeof value !== "string") {
    return value;
  }

  const key = keyPath.at(-1) ?? "";
  if (shouldScopeEmail(value)) {
    return scopeEmail(value, scope);
  }

  if (shouldSkipStringScope(key)) {
    return value;
  }

  if (shouldScopeUserId(key, value)) {
    return scopeUserId(value, scope);
  }

  if (shouldScopeId(key, value)) {
    return `${value}-${scope.label}`;
  }

  if (shouldScopeFileName(key, value)) {
    return scopeFileName(value, scope);
  }

  if (shouldScopeText(key, value)) {
    return scopeText(value, scope);
  }

  return value;
}

function shouldScopeEmail(value: string) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
}

function scopeEmail(email: string, scope: TestdRunScope) {
  const [local = "testd", domain = "orf.local"] = email.split("@");
  const discriminator = shortHash(email, 6);
  const suffix = `td-${scope.runToken}-${scope.caseToken}-w${scope.workerIndex}`;
  const maxLocalLength = 63;
  const maxBaseLength = Math.max(1, maxLocalLength - discriminator.length - suffix.length - 2);
  return `${local.slice(0, maxBaseLength)}-${discriminator}-${suffix}@${domain}`;
}

function shouldSkipStringScope(key: string) {
  return exactUnscopedKeys.has(key.toLowerCase()) || key.toLowerCase().endsWith("password");
}

function shouldScopeId(key: string, value: string) {
  return (
    !key.toLowerCase().includes("identity") &&
    (key === "id" || key.endsWith("Id")) &&
    /^[a-z0-9][a-z0-9_-]*$/i.test(value)
  );
}

function shouldScopeUserId(key: string, value: string) {
  const normalizedKey = key.toLowerCase();
  return (
    !normalizedKey.includes("identity") &&
    /^[a-z0-9][a-z0-9_-]*$/i.test(value) &&
    (
      normalizedKey === "userid" ||
      normalizedKey.endsWith("userid") ||
      normalizedKey === "createdby" ||
      normalizedKey === "updatedby" ||
      normalizedKey === "requestedby" ||
      normalizedKey === "reviewedby" ||
      normalizedKey === "submittedby"
    )
  );
}

function scopeUserId(value: string, scope: TestdRunScope) {
  return createStableUuid(
    "testd-run-scope-user-id",
    `${scope.runId}:${scope.caseId}:${scope.workerIndex}:${value}`,
  );
}

function shouldScopeFileName(key: string, value: string) {
  return key.toLowerCase().includes("filename") || /\.[a-z0-9]{2,8}$/i.test(value);
}

function scopeFileName(value: string, scope: TestdRunScope) {
  const dotIndex = value.lastIndexOf(".");
  if (dotIndex <= 0) {
    return `${value}-${scope.label}`;
  }

  return `${value.slice(0, dotIndex)}-${scope.label}${value.slice(dotIndex)}`;
}

function shouldScopeText(key: string, value: string) {
  const normalizedKey = key.toLowerCase();
  return (
    scopedTextKeys.some((part) => normalizedKey.includes(part)) &&
    value.length > 0
  );
}

function scopeText(value: string, scope: TestdRunScope) {
  const markerMatch = value.match(/^(E2E-[A-Z0-9-]+:\s*)(.*)$/);
  if (markerMatch) {
    const [, markerPrefix, rest = ""] = markerMatch;
    return `${markerPrefix.trimEnd()} [${scope.label}]${rest ? ` ${rest}` : ""}`;
  }

  return `${value} [${scope.label}]`;
}

function shortHash(value: string, length: number) {
  return createHash("sha1").update(value).digest("hex").slice(0, length);
}

function compactDate() {
  return new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype;
}
