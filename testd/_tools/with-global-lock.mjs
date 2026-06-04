#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import os from "node:os";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";
import { createPgPoolConfig, databaseDisplayUrl, loadEnvFile } from "../../scripts/db-connection.mjs";

const lockName = "testd-global";
const lockNamespaceKey = 0x4f524644; // "ORFD"
const lockResourceKey = 0x5444474c; // "TDGL"
const waitLogIntervalMs = 10_000;
const heartbeatIntervalMs = 5_000;
const defaultLockTimeoutMs = 1_800_000;
const defaultStaleMs = 120_000;

const rawArgs = process.argv.slice(2);
const commandArgs = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;

if (commandArgs.length === 0) {
  console.error("Usage: node testd/_tools/with-global-lock.mjs -- <command> [args...]");
  process.exit(1);
}

loadEnvFile();

const testdRunId = process.env.TESTD_RUN_ID ?? createTestdRunId();
process.env.TESTD_RUN_ID = testdRunId;

let childProcess;
let childExited = true;
let heartbeatTimer;
let hasLock = false;
let released = false;
let terminating = false;
let client;

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.once(signal, () => {
    void handleTerminationSignal(signal);
  });
}

if (process.env.TESTD_GLOBAL_LOCK === "0") {
  console.error(`TestD 全局锁已关闭，本次 TESTD_RUN_ID=${testdRunId}`);
  process.exitCode = await runCommand(commandArgs, { TESTD_RUN_ID: testdRunId });
  process.exit();
}

const connectionString = process.env.DATABASE_URL ?? process.env.REMOTE_DATABASE_URL;

if (!connectionString) {
  console.error("TestD 全局锁需要 DATABASE_URL 或 REMOTE_DATABASE_URL。");
  process.exit(1);
}

const owner = collectOwnerInfo(testdRunId);
const lockTimeoutMs = positiveIntegerEnv("TESTD_GLOBAL_LOCK_TIMEOUT_MS", defaultLockTimeoutMs);
const staleMs = positiveIntegerEnv("TESTD_GLOBAL_LOCK_STALE_MS", defaultStaleMs);
const { Client } = pg;
client = new Client(
  createPgPoolConfig(connectionString, {
    connectionTimeoutMillis: positiveIntegerEnv("DATABASE_CONNECTION_TIMEOUT_MS", 10_000),
    queryTimeoutMillis: positiveIntegerEnv("DATABASE_QUERY_TIMEOUT_MS", 10_000),
    idleTimeoutMillis: positiveIntegerEnv("DATABASE_IDLE_TIMEOUT_MS", 10_000),
  }),
);

try {
  await client.connect();
  client.on("error", (error) => {
    void abortAfterLockLoss(error);
  });

  await ensureLockTables(client);
  await upsertQueueRow(client, owner);

  hasLock = await waitForLock(client, owner, {
    lockTimeoutMs,
    staleMs,
  });

  await upsertHolderRow(client, owner);
  heartbeatTimer = startHeartbeat(client, owner);

  console.error(formatAcquiredLog(owner));
  process.exitCode = await runCommand(commandArgs, { TESTD_RUN_ID: testdRunId });
} catch (error) {
  console.error(error?.message ?? String(error));
  process.exitCode = process.exitCode || 1;
} finally {
  await cleanupAndDisconnect();
}

async function waitForLock(lockClient, ownerInfo, options) {
  const startedAt = Date.now();
  let lastLogAt = 0;
  let announcedWaiting = false;

  while (true) {
    await refreshQueueHeartbeat(lockClient, ownerInfo);
    await cleanupStaleMetadata(lockClient, options.staleMs);

    const position = await queuePosition(lockClient, ownerInfo.runId);
    if (position === null) {
      await upsertQueueRow(lockClient, ownerInfo);
      continue;
    }

    if (position === 1) {
      const locked = await tryAdvisoryLock(lockClient);
      if (locked) {
        return true;
      }
    }

    const now = Date.now();
    if (!announcedWaiting || now - lastLogAt >= waitLogIntervalMs) {
      const holder = await currentHolder(lockClient);
      const queueLength = await queueLengthForLog(lockClient);
      console.error(formatWaitingLog({
        holder,
        ownerPosition: position,
        queueLength,
        staleMs: options.staleMs,
        hasKnownAdvisoryHolder: position === 1,
      }));
      announcedWaiting = true;
      lastLogAt = now;
    }

    if (now - startedAt > options.lockTimeoutMs) {
      const holder = await currentHolder(lockClient);
      throw new Error(formatTimeoutLog(holder, options.lockTimeoutMs));
    }

    await delay(1000);
  }
}

