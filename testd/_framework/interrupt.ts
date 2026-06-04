import fs from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

type TestdInterruptSignal = "SIGINT" | "SIGTERM" | "SIGHUP";
type TestdInterruptSource = "signal" | "marker";

const interruptSignals: TestdInterruptSignal[] = ["SIGINT", "SIGTERM", "SIGHUP"];

let installed = false;
let interruptSignal: TestdInterruptSignal | undefined;
let interruptRequestedAt: Date | undefined;
let interruptCount = 0;
let interruptSource: TestdInterruptSource | undefined;

export class TestdInterruptError extends Error {
  constructor(signal: TestdInterruptSignal, requestedAt: Date) {
    super(`TestD received ${signal}; current case cleanup completed before exit. Requested at ${requestedAt.toISOString()}.`);
    this.name = "TestdInterruptError";
  }
}

export function installTestdInterruptHandlers() {
  if (installed) {
    return;
  }
  installed = true;

  for (const signal of interruptSignals) {
    process.on(signal, () => {
      requestTestdInterrupt(signal, "signal");
    });
  }
}

export function isTestdInterruptRequested() {
  refreshInterruptFromMarker();
  return interruptSignal !== undefined;
}

export function createTestdInterruptError() {
  refreshInterruptFromMarker();
  return new TestdInterruptError(interruptSignal ?? "SIGINT", interruptRequestedAt ?? new Date());
}

export function isTestdInterruptError(error: unknown): error is TestdInterruptError {
  return error instanceof TestdInterruptError;
}

export function markTestdCaseCleanupRequired(input: { markerId: string; testCaseId: string; title: string }) {
  const activeDir = process.env.TESTD_INTERRUPT_ACTIVE_DIR;
  if (!activeDir) {
    return;
  }

  const marker = {
    type: "testd-cleanup-required",
    runId: process.env.TESTD_RUN_ID,
    markerId: input.markerId,
    testCaseId: input.testCaseId,
    title: input.title,
    pid: process.pid,
    startedAt: new Date().toISOString(),
  };

  fs.mkdirSync(activeDir, { recursive: true });
  fs.writeFileSync(path.join(activeDir, `${safeFileName(input.markerId)}.json`), `${JSON.stringify(marker, null, 2)}\n`);
}

export function markTestdCaseCleanupComplete(input: { markerId: string; testCaseId: string }) {
  const activeDir = process.env.TESTD_INTERRUPT_ACTIVE_DIR;
  if (activeDir) {
    fs.rmSync(path.join(activeDir, `${safeFileName(input.markerId)}.json`), { force: true });
  }

  if (!isTestdInterruptRequested()) {
    return;
  }

  const cleanedMarker = {
    type: "testd-cleanup-complete",
    runId: process.env.TESTD_RUN_ID,
    markerId: input.markerId,
    signal: interruptSignal,
    requestedAt: interruptRequestedAt?.toISOString(),
    cleanedAt: new Date().toISOString(),
    testCaseId: input.testCaseId,
    pid: process.pid,
  };

  const cleanedDir = process.env.TESTD_INTERRUPT_CLEANED_DIR;
  if (cleanedDir) {
    fs.mkdirSync(cleanedDir, { recursive: true });
    fs.writeFileSync(
      path.join(cleanedDir, `${safeFileName(input.markerId)}.json`),
      `${JSON.stringify(cleanedMarker, null, 2)}\n`,
    );
  }

  const cleanupFile = process.env.TESTD_INTERRUPT_CLEANED_FILE;
  if (!cleanupFile) {
    return;
  }

  const marker = {
    type: "testd-interrupt-cleaned",
    runId: process.env.TESTD_RUN_ID,
    signal: interruptSignal,
    requestedAt: interruptRequestedAt?.toISOString(),
    cleanedAt: new Date().toISOString(),
    testCaseId: input.testCaseId,
  };

  fs.mkdirSync(path.dirname(cleanupFile), { recursive: true });
  fs.writeFileSync(cleanupFile, `${JSON.stringify(marker, null, 2)}\n`);
}

export async function waitForTestdInterruptWrapperTermination() {
  if (process.env.TESTD_INTERRUPT_WAIT_FOR_WRAPPER !== "1" || !isTestdInterruptRequested()) {
    return;
  }

  while (true) {
    await delay(1_000);
  }
}

function refreshInterruptFromMarker() {
  if (interruptSignal) {
    return;
  }

  const interruptFile = process.env.TESTD_INTERRUPT_FILE;
  if (!interruptFile || !fs.existsSync(interruptFile)) {
    return;
  }

  const signal = readMarkerSignal(interruptFile);
  requestTestdInterrupt(signal, "marker");
}

function readMarkerSignal(file: string): TestdInterruptSignal {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as { signal?: unknown };
    return normalizeSignal(parsed.signal);
  } catch {
    return "SIGINT";
  }
}

function normalizeSignal(value: unknown): TestdInterruptSignal {
  return interruptSignals.includes(value as TestdInterruptSignal) ? (value as TestdInterruptSignal) : "SIGINT";
}

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

function requestTestdInterrupt(signal: TestdInterruptSignal, source: TestdInterruptSource) {
  interruptCount += 1;

  if (!interruptSignal) {
    interruptSignal = signal;
    interruptRequestedAt = new Date();
    interruptSource = source;
    process.exitCode = signalExitCode(signal);
    const sourceText = interruptSource === "marker" ? `中断请求 ${signal}` : signal;
    process.stderr.write(`\nTestD 收到 ${sourceText}，将跳过后续非清理阶段，执行当前用例 Clean 后退出。\n`);
    process.stderr.write("重复发送中断信号不会强制停止；TestD 会继续等待 Clean 完成。\n");
    return;
  }

  if (interruptCount === 2) {
    process.stderr.write("\nTestD 已在清理当前用例；重复中断不会跳过 Clean。\n");
  }
}

function signalExitCode(signal: TestdInterruptSignal) {
  if (signal === "SIGINT") {
    return 130;
  }
  if (signal === "SIGTERM") {
    return 143;
  }
  if (signal === "SIGHUP") {
    return 129;
  }
  return 1;
}
