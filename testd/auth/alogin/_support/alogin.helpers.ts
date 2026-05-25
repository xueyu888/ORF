import { eq, sql } from "drizzle-orm";
import { closeDb, db } from "../../../../server/db/client";
import { teamMembers, users } from "../../../../server/db/schema";
import { ORY_ADMIN_URL } from "../../../_operators/common.context";
import { findOryIdentityByEmail } from "../../../_operators/common.helpers";
import type { AdminAccountRecord } from "./alogin.context";

export async function closeALoginTestDb() {
  await closeDb();
}

export async function adminAccountActive(email: string) {
  const records = await readAdminAccountRecords(email);
  return records.some((record) => record.role === "admin" && record.status === "active");
}

export async function readAdminAccount(email: string): Promise<AdminAccountRecord | null> {
  const records = await readAdminAccountRecords(email);
  return records.find((record) => record.role === "admin" && record.status === "active") ?? null;
}

export async function restoreLastOnlineAt(userId: string, lastOnlineAt: string | null) {
  await db.update(users).set({ lastOnlineAt }).where(eq(users.id, userId));
}

export async function revokeOrySessionsByEmail(email: string) {
  const identity = await findOryIdentityByEmail(email);
  if (!identity) {
    return;
  }

  const response = await fetch(`${ORY_ADMIN_URL}/admin/identities/${encodeURIComponent(identity.id)}/sessions`, {
    method: "DELETE",
    headers: { accept: "application/json" },
  });

  if (!response.ok && response.status !== 404 && response.status !== 405) {
    throw new Error(`Ory session cleanup failed with ${response.status}: ${await response.text()}`);
  }
}

async function readAdminAccountRecords(email: string): Promise<AdminAccountRecord[]> {
  const rows = await db
    .select({
      userId: users.id,
      email: users.email,
      role: teamMembers.role,
      status: users.status,
      lastOnlineAt: users.lastOnlineAt,
    })
    .from(users)
    .innerJoin(teamMembers, eq(teamMembers.userId, users.id))
    .where(sql`lower(${users.email}) = ${email.toLowerCase()}`);

  return rows
    .filter((row) => row.role === "admin")
    .map((row) => ({
      userId: row.userId,
      email: row.email ?? "",
      role: "admin",
      status: row.status,
      lastOnlineAt: row.lastOnlineAt,
    }));
}