async function ensureLockTables(lockClient) {
  await lockClient.query(`
    create table if not exists testd_global_lock_holders (
      lock_name text primary key,
      run_id text not null,
      owner_name text not null,
      hostname text not null,
      git_branch text not null,
      git_commit text not null,
      pid integer not null,
      started_at timestamptz not null,
      heartbeat_at timestamptz not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);

  await lockClient.query(`
    create table if not exists testd_global_lock_queue (
      run_id text primary key,
      lock_name text not null,
      owner_name text not null,
      hostname text not null,
      git_branch text not null,
      git_commit text not null,
      pid integer not null,
      created_at timestamptz not null default now(),
      heartbeat_at timestamptz not null,
      updated_at timestamptz not null default now()
    )
  `);

  await lockClient.query(`
    create index if not exists testd_global_lock_queue_order_idx
    on testd_global_lock_queue (lock_name, created_at, run_id)
  `);
}

async function upsertQueueRow(lockClient, ownerInfo) {
  await lockClient.query(
    `
      insert into testd_global_lock_queue (
        run_id,
        lock_name,
        owner_name,
        hostname,
        git_branch,
        git_commit,
        pid,
        heartbeat_at,
        updated_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, now(), now())
      on conflict (run_id) do update set
        owner_name = excluded.owner_name,
        hostname = excluded.hostname,
        git_branch = excluded.git_branch,
        git_commit = excluded.git_commit,
        pid = excluded.pid,
        heartbeat_at = now(),
        updated_at = now()
    `,
    [
      ownerInfo.runId,
      lockName,
      ownerInfo.ownerName,
      ownerInfo.hostname,
      ownerInfo.gitBranch,
      ownerInfo.gitCommit,
      ownerInfo.pid,
    ],
  );
}

async function refreshQueueHeartbeat(lockClient, ownerInfo) {
  await lockClient.query(
    `
      update testd_global_lock_queue
      set heartbeat_at = now(), updated_at = now()
      where lock_name = $1 and run_id = $2
    `,
    [lockName, ownerInfo.runId],
  );
}

async function cleanupStaleMetadata(lockClient, staleMs) {
  const staleBefore = new Date(Date.now() - staleMs);
  await lockClient.query(
    `
      delete from testd_global_lock_holders
      where lock_name = $1 and heartbeat_at < $2
    `,
    [lockName, staleBefore],
  );
  await lockClient.query(
    `
      delete from testd_global_lock_queue
      where lock_name = $1 and heartbeat_at < $2
    `,
    [lockName, staleBefore],
  );
}

async function queuePosition(lockClient, runId) {
  const result = await lockClient.query(
    `
      select position
      from (
        select
          run_id,
          row_number() over (order by created_at, run_id) as position
        from testd_global_lock_queue
        where lock_name = $1
      ) ranked
      where run_id = $2
    `,
    [lockName, runId],
  );
  const position = result.rows[0]?.position;
  return position == null ? null : Number(position);
}

async function queueLengthForLog(lockClient) {
  const result = await lockClient.query(
    "select count(*)::int as count from testd_global_lock_queue where lock_name = $1",
    [lockName],
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function tryAdvisoryLock(lockClient) {
  const result = await lockClient.query(
    "select pg_try_advisory_lock($1::int, $2::int) as locked",
    [lockNamespaceKey, lockResourceKey],
  );
  return Boolean(result.rows[0]?.locked);
}

async function upsertHolderRow(lockClient, ownerInfo) {
  await lockClient.query(
    `
      insert into testd_global_lock_holders (
        lock_name,
        run_id,
        owner_name,
        hostname,
        git_branch,
        git_commit,
        pid,
        started_at,
        heartbeat_at,
        updated_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, now(), now(), now())
      on conflict (lock_name) do update set
        run_id = excluded.run_id,
        owner_name = excluded.owner_name,
        hostname = excluded.hostname,
        git_branch = excluded.git_branch,
        git_commit = excluded.git_commit,
        pid = excluded.pid,
        started_at = excluded.started_at,
        heartbeat_at = excluded.heartbeat_at,
        updated_at = now()
    `,
    [
      lockName,
      ownerInfo.runId,
      ownerInfo.ownerName,
      ownerInfo.hostname,
      ownerInfo.gitBranch,
      ownerInfo.gitCommit,
      ownerInfo.pid,
    ],
  );
}

function startHeartbeat(lockClient, ownerInfo) {
  const timer = setInterval(() => {
    void refreshHeartbeat(lockClient, ownerInfo).catch((error) => {
      void abortAfterLockLoss(error);
    });
  }, heartbeatIntervalMs);
  timer.unref();
  return timer;
}

async function refreshHeartbeat(lockClient, ownerInfo) {
  await lockClient.query(
    `
      update testd_global_lock_holders
      set heartbeat_at = now(), updated_at = now()
      where lock_name = $1 and run_id = $2
    `,
    [lockName, ownerInfo.runId],
  );
  await refreshQueueHeartbeat(lockClient, ownerInfo);
}

async function currentHolder(lockClient) {
  const result = await lockClient.query(
    `
      select
        run_id,
        owner_name,
        hostname,
        git_branch,
        git_commit,
        pid,
        started_at,
        heartbeat_at
      from testd_global_lock_holders
      where lock_name = $1
    `,
    [lockName],
  );
  return result.rows[0] ?? null;
}

async function releaseAdvisoryLock(lockClient) {
  await lockClient.query(
    "select pg_advisory_unlock($1::int, $2::int)",
    [lockNamespaceKey, lockResourceKey],
  );
}

async function cleanupRows(lockClient, ownerInfo) {
  await lockClient.query(
    "delete from testd_global_lock_holders where lock_name = $1 and run_id = $2",
    [lockName, ownerInfo.runId],
  );
  await lockClient.query(
    "delete from testd_global_lock_queue where lock_name = $1 and run_id = $2",
    [lockName, ownerInfo.runId],
  );
}

async function cleanupAndDisconnect() {
  if (released) {
    return;
  }
  released = true;

  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
  }

  try {
    if (client) {
      await cleanupRows(client, owner);
    }
    if (hasLock && client) {
      await releaseAdvisoryLock(client);
    }
  } catch (error) {
    if (hasLock) {
      console.error(`TestD 全局锁清理元数据失败，数据库连接关闭后 advisory lock 会自动释放: ${error?.message ?? String(error)}`);
    }
  } finally {
    await client?.end().catch(() => {});
  }
}

async function abortAfterLockLoss(error) {
  if (!hasLock || released) {
    return;
  }

  console.error(`TestD 全局锁连接异常，停止当前测试以避免并发执行: ${error?.message ?? String(error)}`);
  process.exitCode = process.exitCode || 1;

  await terminateChild("SIGTERM", 3000);
  await cleanupAndDisconnect();
  process.exit(process.exitCode);
}

async function handleTerminationSignal(signal) {
  if (terminating) {
    return;
  }
  terminating = true;

  console.error(`TestD 全局锁收到 ${signal}，正在停止子进程并释放锁...`);
  process.exitCode = signalExitCode(signal);
  await terminateChild(signal, 5000);
  await cleanupAndDisconnect();
  process.exit(process.exitCode);
}

async function terminateChild(signal, graceMs) {
  if (!childProcess || childExited) {
    return;
  }

  childProcess.kill(signal);

  const startedAt = Date.now();
  while (!childExited && Date.now() - startedAt < graceMs) {
    await delay(100);
  }

  if (!childExited) {
    childProcess.kill("SIGKILL");
  }
}

function runCommand(args, extraEnv) {
  return new Promise((resolve, reject) => {
    childExited = false;
    childProcess = spawn(args[0], args.slice(1), {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...extraEnv,
      },
      shell: process.platform === "win32",
      stdio: "inherit",
    });

    childProcess.on("error", reject);
    childProcess.on("exit", (code, signal) => {
      childExited = true;
      if (signal) {
        resolve(1);
        return;
      }
      resolve(code ?? 1);
    });
  });
}

function collectOwnerInfo(runId) {
  return {
    runId,
    ownerName: shellOutput("git", ["config", "user.name"]) || os.userInfo().username || "unknown",
    hostname: os.hostname(),
    gitBranch: currentGitBranch(),
    gitCommit: shellOutput("git", ["rev-parse", "--short=12", "HEAD"]) || "unknown",
    pid: process.pid,
  };
}

function currentGitBranch() {
  return (
    shellOutput("git", ["branch", "--show-current"]) ||
    shellOutput("git", ["rev-parse", "--abbrev-ref", "HEAD"]) ||
    "unknown"
  );
}

function shellOutput(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return result.status === 0 ? result.stdout.trim() : "";
}

function positiveIntegerEnv(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
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

function createTestdRunId() {
  return `td-${compactDate()}-${randomUUID().slice(0, 8)}`;
}

function compactDate() {
  return new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
}

function formatAcquiredLog(ownerInfo) {
  return [
    "TestD 已获得全局锁",
    `持有者: ${ownerInfo.ownerName}`,
    `机器: ${ownerInfo.hostname}`,
    `分支: ${ownerInfo.gitBranch}`,
    `commit: ${ownerInfo.gitCommit}`,
    `pid: ${ownerInfo.pid}`,
    `TESTD_RUN_ID: ${ownerInfo.runId}`,
    `数据库: ${databaseDisplayUrl()}`,
  ].join("\n");
}

function formatWaitingLog({ holder, ownerPosition, queueLength, hasKnownAdvisoryHolder }) {
  const lines = ["TestD 正在等待全局锁..."];

  if (holder) {
    lines.push(
      `当前持有者: ${holder.owner_name}`,
      `机器: ${holder.hostname}`,
      `分支: ${holder.git_branch}`,
      `commit: ${holder.git_commit}`,
      `开始时间: ${formatDateTime(holder.started_at)}`,
      `已运行: ${formatDuration(Date.now() - new Date(holder.started_at).getTime())}`,
      `最近心跳: ${formatAgo(holder.heartbeat_at)}`,
    );
  } else if (hasKnownAdvisoryHolder) {
    lines.push("当前持有者: 未知（数据库 advisory lock 已占用，等待元数据刷新）");
  } else {
    lines.push("当前持有者: 等待队首获取锁");
  }

  lines.push(`你的位置: 第 ${ownerPosition} 位`);
  lines.push(`当前排队: ${Math.max(queueLength - 1, 0)} 人`);
  lines.push("继续等待...");
  return lines.join("\n");
}

function formatTimeoutLog(holder, timeoutMs) {
  const lines = [
    `等待 TestD 全局锁超时（${formatDuration(timeoutMs)}）。`,
  ];

  if (holder) {
    lines.push(
      `当前持有者: ${holder.owner_name}`,
      `机器: ${holder.hostname}`,
      `分支: ${holder.git_branch}`,
      `commit: ${holder.git_commit}`,
      `开始时间: ${formatDateTime(holder.started_at)}`,
      `最近心跳: ${formatAgo(holder.heartbeat_at)}`,
    );
  } else {
    lines.push("当前持有者: 未知");
  }

  return lines.join("\n");
}

function formatDateTime(value) {
  const date = new Date(value);
  const pad = (part) => String(part).padStart(2, "0");
  return [
    date.getFullYear(),
    "-",
    pad(date.getMonth() + 1),
    "-",
    pad(date.getDate()),
    " ",
    pad(date.getHours()),
    ":",
    pad(date.getMinutes()),
    ":",
    pad(date.getSeconds()),
  ].join("");
}

function formatAgo(value) {
  const elapsedMs = Math.max(0, Date.now() - new Date(value).getTime());
  return `${formatDuration(elapsedMs)} 前`;
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}h${String(minutes).padStart(2, "0")}m${String(seconds).padStart(2, "0")}s`;
  }

  if (minutes > 0) {
    return `${String(minutes).padStart(2, "0")}m${String(seconds).padStart(2, "0")}s`;
  }

  return `${seconds}s`;
}
