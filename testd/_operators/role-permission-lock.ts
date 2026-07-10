import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { PoolClient } from "pg";
import { testdPool } from "./testd-db-client";

type RolePermissionLockMode = "exclusive" | "shared";

type HeldRolePermissionLock = {
  client: PoolClient;
  mode: RolePermissionLockMode;
};

const rolePermissionLockNamespaceKey = 0x4f524650; // "ORFP"
const rolePermissionLockResourceKey = 0x54445052; // "TDPR"
const rolePermissionLockTimeoutMs = positiveIntegerEnv("TESTD_ROLE_PERMISSION_LOCK_TIMEOUT_MS", 300_000);
const heldRolePermissionLocks = new Map<string, HeldRolePermissionLock>();

export async function acquireRolePermissionLock() {
  return acquirePgAdvisoryRolePermissionLock("exclusive");
}

export async function acquireRolePermissionReadLock() {
  return acquirePgAdvisoryRolePermissionLock("shared");
}

export async function releaseRolePermissionLock(owner?: string | null) {
  if (!owner) {
    return;
  }

  const heldLock = heldRolePermissionLocks.get(owner);
  if (!heldLock) {
    return;
  }

  const unlockFunction = heldLock.mode === "shared"
    ? "pg_advisory_unlock_shared"
    : "pg_advisory_unlock";

  try {
    await heldLock.client.query(
      `select ${unlockFunction}($1::int, $2::int)`,
      [rolePermissionLockNamespaceKey, rolePermissionLockResourceKey],
    );
  } finally {
    heldRolePermissionLocks.delete(owner);
    heldLock.client.release();
  }
}

async function acquirePgAdvisoryRolePermissionLock(mode: RolePermissionLockMode) {
  const owner = `${mode}-${process.pid}-${Date.now()}-${randomUUID()}`;
  const client = await testdPool.connect();
  const lockFunction = mode === "shared"
    ? "pg_try_advisory_lock_shared"
    : "pg_try_advisory_lock";
  const startedAt = Date.now();

  try {
    while (true) {
      const result = await client.query<{ locked: boolean }>(
        `select ${lockFunction}($1::int, $2::int) as locked`,
        [rolePermissionLockNamespaceKey, rolePermissionLockResourceKey],
      );

      if (result.rows[0]?.locked) {
        heldRolePermissionLocks.set(owner, { client, mode });
        return owner;
      }

      if (Date.now() - startedAt > rolePermissionLockTimeoutMs) {
        throw new Error("等待 testd member 角色权限锁超时");
      }

      await delay(100);
    }
  } catch (error) {
    client.release();
    throw error;
  }
}

function positiveIntegerEnv(name: string, fallback: number) {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
