import { asc, eq, sql } from "drizzle-orm";
import { db } from "../../../_operators/testd-db-client";
import { teamMembers, teams, users } from "../../../../server/db/schema";
import { saveUserPreferences } from "../../../../server/settings/personalSettings";
import {
  ORY_ADMIN_URL,
  type OryIdentity,
} from "../../../_operators/common.context";
import {
  findOryIdentityByEmail,
  oryAdminFetch,
} from "../../../_operators/common.helpers";
import { createStableUuid, isUuid } from "../../../_shared/ids";
import type { MemberAccountRecord, MloginCaseData } from "./mlogin.context";

export async function memberAccountActive(email: string) {
  const account = await readMemberAccount(email);
  return !!account && account.role === "member" && account.status === "active";
}

export async function readMemberAccount(
  email: string,
): Promise<MemberAccountRecord | null> {
  const records = await readMemberAccountRecords(email);
  return (
    records.find(
      (record) => record.role === "member" && record.status === "active",
    ) ?? null
  );
}

export async function upsertOryIdentityWithPassword(
  data: Pick<MloginCaseData, "email" | "name" | "password">,
) {
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

export async function oryIdentityPasswordAvailable(email: string) {
  const identity = await findOryIdentityByEmail(email);
  if (!identity) {
    return false;
  }

  const response = await oryAdminFetch<{
    credentials?: Record<string, unknown>;
  }>(`/admin/identities/${encodeURIComponent(identity.id)}`);
  const credentials = response.credentials;
  return (
    typeof credentials?.password === "object" && credentials.password !== null
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

  const response = await fetch(
    `${ORY_ADMIN_URL}/admin/identities/${encodeURIComponent(identity.id)}/sessions`,
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

export async function upsertOrfMember(
  data: Pick<MloginCaseData, "email" | "name" | "role">,
  identityId: string | undefined,
) {
  const teamId = await ensureDefaultTeam();
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${data.email.toLowerCase()}`)
    .limit(1);
  const effectiveUserId = existing?.id ?? (isUuid(identityId) ? identityId : createStableUuid("testd-member-login-user", `${data.email.toLowerCase()}:${identityId ?? ""}`));

  if (existing) {
    await db
      .update(users)
      .set({
        name: data.name,
        email: data.email,
        status: "active",
        ...(identityId ? { oryIdentityId: identityId } : {}),
      })
      .where(eq(users.id, effectiveUserId));
  } else {
    await db.insert(users).values({
      id: effectiveUserId,
      name: data.name,
      email: data.email,
      status: "active",
      oryIdentityId: identityId,
      createdAt: today(),
      lastOnlineAt: null,
    });
  }

  await db
    .insert(teamMembers)
    .values({ teamId, userId: effectiveUserId, role: data.role })
    .onConflictDoUpdate({
      target: [teamMembers.teamId, teamMembers.userId],
      set: { role: data.role },
    });

  return { id: effectiveUserId, teamId };
}

export async function setMemberDefaultLandingPath(userId: string, path: string) {
  await saveUserPreferences(userId, { defaultLandingPath: path });
}

export async function resetMemberDefaultLandingPathByEmail(email: string) {
  const rows = await readMemberUserIds(email);
  for (const row of rows) {
    await saveUserPreferences(row.id, { defaultLandingPath: null });
  }
}

export async function deleteMemberMembershipsByEmail(email: string) {
  const rows = await readMemberUserIds(email);
  for (const row of rows) {
    await db.delete(teamMembers).where(eq(teamMembers.userId, row.id));
  }
}

export async function deleteMemberByEmail(email: string) {
  const deadline = Date.now() + 10_000;
  let absentSince: number | null = null;

  while (Date.now() < deadline) {
    const rows = await readMemberUserIds(email);
    if (rows.length === 0) {
      absentSince ??= Date.now();
      if (Date.now() - absentSince >= 750) {
        return;
      }
    } else {
      absentSince = null;
      for (const row of rows) {
        await db.delete(teamMembers).where(eq(teamMembers.userId, row.id));
        await db.delete(users).where(eq(users.id, row.id));
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const rows = await readMemberUserIds(email);
  if (rows.length > 0) {
    throw new Error(`普通成员测试用户未能清理干净: ${email}`);
  }
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

  const id = "team-orf-member-login-e2e";
  await db
    .insert(teams)
    .values({
      id,
      name: "ORF 普通成员登录测试团队",
      createdAt: today(),
    })
    .onConflictDoNothing();
  return id;
}

async function readMemberUserIds(email: string) {
  return db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email.toLowerCase()}`);
}

async function readMemberAccountRecords(
  email: string,
): Promise<MemberAccountRecord[]> {
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
    .filter((row) => row.role === "member")
    .map((row) => ({
      userId: row.userId,
      email: row.email ?? "",
      role: "member",
      status: row.status,
      lastOnlineAt: row.lastOnlineAt,
    }));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
