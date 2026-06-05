#!/usr/bin/env node
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { createPgPoolConfig } from "./db-connection.mjs";

const testdRunId = process.env.TESTD_RUN_ID ?? createTestdRunId();
const extraArgs = process.argv.slice(2);
const requestedSuite = process.env.TESTD_SUITE;
const inferredSuite = requestedSuite ?? inferSuiteFromArgs(extraArgs);
const suites = inferredSuite ? suitesFor(inferredSuite) : ["isolated", "permissions", "settings"];
const outputTailLimit = 1024 * 1024;
const defaultNetworkRetryDivisors = [2, 4, 8];
const networkFailurePatterns = [
  {
    reason: "PostgreSQL 连接超时",
    pattern: /Connection terminated due to connection timeout/i,
  },
  {
    reason: "TCP 建连超时",
    pattern: /\b(?:ETIMEDOUT|ESOCKETTIMEDOUT|ENETUNREACH|EHOSTUNREACH)\b/i,
  },
  {
    reason: "TCP 连接被重置",
    pattern: /\bECONNRESET\b|socket hang up/i,
  },
  {
    reason: "PostgreSQL 连接意外中断",
    pattern: /Connection terminated unexpectedly/i,
  },
  {
    reason: "Playwright worker 异常退出",
    pattern: /worker process exited unexpectedly.*signal=SIGTRAP/is,
  },
];
let currentChild;
let currentChildExited = true;
let terminating = false;
let terminationSignal;

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    handleTerminationSignal(signal);
  });
}

ensureTestdConfigFileExists();

if (await shouldRunRecoveryPass(extraArgs)) {
  for (const suite of suites) {
    if (terminating) {
      break;
    }

    const exitCode = await runRecoveryPass(suite, extraArgs, "pre");
    if (terminating) {
      process.exitCode = signalExitCode(terminationSignal ?? "SIGINT");
      break;
    }
    if (exitCode !== 0) {
      process.exitCode = exitCode;
      break;
    }
  }
}

if (!process.exitCode) {
  for (const suite of suites) {
    if (terminating) {
      break;
    }

    const exitCode = await runSuiteWithNetworkRetry(suite, extraArgs);
    if (terminating) {
      process.exitCode = signalExitCode(terminationSignal ?? "SIGINT");
      break;
    }
    if (exitCode !== 0) {
      process.exitCode = exitCode;
      break;
    }
  }
}

async function runSuiteWithNetworkRetry(suite, args) {
  const attempts = buildNetworkRetryAttempts(suite, args);

  for (const [attemptIndex, attempt] of attempts.entries()) {
    if (attempt.retryIndex > 0) {
      console.error(
        `TestD 网络降级重试 ${attempt.retryIndex}/${attempts.length - 1}: suite=${suite} ${describeAttempt(attempt)}`,
      );
    }

    const result = await runPlaywrightAttempt(suite, attempt.args, attempt.env);
    if (result.exitCode === 0) {
      return 0;
    }
    if (terminating) {
      return signalExitCode(terminationSignal ?? "SIGINT");
    }

    const networkFailure = detectNetworkEntryFailure(result.outputTail);
    const nextAttempt = attempts[attemptIndex + 1];
    if (networkFailure && nextAttempt && isRecoveryPassAllowed(attempt.args)) {
      console.error(`TestD 检测到 ${suite} suite 可能遇到数据库公网入口建连抖动: ${networkFailure.reason}`);
      const recoveryResult = await runPostFailureRecoveryPass(suite, attempt.args, result.exitCode, {
        preserveOriginalExitCode: false,
      });
      if (terminating) {
        return signalExitCode(terminationSignal ?? "SIGINT");
      }
      if (!recoveryResult.completed) {
        return recoveryResult.exitCode;
      }

      const delayMs = networkRetryDelayMs();
      console.error(
        `TestD 已完成本轮清理，将在 ${delayMs}ms 后用更低并发重跑整个 ${suite} suite: ${describeAttempt(nextAttempt)}`,
      );
      await sleep(delayMs);
      continue;
    }

    const recoveryResult = await runPostFailureRecoveryPass(suite, attempt.args, result.exitCode, {
      preserveOriginalExitCode: false,
    });
    if (terminating) {
      return signalExitCode(terminationSignal ?? "SIGINT");
    }
    return recoveryResult.completed || recoveryResult.skipped ? result.exitCode : recoveryResult.exitCode;
  }

  return 1;
}

