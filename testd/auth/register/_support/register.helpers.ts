import { and, eq, sql } from "drizzle-orm";
import { closeDb, db } from "../../../../server/db/client";
import { teamMembers, users } from "../../../../server/db/schema";
import { ORY_ADMIN_URL } from "../../../_operators/common.context";
import { findOryIdentityByEmail } from "../../../_operators/common.helpers";
import type { RegisteredUserRecord } from "./register.context";

export async function closeRegisterTestDb() {
  await closeDb();
}

export async function oryIdentityAbsent(email: string) {
  return (await findOryIdentityByEmail(email)) === null;
}

export async function deleteOryIdentityByEmail(email: string) {
  const identity = await findOryIdentityByEmail(email);
  if (!identity) {
    return;
  }

  const response = await fetch(`${ORY_ADMIN_URL}/admin/identities/${encodeURIComponent(identity.id)}`, {
    method: "DELETE",
    headers: { accept: "application/json" },
  });

  if (!response.ok && response.status !== 404) {
    throw new Error(`Ory identity delete failed with ${response.status}: ${await response.text()}`);
  }
}

export async function revokeOrySessionsByEmail(email: string) {
  const identity = await findOryIdentityByEmail(email);
  if (!identity) {
    return;
  }

  await revokeOryIdentitySessions(identity.id);
}

export async function revokeOryIdentitySessions(identityId: string) {
  const response = await fetch(`${ORY_ADMIN_URL}/admin/identities/${encodeURIComponent(identityId)}/sessions`, {
    method: "DELETE",
    headers: { accept: "application/json" },
  });

  if (!response.ok && response.status !== 404 && response.status !== 405) {
    throw new Error(`Ory session cleanup failed with ${response.status}: ${await response.text()}`);
  }
}

export async function adminAccountActive(email: string) {
  const memberships = await readUserMemberships(email);
  return memberships.some((membership) => membership.role === "admin" && membership.status === "active");
}

export async function registeredUserAbsent(email: string) {
  return (await readUserMemberships(email)).length === 0;
}

export async function readRegisteredUser(email: string): Promise<RegisteredUserRecord | null> {
  const [row] = await readUserMemberships(email);
  return row ?? null;
}

export async function deleteRegisteredUserByEmail(email: string) {
  const rows = await db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${email.toLowerCase()}`);
  for (const row of rows) {
    await db.delete(teamMembers).where(eq(teamMembers.userId, row.id));
    await db.delete(users).where(eq(users.id, row.id));
  }
}

async function readUserMemberships(email: string): Promise<RegisteredUserRecord[]> {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      status: users.status,
      teamId: teamMembers.teamId,
      role: teamMembers.role,
    })
    .from(users)
    .innerJoin(teamMembers, eq(teamMembers.userId, users.id))
    .where(and(sql`lower(${users.email}) = ${email.toLowerCase()}`));

  return rows.map((row) => ({
    ...row,
    email: row.email ?? "",
  }));
}
