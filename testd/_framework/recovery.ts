import "dotenv/config";
import { spawnSync } from "node:child_process";
import os from "node:os";
import pg from "pg";
import { createPgPoolConfig } from "../../server/db/connectionOptions";
import type { StateCaseRunStageName, StateCaseSpec, StateCaseRuntime, StepSpec } from "./types";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

type RecoveryOwner = {
  ownerName: string;
  hostname: string;
  gitBranch: string;
  gitCommit: string;
  pid: number;
};

export type TestdRecoveryCaseRecord = {
  runId: string;
  caseId: string;
  markerId: string;
  caseTitle: string;
  scopedData: Record<string, unknown>;
  runtimeValues: Record<string, unknown>;
};

type RegisterCaseInput = {
  runId: string;
  markerId: string;
  testCase: StateCaseSpec;
  workerIndex: number;
};

type StepCheckpointInput = {
  runId: string;
  caseId: string;
  markerId: string;
  stage: StateCaseRunStageName;
  step: StepSpec;
  stepIndex: number;
};

type StepCompleteInput = StepCheckpointInput & {
  runtime: StateCaseRuntime;
};

type StepFailedInput = StepCheckpointInput & {
  error: unknown;
  runtime: StateCaseRuntime;
};

const defaultRecoveryStaleMs = 120_000;
const { Pool } = pg;

let pool: pg.Pool | undefined;
let ensured = false;
let owner: RecoveryOwner | undefined;

export function isTestdRecoveryEnabled() {
  return process.env.TESTD_RECOVERY !== "0";
}

export function isTestdRecoveryOnly() {
  return process.env.TESTD_RECOVERY_ONLY === "1";
}

export async function ensureTestdRecoveryLedger() {
  if (!isTestdRecoveryEnabled()) {
    return false;
  }

  const client = getRecoveryPool();
  if (!client) {
    return false;
  }

  if (ensured) {
    return true;
  }

  await client.query(`
    create table if not exists testd_recovery_runs (
      run_id text primary key,
      owner_name text not null,
      hostname text not null,
      git_branch text not null,
      git_commit text not null,
      pid integer not null,
      status text not null default 'running',
      started_at timestamptz not null default now(),
      heartbeat_at timestamptz not null default now(),
      finished_at timestamptz
    )
  `);

  await client.query(`
    create table if not exists testd_recovery_cases (
      run_id text not null references testd_recovery_runs(run_id) on delete cascade,
      case_id text not null,
      marker_id text not null,
      case_title text not null,
      worker_index integer not null,
      scoped_data jsonb not null,
      runtime_values jsonb not null default '{}'::jsonb,
      stage text,
      step_index integer,
      case_step_id text,
      step_id text,
      step_title text,
      step_status text not null default 'pending',
      cleanup_claimed_by_run_id text,
      cleanup_claimed_by_hostname text,
      cleanup_claimed_at timestamptz,
      cleanup_started_at timestamptz,
      cleanup_completed_at timestamptz,
      cleanup_error text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      heartbeat_at timestamptz not null default now(),
      primary key (run_id, case_id, marker_id)
    )
  `);

  await client.query(`
    create table if not exists testd_recovery_steps (
      run_id text not null,
      case_id text not null,
      marker_id text not null,
      stage text not null,
      step_index integer not null,
      case_step_id text,
      step_id text not null,
      step_title text not null,
      step_status text not null,
      started_at timestamptz not null default now(),
      completed_at timestamptz,
      error text,
      primary key (run_id, case_id, marker_id, stage, step_index),
      foreign key (run_id, case_id, marker_id)
        references testd_recovery_cases(run_id, case_id, marker_id)
        on delete cascade
    )
  `);

  await client.query(`
    create index if not exists testd_recovery_cases_pending_idx
    on testd_recovery_cases (case_id, cleanup_completed_at, heartbeat_at)
  `);

  ensured = true;
  return true;
}