async function runPlaywright(suite, args, extraEnv = {}) {
  const result = await runPlaywrightAttempt(suite, args, extraEnv);
  return result.exitCode;
}

function runPlaywrightAttempt(suite, args, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    let outputTail = "";
    const child = spawn(
      process.execPath,
      ["scripts/with-public-ca.mjs", "playwright", "test", ...args],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          TESTD_RUN_ID: testdRunId,
          TESTD_SUITE: suite,
          ...extraEnv,
        },
        stdio: ["inherit", "pipe", "pipe"],
      },
    );
    currentChild = child;
    currentChildExited = false;

    child.stdout?.on("data", (chunk) => {
      process.stdout.write(chunk);
      outputTail = appendOutputTail(outputTail, chunk);
    });
    child.stderr?.on("data", (chunk) => {
      process.stderr.write(chunk);
      outputTail = appendOutputTail(outputTail, chunk);
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      currentChildExited = true;
      currentChild = undefined;
      if (signal) {
        console.error(`testd ${suite} suite exited by signal ${signal}`);
        resolve({ exitCode: signalExitCode(signal), outputTail });
        return;
      }
      resolve({ exitCode: code ?? 1, outputTail });
    });
  });
}

function ensureTestdConfigFileExists() {
  const configPath = path.join(process.cwd(), "testd", "testd.config.ts");
  const examplePath = path.join(process.cwd(), "testd", "testd.config.ts.example");

  if (fs.existsSync(configPath)) {
    return;
  }

  if (!fs.existsSync(examplePath)) {
    throw new Error(`testd 配置不存在，且无法找到示例配置: ${examplePath}`);
  }

  try {
    fs.copyFileSync(examplePath, configPath, fs.constants.COPYFILE_EXCL);
    console.error("TestD 未找到 testd/testd.config.ts，已从 testd/testd.config.ts.example 初始化。");
  } catch (error) {
    if (error?.code === "EEXIST") {
      return;
    }
    throw error;
  }
}

function runRecoveryPass(suite, args, reason) {
  const recoveryRunId = createTestdRunId();
  const recoveryWorkers = positiveIntegerEnv("TESTD_RECOVERY_WORKERS", 1);
  console.error(
    `TestD recovery ${reason} pass 启动: suite=${suite} TESTD_RUN_ID=${recoveryRunId} workers=${recoveryWorkers}`,
  );
  return runPlaywright(suite, recoveryArgs(args), {
    TESTD_RECOVERY_ONLY: "1",
    TESTD_RUN_ID: recoveryRunId,
    TESTD_DATABASE_POOL_MAX: "1",
  });
}

async function runPostFailureRecoveryPass(suite, args, originalExitCode, options = {}) {
  if (terminating || !isRecoveryPassAllowed(args)) {
    return { completed: false, skipped: true, exitCode: originalExitCode };
  }

  console.error(`TestD 检测到 ${suite} suite 失败，开始补清理本轮异常退出留下的 recovery case...`);
  const recoveryExitCode = await runRecoveryPass(suite, args, "post-failure");
  if (terminating) {
    process.exitCode = signalExitCode(terminationSignal ?? "SIGINT");
    return { completed: false, skipped: false, exitCode: process.exitCode };
  }

  if (recoveryExitCode !== 0) {
    process.exitCode = recoveryExitCode;
    console.error(`TestD post-failure recovery 清理失败，保留退出码 ${recoveryExitCode}。`);
    return { completed: false, skipped: false, exitCode: recoveryExitCode };
  }

  if (options.preserveOriginalExitCode !== false) {
    process.exitCode = originalExitCode;
    console.error(`TestD post-failure recovery 已完成；保留原始测试失败退出码 ${originalExitCode}。`);
  } else {
    console.error("TestD post-failure recovery 已完成；本轮失败留下的 recovery case 已补清理。");
  }
  return { completed: true, skipped: false, exitCode: originalExitCode };
}

function createTestdRunId() {
  return `td-${compactDate()}-${randomUUID().slice(0, 8)}`;
}

function recoveryArgs(args) {
  const output = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (isTimeoutArg(arg)) {
      if (arg === "--timeout" || arg === "--global-timeout") {
        index += 1;
      }
      continue;
    }
    output.push(arg);
  }
  return withWorkerArg(output, positiveIntegerEnv("TESTD_RECOVERY_WORKERS", 1));
}

