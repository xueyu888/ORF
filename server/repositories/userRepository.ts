import { and, asc, eq, ne, sql } from "drizzle-orm";
import type { OrfUser, UserRole } from "../../src/types/orf";
import { db } from "../db/client";
import { teamMembers, users } from "../db/schema";

export type UserInput = {
  name: string;
  email: string;
  role: UserRole;
};

const today = () => new Date().toISOString().slice(0, 10);

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizeInput(input: UserInput): UserInput {
  return {
    name: input.name.trim(),
    email: normalizeEmail(input.email),
    role: input.role,
  };
}

function userIdBase(email: string) {
  return `user-${email
    .split("@")[0]
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "member"}`;
}

async function nextUserId(email: string) {
  const base = userIdBase(email);
  let candidate = base;
  let suffix = 1;

  while (true) {
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.id, candidate)).limit(1);
    if (!existing) {
      return candidate;
    }

    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
}

function normalizeRole(role: string): UserRole {
  return role === "admin" ? "admin" : "member";
}

async function adminCount(teamId: string) {
  const rows = await db.select({ userId: teamMembers.userId }).from(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.role, "admin")));
  return rows.length;
}

async function assertCanChangeRole(teamId: string, userId: string, nextRole: UserRole) {
  const [membership] = await db
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
    .limit(1);

  if (!membership) {
    throw Object.assign(new Error("User not found"), { statusCode: 404 });
  }

  if (membership.role === "admin" && nextRole !== "admin" && (await adminCount(teamId)) <= 1) {
    throw Object.assign(new Error("At least one admin is required"), { statusCode: 409 });
  }
}

export async function getTeamUsers(teamId: string): Promise<OrfUser[]> {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: teamMembers.role,
      lastLoginAt: users.lastLoginAt,
    })
    .from(teamMembers)
    .innerJoin(users, eq(teamMembers.userId, users.id))
    .where(eq(teamMembers.teamId, teamId))
    .orderBy(asc(users.name));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email ?? "",
    role: normalizeRole(row.role),
    lastLoginAt: row.lastLoginAt,
  }));
}

export async function createTeamUser(teamId: string, input: UserInput): Promise<OrfUser[]> {
  const normalized = normalizeInput(input);
  if (!normalized.name || !normalized.email) {
    throw Object.assign(new Error("Name and email are required"), { statusCode: 400 });
  }

  const [matchedUser] = await db.select().from(users).where(sql`lower(${users.email}) = ${normalized.email}`).limit(1);
  if (matchedUser) {
    const [membership] = await db
      .select({ role: teamMembers.role })
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, matchedUser.id)))
      .limit(1);

    if (membership) {
      await assertCanChangeRole(teamId, matchedUser.id, normalized.role);
    }
  }

  await db.transaction(async (tx) => {
    const existingUser = matchedUser ?? (await tx.select().from(users).where(sql`lower(${users.email}) = ${normalized.email}`).limit(1))[0];
    const userId = existingUser?.id ?? (await nextUserId(normalized.email));

    if (existingUser) {
      await tx.update(users).set({ name: normalized.name, email: normalized.email }).where(eq(users.id, userId));
    } else {
      await tx.insert(users).values({
        id: userId,
        name: normalized.name,
        email: normalized.email,
        createdAt: today(),
      });
    }

    await tx
      .insert(teamMembers)
      .values({ teamId, userId, role: normalized.role })
      .onConflictDoUpdate({
        target: [teamMembers.teamId, teamMembers.userId],
        set: { role: normalized.role },
      });
  });

  return getTeamUsers(teamId);
}

export async function updateTeamUser(teamId: string, userId: string, input: UserInput): Promise<OrfUser[]> {
  const normalized = normalizeInput(input);
  if (!normalized.name || !normalized.email) {
    throw Object.assign(new Error("Name and email are required"), { statusCode: 400 });
  }

  await assertCanChangeRole(teamId, userId, normalized.role);

  const [emailOwner] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(sql`lower(${users.email}) = ${normalized.email}`, ne(users.id, userId)))
    .limit(1);

  if (emailOwner) {
    throw Object.assign(new Error("Email already exists"), { statusCode: 409 });
  }

  await db.transaction(async (tx) => {
    await tx.update(users).set({ name: normalized.name, email: normalized.email }).where(eq(users.id, userId));
    await tx.update(teamMembers).set({ role: normalized.role }).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
  });

  return getTeamUsers(teamId);
}

export async function deleteTeamUser(teamId: string, userId: string): Promise<OrfUser[]> {
  await assertCanChangeRole(teamId, userId, "member");
  await db.delete(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
  return getTeamUsers(teamId);
}
