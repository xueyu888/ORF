import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const rolePermissionLockDir = path.join(process.cwd(), ".artifacts", "testd-role-permissions.lock");
const rolePermissionLockTimeoutMs = 45_000;
const staleRolePermissionLockMs = 120_000;

export async function acquireRolePermissionLock() {
  const owner = `${process.pid}-${Date.now()}-${randomUUID()}`;
  const startedAt = Date.now();

  while (true) {
    try {
      await mkdir(rolePermissionLockDir, { recursive: false });
      await writeFile(path.join(rolePermissionLockDir, "owner"), owner, "utf8");
      return owner;
    } catch (error) {
      if (!isNodeErrorCode(error, "EEXIST")) {
        throw error;
      }

      if (await rolePermissionLockIsStale()) {
        await rm(rolePermissionLockDir, { recursive: true, force: true });
        continue;
      }

      if (Date.now() - startedAt > rolePermissionLockTimeoutMs) {
        throw new Error("等待 testd member 角色权限锁超时");
      }

      await delay(100);
    }
  }
}

export async function releaseRolePermissionLock(owner?: string | null) {
  if (!owner) {
    return;
  }

  try {
    const currentOwner = await readFile(path.join(rolePermissionLockDir, "owner"), "utf8");
    if (currentOwner !== owner) {
      return;
    }
  } catch (error) {
    if (isNodeErrorCode(error, "ENOENT")) {
      return;
    }
    throw error;
  }

  await rm(rolePermissionLockDir, { recursive: true, force: true });
}

async function rolePermissionLockIsStale() {
  try {
    const lockStat = await stat(rolePermissionLockDir);
    return Date.now() - lockStat.mtimeMs > staleRolePermissionLockMs;
  } catch (error) {
    if (isNodeErrorCode(error, "ENOENT")) {
      return false;
    }
    throw error;
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isNodeErrorCode(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === code;
}