export async function registerTestdRecoveryRun(runId: string) {
  if (!(await ensureTestdRecoveryLedger())) {
    return;
  }

  const currentOwner = collectOwner();
  await getRecoveryPool()?.query(
    `
      insert into testd_recovery_runs (
        run_id,
        owner_name,
        hostname,
        git_branch,
        git_commit,
        pid,
        status,
        heartbeat_at
      )
      values ($1, $2, $3, $4, $5, $6, 'running', now())
      on conflict (run_id) do update set
        owner_name = excluded.owner_name,
        hostname = excluded.hostname,
        git_branch = excluded.git_branch,
        git_commit = excluded.git_commit,
        pid = excluded.pid,
        status = 'running',
        heartbeat_at = now()
    `,
    [
      runId,
      currentOwner.ownerName,
      currentOwner.hostname,
      currentOwner.gitBranch,
      currentOwner.gitCommit,
      currentOwner.pid,
    ],
  );
}

export async function registerTestdRecoveryCase(input: RegisterCaseInput) {
  if (!(await ensureTestdRecoveryLedger())) {
    return;
  }

  await registerTestdRecoveryRun(input.runId);
  await getRecoveryPool()?.query(
    `
      insert into testd_recovery_cases (
        run_id,
        case_id,
        marker_id,
        case_title,
        worker_index,
        scoped_data,
        runtime_values,
        step_status,
        heartbeat_at,
        updated_at
      )
      values ($1, $2, $3, $4, $5, $6::jsonb, '{}'::jsonb, 'pending', now(), now())
      on conflict (run_id, case_id, marker_id) do update set
        case_title = excluded.case_title,
        worker_index = excluded.worker_index,
        scoped_data = excluded.scoped_data,
        heartbeat_at = now(),
        updated_at = now()
    `,
    [
      input.runId,
      input.testCase.id,
      input.markerId,
      input.testCase.title,
      input.workerIndex,
      JSON.stringify(toJsonValue(input.testCase.data)),
    ],
  );
}

export async function claimStaleTestdRecoveryCases(input: { currentRunId: string; caseId: string }) {
  if (!(await ensureTestdRecoveryLedger())) {
    return [];
  }

  const staleMs = recoveryStaleMs();
  const currentOwner = collectOwner();
  const result = await getRecoveryPool()?.query(
    `
      update testd_recovery_cases
      set
        cleanup_claimed_by_run_id = $1,
        cleanup_claimed_by_hostname = $2,
        cleanup_claimed_at = now(),
        cleanup_started_at = coalesce(cleanup_started_at, now()),
        step_status = 'cleaning',
        cleanup_error = null,
        heartbeat_at = now(),
        updated_at = now()
      where (run_id, case_id, marker_id) in (
        select run_id, case_id, marker_id
        from testd_recovery_cases
        where
          case_id = $3
          and run_id <> $1
          and cleanup_completed_at is null
          and (
            $4::boolean
            or heartbeat_at < now() - ($5::bigint * interval '1 millisecond')
          )
          and (
            cleanup_claimed_at is null
            or cleanup_claimed_at < now() - ($5::bigint * interval '1 millisecond')
          )
        order by heartbeat_at asc, created_at asc
        for update skip locked
      )
      returning
        run_id,
        case_id,
        marker_id,
        case_title,
        scoped_data,
        runtime_values
    `,
    [
      input.currentRunId,
      currentOwner.hostname,
      input.caseId,
      process.env.TESTD_GLOBAL_LOCK_HELD === "1",
      staleMs,
    ],
  );

  return (result?.rows ?? []).map((row) => ({
    runId: String(row.run_id),
    caseId: String(row.case_id),
    markerId: String(row.marker_id),
    caseTitle: String(row.case_title),
    scopedData: asRecord(row.scoped_data),
    runtimeValues: asRecord(row.runtime_values),
  } satisfies TestdRecoveryCaseRecord));
}