function isTimeoutArg(arg) {
  return (
    arg === "--timeout" ||
    arg.startsWith("--timeout=") ||
    arg === "--global-timeout" ||
    arg.startsWith("--global-timeout=")
  );
}

function buildNetworkRetryAttempts(suite, args) {
  const currentWorkers = explicitWorkerCount(args) ?? (isSerialSuite(suite) ? 1 : defaultPlaywrightWorkerCount());
  const attempts = [
    {
      retryIndex: 0,
      args,
      env: {},
      workers: currentWorkers,
      runId: testdRunId,
    },
  ];

  if (process.env.TESTD_NETWORK_RETRY === "0" || !isRecoveryPassAllowed(args)) {
    return attempts;
  }

  const maxRetries = nonNegativeIntegerEnv("TESTD_NETWORK_RETRY_MAX", 3);
  if (maxRetries === 0) {
    return attempts;
  }

  if (currentWorkers !== undefined && currentWorkers <= 1) {
    return attempts;
  }

  const retryWorkers = networkRetryWorkers(currentWorkers)
    .filter((workers) => currentWorkers === undefined || workers < currentWorkers)
    .slice(0, maxRetries);

  for (const [index, workers] of retryWorkers.entries()) {
    const runId = createTestdRunId();
    attempts.push({
      retryIndex: index + 1,
      args: withWorkerArg(args, workers),
      env: {
        TESTD_RUN_ID: runId,
        TESTD_DATABASE_POOL_MAX: "1",
      },
      workers,
      runId,
    });
  }

  return attempts;
}

function isSerialSuite(suite) {
  return suite === "permissions" || suite === "settings";
}

function networkRetryWorkers(currentWorkers) {
  const raw = process.env.TESTD_NETWORK_RETRY_WORKERS;
  const candidates = raw ? raw.split(",").map((part) => Number.parseInt(part.trim(), 10)) : workerFractions(currentWorkers);
  const unique = [];
  for (const value of candidates) {
    if (Number.isInteger(value) && value > 0 && !unique.includes(value)) {
      unique.push(value);
    }
  }
  return unique;
}

function workerFractions(currentWorkers) {
  return defaultNetworkRetryDivisors.map((divisor) => Math.max(1, Math.floor(currentWorkers / divisor)));
}

function defaultPlaywrightWorkerCount() {
  return Math.max(1, Math.floor(logicalCpuCount() / 2));
}

function logicalCpuCount() {
  if (typeof os.availableParallelism === "function") {
    return os.availableParallelism();
  }
  return os.cpus().length || 1;
}

function explicitWorkerCount(args) {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--workers") {
      const value = Number.parseInt(args[index + 1] ?? "", 10);
      return Number.isInteger(value) && value > 0 ? value : undefined;
    }
    if (arg.startsWith("--workers=")) {
      const value = Number.parseInt(arg.slice("--workers=".length), 10);
      return Number.isInteger(value) && value > 0 ? value : undefined;
    }
  }
  return undefined;
}

function withWorkerArg(args, workers) {
  const output = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--workers") {
      index += 1;
      continue;
    }
    if (arg.startsWith("--workers=")) {
      continue;
    }
    output.push(arg);
  }
  output.push(`--workers=${workers}`);
  return output;
}

function describeAttempt(attempt) {
  const workers = attempt.workers === undefined ? "默认 workers" : `--workers=${attempt.workers}`;
  const pool = attempt.retryIndex > 0 ? "TESTD_DATABASE_POOL_MAX=1" : "当前 pool 设置";
  return `${workers}, ${pool}, TESTD_RUN_ID=${attempt.runId}`;
}

function detectNetworkEntryFailure(output) {
  const normalizedOutput = stripAnsi(output);
  for (const item of networkFailurePatterns) {
    if (item.pattern.test(normalizedOutput)) {
      return { reason: item.reason };
    }
  }
  return undefined;
}

function appendOutputTail(current, chunk) {
  const next = current + chunk.toString("utf8");
  return next.length > outputTailLimit ? next.slice(next.length - outputTailLimit) : next;
}

function stripAnsi(value) {
  return value.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
}

