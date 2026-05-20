import { and, eq, sql } from "drizzle-orm";
import { ORY_ADMIN_URL, type OryIdentity } from "../../../_operators/common.context";
import { findOryIdentityByEmail, oryAdminFetch } from "../../../_operators/common.helpers";
import { closeDb, db } from "../../../../server/db/client";
import { teamMembers, teams, users } from "../../../../server/db/schema";
import type { MloginCaseData } from "./mlogin.context";

export async function closeMloginTestDb() {
  await closeDb();
}

export async function upsertOryIdentity(data: Pick<MloginCaseData, "email" | "name" | "password">) {
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

  return oryAdminFetch<OryIdentity>(`/admin/identities/${encodeURIComponent(existing.id)}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function revokeIdentitySessions(identityId: string) {
  const response = await fetch(`${ORY_ADMIN_URL}/admin/identities/${encodeURIComponent(identityId)}/sessions`, {
    method: "DELETE",
    headers: { accept: "application/json" },
  });

  if (!response.ok && response.status !== 404 && response.status !== 405) {
    throw new Error(`Ory session cleanup failed with ${response.status}: ${await response.text()}`);
  }
}

export async function ensureTestTeam(teamId: string) {
  const [existingTeam] = await db.select({ id: teams.id }).from(teams).where(eq(teams.id, teamId)).limit(1);
  if (existingTeam) {
    return existingTeam.id;
  }

  await db
    .insert(teams)
    .values({
      id: teamId,
      name: "登录测试团队",
      createdAt: today(),
    })
    .onConflictDoNothing();
  return teamId;
}

export async function upsertOrfMember(
  teamId: string,
  data: Pick<MloginCaseData, "email" | "name" | "role" | "userId">,
) {
  const [existingByEmail] = await db
    .select({ id: users.id, lastOnlineAt: users.lastOnlineAt })
    .from(users)
    .where(sql`lower(${users.email}) = ${data.email.toLowerCase()}`)
    .limit(1);
  const [existingById] = await db
    .select({ id: users.id, lastOnlineAt: users.lastOnlineAt })
    .from(users)
    .where(eq(users.id, data.userId))
    .limit(1);
  const existing = existingByEmail ?? existingById;
  const userId = existing?.id ?? data.userId;
  const previousLastOnlineAt = existing?.lastOnlineAt ?? null;

  if (existing) {
    await db.update(users).set({ name: data.name, email: data.email }).where(eq(users.id, userId));
  } else {
    await db.insert(users).values({
      id: userId,
      name: data.name,
      email: data.email,
      createdAt: today(),
      lastOnlineAt: null,
    });
  }

  await db
    .insert(teamMembers)
    .values({ teamId, userId, role: data.role })
    .onConflictDoUpdate({
      target: [teamMembers.teamId, teamMembers.userId],
      set: { role: data.role },
    });

  return { id: userId, previousLastOnlineAt };
}

export async function restoreLastOnlineAt(userId: string, lastOnlineAt: string | null) {
  await db.update(users).set({ lastOnlineAt }).where(eq(users.id, userId));
}

export async function readOrfMembership(userId: string, teamId: string) {
  const [membership] = await db
    .select({
      email: users.email,
      role: teamMembers.role,
      lastOnlineAt: users.lastOnlineAt,
    })
    .from(teamMembers)
    .innerJoin(users, eq(teamMembers.userId, users.id))
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
    .limit(1);

  return membership ?? null;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
