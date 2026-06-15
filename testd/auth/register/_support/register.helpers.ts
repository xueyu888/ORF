import { and, eq, sql } from "drizzle-orm";
import { db } from "../../../_operators/testd-db-client";
import { teamMembers, users } from "../../../../server/db/schema";
import {
  ORY_ADMIN_URL,
  type OryIdentity,
} from "../../../_operators/common.context";
import {
  findOryIdentityByEmail,
  oryAdminFetch,
} from "../../../_operators/common.helpers";
import type {
  RegisteredUserRecord,
} from "./register.context";

export async function oryIdentityAbsent(email: string) {
  return (await findOryIdentityByEmail(email)) === null;
}

export async function oryIdentityPasswordAvailable(email: string) {
  const identity = await findOryIdentityByEmail(email);
  if (!identity) {
    return false;
  }

  const detail = await oryAdminFetch<{ credentials?: Record<string, unknown> }>(
    `/admin/identities/${encodeURIComponent(identity.id)}`,
  );
  const credentials = detail.credentials;
  const passwordCredential = credentials?.password;
  return typeof passwordCredential === "object" && passwordCredential !== null;
}

export async function upsertOryIdentityWithPassword(data: {
  email: string;
  password: string;
  name: string;
}) {
  const existing = await findOryIdentityByEmail(data.email);
  const body = {
    schema_id: existing?.schema_id ?? "default",
    traits: {
      email: data.email,
      name: {
        first: data.name,
      },
    },
    credentials: {
      password: {
        config: {
          password: data.password,
        },
      },
    },
    state: "active",
  };

  if (!existing) {
    return oryAdminFetch<OryIdentity>("/admin/identities", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  return oryAdminFetch<OryIdentity>(
    `/admin/identities/${encodeURIComponent(existing.id)}`,
    {
      method: "PUT",
      body: JSON.stringify(body),
    },
  );
}

export async function deleteOryIdentityByEmail(email: string) {
  const identity = await findOryIdentityByEmail(email);
  if (!identity) {
    return;
  }

  const response = await fetch(
    `${ORY_ADMIN_URL}/admin/identities/${encodeURIComponent(identity.id)}`,
    {
      method: "DELETE",
      headers: { accept: "application/json" },
    },
  );

  if (!response.ok && response.status !== 404) {
    throw new Error(
      `Ory identity delete failed with ${response.status}: ${await response.text()}`,
    );
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
  const response = await fetch(
    `${ORY_ADMIN_URL}/admin/identities/${encodeURIComponent(identityId)}/sessions`,
    {
      method: "DELETE",
      headers: { accept: "application/json" },
    },
  );

  if (!response.ok && response.status !== 404 && response.status !== 405) {
    throw new Error(
      `Ory session cleanup failed with ${response.status}: ${await response.text()}`,
    );
  }
}

export async function registeredUserAbsent(email: string) {
  return (await readRegisteredUserIds(email)).length === 0;
}

export async function registeredUserExists(email: string) {
  return (await readUserMemberships(email)).length > 0;
}

export async function readRegisteredUser(
  email: string,
): Promise<RegisteredUserRecord | null> {
  const [row] = await readUserMemberships(email);
  return row ?? null;
}

export async function registeredUserStatusIs(email: string, status: string) {
  const user = await readRegisteredUser(email);
  return user?.status === status;
}

export async function registeredUserRoleIs(email: string, role: string) {
  const memberships = await readUserMemberships(email);
  return memberships.some((membership) => membership.role === role);
}

export async function deleteRegisteredUserMembershipsByEmail(email: string) {
  const rows = await readRegisteredUserIds(email);
  for (const row of rows) {
    await db.delete(teamMembers).where(eq(teamMembers.userId, row.id));
  }
}

export async function deleteRegisteredUserByEmail(email: string) {
  const rows = await readRegisteredUserIds(email);
  for (const row of rows) {
    await db.delete(teamMembers).where(eq(teamMembers.userId, row.id));
    await db.delete(users).where(eq(users.id, row.id));
  }
}

async function readRegisteredUserIds(email: string) {
  return db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email.toLowerCase()}`);
}

async function readUserMemberships(
  email: string,
): Promise<RegisteredUserRecord[]> {
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
