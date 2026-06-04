#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import pg from "pg";
import { createPgPoolConfig } from "./db-connection.mjs";

const testdRunId = process.env.TESTD_RUN_ID ?? createTestdRunId();
const extraArgs = process.argv.slice(2);
const requestedSuite = process.env.TESTD_SUITE;
const inferredSuite = requestedSuite ?? inferSuiteFromArgs(extraArgs);
const suites = inferredSuite ? suitesFor(inferredSuite) : ["isolated", "permissions", "settings"];
let currentChild;
let currentChildExited = true;
let terminating = false;
let terminationSignal;

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    handleTerminationSignal(signal);
  });
}

if (await shouldRunRecoveryPass(extraArgs)) {
  for (const suite of suites) {
    if (terminating) {
      break;
    }

    const exitCode = await runPlaywright(suite, extraArgs, { TESTD_RECOVERY_ONLY: "1" });
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

    const exitCode = await runPlaywright(suite, extraArgs);
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

function runPlaywright(suite, args, extraEnv = {}) {
  return new Promise((resolve, reject) => {
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
        stdio: "inherit",
      },
    );
    currentChild = child;
    currentChildExited = false;

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      currentChildExited = true;
      currentChild = undefined;
      if (signal) {
        console.error(`testd ${suite} suite exited by signal ${signal}`);
        resolve(signalExitCode(signal));
        return;
      }
      resolve(code ?? 1);
    });
  });
}

function createTestdRunId() {
  return `td-${compactDate()}-${randomUUID().slice(0, 8)}`;
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
  if (process.env.TESTD_RECOVERY === "0" || process.env.TESTD_RECOVERY_ONLY === "1") {
    return false;
  }

  if (args.some((arg) => arg === "--list" || arg === "--help" || arg === "-h")) {
    return false;
  }

  return hasPendingRecoveryCases();
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
