import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "../../../_operators/testd-db-client";
import { teamMembers, teams, users } from "../../../../server/db/schema";
import {
  ORY_ADMIN_URL,
  type OryIdentity,
} from "../../../_operators/common.context";
import {
  findOryIdentityByEmail,
  oryAdminFetch,
} from "../../../_operators/common.helpers";
import type {
  RegisterCaseData,
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

export async function adminAccountActive(email: string) {
  const memberships = await readUserMemberships(email);
  return memberships.some(
    (membership) =>
      membership.role === "admin" && membership.status === "active",
  );
}

export async function upsertAdminAccount(
  data: Pick<RegisterCaseData, "adminEmail" | "adminName" | "adminRole">,
  identityId: string | undefined,
) {
  const teamId = await ensureDefaultTeam();
  const userId = `user-${slug(data.adminEmail.split("@")[0] ?? "register-admin")}`;
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${data.adminEmail.toLowerCase()}`)
    .limit(1);
  const effectiveUserId = existing?.id ?? userId;

  if (existing) {
    await db
      .update(users)
      .set({
        name: data.adminName,
        email: data.adminEmail,
        status: "active",
        ...(identityId ? { oryIdentityId: identityId } : {}),
      })
      .where(eq(users.id, effectiveUserId));
  } else {
    await db.insert(users).values({
      id: effectiveUserId,
      name: data.adminName,
      email: data.adminEmail,
      status: "active",
      oryIdentityId: identityId,
      createdAt: today(),
      lastOnlineAt: null,
    });
  }

  await db
    .insert(teamMembers)
    .values({ teamId, userId: effectiveUserId, role: data.adminRole })
    .onConflictDoUpdate({
      target: [teamMembers.teamId, teamMembers.userId],
      set: { role: data.adminRole },
    });

  return { id: effectiveUserId, teamId };
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

export async function deleteAdminMembershipsByEmail(email: string) {
  await deleteRegisteredUserMembershipsByEmail(email);
}

export async function deleteAdminByEmail(email: string) {
  await deleteRegisteredUserByEmail(email);
}

async function ensureDefaultTeam() {
  const [existing] = await db
    .select({ id: teams.id })
    .from(teams)
    .orderBy(asc(teams.id))
    .limit(1);
  if (existing) {
    return existing.id;
  }

  const id = "team-orf-register-e2e";
  await db
    .insert(teams)
    .values({
      id,
      name: "ORF 注册测试团队",
      createdAt: today(),
    })
    .onConflictDoNothing();
  return id;
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

function today() {
  return new Date().toISOString().slice(0, 10);
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