export async function recordTestdRecoveryStepStart(input: StepCheckpointInput) {
  if (!(await ensureTestdRecoveryLedger())) {
    return;
  }

  await getRecoveryPool()?.query(
    `
      insert into testd_recovery_steps (
        run_id,
        case_id,
        marker_id,
        stage,
        step_index,
        case_step_id,
        step_id,
        step_title,
        step_status,
        started_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, 'running', now())
      on conflict (run_id, case_id, marker_id, stage, step_index) do update set
        case_step_id = excluded.case_step_id,
        step_id = excluded.step_id,
        step_title = excluded.step_title,
        step_status = 'running',
        started_at = now(),
        completed_at = null,
        error = null
    `,
    [
      input.runId,
      input.caseId,
      input.markerId,
      input.stage,
      input.stepIndex,
      input.step.source?.caseStepId ?? null,
      input.step.id,
      input.step.title,
    ],
  );

  await getRecoveryPool()?.query(
    `
      update testd_recovery_cases
      set
        stage = $4,
        step_index = $5,
        case_step_id = $6,
        step_id = $7,
        step_title = $8,
        step_status = 'running',
        heartbeat_at = now(),
        updated_at = now()
      where run_id = $1 and case_id = $2 and marker_id = $3
    `,
    [
      input.runId,
      input.caseId,
      input.markerId,
      input.stage,
      input.stepIndex,
      input.step.source?.caseStepId ?? null,
      input.step.id,
      input.step.title,
    ],
  );
}

export async function recordTestdRecoveryStepComplete(input: StepCompleteInput) {
  if (!(await ensureTestdRecoveryLedger())) {
    return;
  }

  await getRecoveryPool()?.query(
    `
      update testd_recovery_steps
      set
        step_status = 'completed',
        completed_at = now(),
        error = null
      where
        run_id = $1
        and case_id = $2
        and marker_id = $3
        and stage = $4
        and step_index = $5
    `,
    [input.runId, input.caseId, input.markerId, input.stage, input.stepIndex],
  );

  await persistCaseRuntime({
    runId: input.runId,
    caseId: input.caseId,
    markerId: input.markerId,
    runtime: input.runtime,
    stepStatus: "completed",
    cleanupError: null,
  });
}

export async function recordTestdRecoveryStepFailed(input: StepFailedInput) {
  if (!(await ensureTestdRecoveryLedger())) {
    return;
  }

  const message = errorMessage(input.error);
  await getRecoveryPool()?.query(
    `
      update testd_recovery_steps
      set
        step_status = 'failed',
        completed_at = now(),
        error = $6
      where
        run_id = $1
        and case_id = $2
        and marker_id = $3
        and stage = $4
        and step_index = $5
    `,
    [input.runId, input.caseId, input.markerId, input.stage, input.stepIndex, message],
  );

  await persistCaseRuntime({
    runId: input.runId,
    caseId: input.caseId,
    markerId: input.markerId,
    runtime: input.runtime,
    stepStatus: "failed",
    cleanupError: message,
  });
}

export async function markTestdRecoveryCleanupStarted(input: {
  runId: string;
  caseId: string;
  markerId: string;
}) {
  if (!(await ensureTestdRecoveryLedger())) {
    return;
  }

  await getRecoveryPool()?.query(
    `
      update testd_recovery_cases
      set
        cleanup_started_at = coalesce(cleanup_started_at, now()),
        step_status = 'cleaning',
        heartbeat_at = now(),
        updated_at = now()
      where run_id = $1 and case_id = $2 and marker_id = $3
    `,
    [input.runId, input.caseId, input.markerId],
  );
}

export async function markTestdRecoveryCleanupCompleted(input: {
  runId: string;
  caseId: string;
  markerId: string;
  runtime: StateCaseRuntime;
}) {
  if (!(await ensureTestdRecoveryLedger())) {
    return;
  }

  await getRecoveryPool()?.query(
    `
      update testd_recovery_cases
      set
        runtime_values = $4::jsonb,
        step_status = 'cleaned',
        cleanup_completed_at = now(),
        cleanup_error = null,
        heartbeat_at = now(),
        updated_at = now()
      where run_id = $1 and case_id = $2 and marker_id = $3
    `,
    [
      input.runId,
      input.caseId,
      input.markerId,
      JSON.stringify(toJsonValue(input.runtime.values)),
    ],
  );
}