function networkRetryDelayMs() {
  const maxDelayMs = nonNegativeIntegerEnv("TESTD_NETWORK_RETRY_JITTER_MS", 500);
  if (maxDelayMs === 0) {
    return 0;
  }

  const minDelayMs = Math.min(50, maxDelayMs);
  return minDelayMs + Math.floor(Math.random() * (maxDelayMs - minDelayMs + 1));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function handleTerminationSignal(signal) {
  if (terminating) {
    console.error(`testd runner 已收到 ${terminationSignal ?? signal}，仍在等待当前 Playwright 用例清理；重复 ${signal} 不会强制中断。`);
    return;
  }

  terminating = true;
  terminationSignal = signal;
  process.exitCode = signalExitCode(signal);
  console.error(`testd runner 收到 ${signal}，等待当前 Playwright 用例清理后退出...`);
  console.error("重复发送中断信号不会强制停止；TestD 会继续等待 Clean 完成。");
  if (currentChild && !currentChildExited && shouldForwardSignalToChild()) {
    currentChild.kill(signal);
  }
}

function shouldForwardSignalToChild() {
  return process.stdin.isTTY !== true;
}

function signalExitCode(signal) {
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

function compactDate() {
  return new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
}

async function shouldRunRecoveryPass(args) {
  if (!isRecoveryPassAllowed(args)) {
    return false;
  }

  return hasPendingRecoveryCases();
}

function isRecoveryPassAllowed(args) {
  if (process.env.TESTD_RECOVERY === "0" || process.env.TESTD_RECOVERY_ONLY === "1") {
    return false;
  }

  if (args.some((arg) => arg === "--list" || arg === "--help" || arg === "-h")) {
    return false;
  }

  return true;
}

async function hasPendingRecoveryCases() {
  const connectionString = process.env.DATABASE_URL ?? process.env.REMOTE_DATABASE_URL;
  if (!connectionString) {
    return false;
  }

  const pool = new pg.Pool(
    createPgPoolConfig(connectionString, {
      max: 1,
      connectionTimeoutMillis: positiveIntegerEnv("DATABASE_CONNECTION_TIMEOUT_MS", 10_000),
      queryTimeoutMillis: positiveIntegerEnv("DATABASE_QUERY_TIMEOUT_MS", 10_000),
      idleTimeoutMillis: positiveIntegerEnv("DATABASE_IDLE_TIMEOUT_MS", 10_000),
    }),
  );

  try {
    const table = await pool.query("select to_regclass('public.testd_recovery_cases') as table_name");
    if (!table.rows[0]?.table_name) {
      return false;
    }

    const staleMs = process.env.TESTD_GLOBAL_LOCK_HELD === "1"
      ? positiveIntegerEnv("TESTD_RECOVERY_STALE_MS", 1)
      : positiveIntegerEnv("TESTD_RECOVERY_STALE_MS", 120_000);
    const result = await pool.query(
      `
        select exists (
          select 1
          from testd_recovery_cases
          where
            cleanup_completed_at is null
            and (
              $1::boolean
              or heartbeat_at < now() - ($2::bigint * interval '1 millisecond')
            )
        ) as has_pending
      `,
      [process.env.TESTD_GLOBAL_LOCK_HELD === "1", staleMs],
    );
    return result.rows[0]?.has_pending === true;
  } catch (error) {
    console.error(`TestD recovery pending check failed; continuing without pre-pass: ${error?.message ?? String(error)}`);
    return false;
  } finally {
    await pool.end().catch(() => {});
  }
}

function positiveIntegerEnv(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function nonNegativeIntegerEnv(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

function inferSuiteFromArgs(args) {
  const pathArgs = args.filter((arg) => arg.length > 0 && !arg.startsWith("-"));
  if (pathArgs.length === 0) {
    return undefined;
  }

  if (pathArgs.some((arg) => arg.includes("/permissions/") || arg.includes("\\permissions\\"))) {
    return "permissions";
  }

  if (pathArgs.some((arg) => arg.includes("/settings/") || arg.includes("\\settings\\"))) {
    return "settings";
  }

  return "isolated";
}

function suitesFor(suite) {
  if (suite === "all") {
    return ["isolated", "permissions", "settings"];
  }

  if (suite === "isolated" || suite === "permissions" || suite === "settings") {
    return [suite];
  }

  console.error(`Unsupported TESTD_SUITE: ${suite}`);
  process.exit(1);
}