export async function markTestdRecoveryCleanupFailed(input: {
  runId: string;
  caseId: string;
  markerId: string;
  runtime: StateCaseRuntime;
  error: unknown;
}) {
  if (!(await ensureTestdRecoveryLedger())) {
    return;
  }

  await persistCaseRuntime({
    runId: input.runId,
    caseId: input.caseId,
    markerId: input.markerId,
    runtime: input.runtime,
    stepStatus: "cleanup_failed",
    cleanupError: errorMessage(input.error),
  });
}

async function persistCaseRuntime(input: {
  runId: string;
  caseId: string;
  markerId: string;
  runtime: StateCaseRuntime;
  stepStatus: string;
  cleanupError: string | null;
}) {
  await getRecoveryPool()?.query(
    `
      update testd_recovery_cases
      set
        runtime_values = $4::jsonb,
        step_status = $5,
        cleanup_error = $6,
        heartbeat_at = now(),
        updated_at = now()
      where run_id = $1 and case_id = $2 and marker_id = $3
    `,
    [
      input.runId,
      input.caseId,
      input.markerId,
      JSON.stringify(toJsonValue(input.runtime.values)),
      input.stepStatus,
      input.cleanupError,
    ],
  );
}

function getRecoveryPool() {
  if (!isTestdRecoveryEnabled()) {
    return undefined;
  }

  if (pool) {
    return pool;
  }

  const connectionString = process.env.DATABASE_URL ?? process.env.REMOTE_DATABASE_URL;
  if (!connectionString) {
    return undefined;
  }

  pool = new Pool(
    createPgPoolConfig(connectionString, {
      max: positiveIntegerEnv("TESTD_RECOVERY_POOL_MAX", 1),
      connectionTimeoutMillis: positiveIntegerEnv("DATABASE_CONNECTION_TIMEOUT_MS", 10_000),
      queryTimeoutMillis: positiveIntegerEnv("DATABASE_QUERY_TIMEOUT_MS", 10_000),
      idleTimeoutMillis: positiveIntegerEnv("DATABASE_IDLE_TIMEOUT_MS", 10_000),
    }),
  );
  return pool;
}

function recoveryStaleMs() {
  if (process.env.TESTD_GLOBAL_LOCK_HELD === "1") {
    return positiveIntegerEnv("TESTD_RECOVERY_STALE_MS", 1);
  }
  return positiveIntegerEnv("TESTD_RECOVERY_STALE_MS", defaultRecoveryStaleMs);
}

function positiveIntegerEnv(name: string, fallback: number) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function collectOwner(): RecoveryOwner {
  owner ??= {
    ownerName: shellOutput("git", ["config", "user.name"]) || os.userInfo().username || "unknown",
    hostname: os.hostname(),
    gitBranch: shellOutput("git", ["branch", "--show-current"]) || shellOutput("git", ["rev-parse", "--abbrev-ref", "HEAD"]) || "unknown",
    gitCommit: shellOutput("git", ["rev-parse", "--short=12", "HEAD"]) || "unknown",
    pid: process.pid,
  };
  return owner;
}

function shellOutput(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return result.status === 0 ? result.stdout.trim() : "";
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function toJsonValue(value: unknown, seen = new WeakSet<object>()): JsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : String(value);
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => toJsonValue(item, seen));
  }

  if (typeof value === "object" && value !== null) {
    if (seen.has(value)) {
      return "[Circular]";
    }
    seen.add(value);
    const output: Record<string, JsonValue> = {};
    for (const [key, child] of Object.entries(value)) {
      if (typeof child === "undefined" || typeof child === "function" || typeof child === "symbol") {
        continue;
      }
      output[key] = toJsonValue(child, seen);
    }
    seen.delete(value);
    return output;
  }

  return null;
}
