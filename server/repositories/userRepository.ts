import { and, asc, eq, ne, sql } from "drizzle-orm";
import type { OrfUser, UserRole } from "../../src/types/orf";
import { db } from "../db/client";
import {
  feedback,
  objectiveContributionReviews,
  objectiveLoot,
  objectives,
  pointLedger,
  results,
  tasks,
  teamMembers,
  users,
} from "../db/schema";
import type { RuntimeScope } from "./runtimeScope";
import { runtimeScopeStorageId } from "./runtimeScope";

export type UserInput = {
  name: string;
  email: string;
  role: UserRole;
};

const today = () => new Date().toISOString().slice(0, 10);
const ONLINE_ACTIVITY_WRITE_INTERVAL_MS = 60_000;

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

async function assertMembershipExists(scope: RuntimeScope, userId: string) {
  const storageScopeId = runtimeScopeStorageId(scope);
  const [membership] = await db
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, storageScopeId), eq(teamMembers.userId, userId)))
    .limit(1);

  if (!membership) {
    throw Object.assign(new Error("User not found"), { statusCode: 404 });
  }
}

async function assertUniqueUserNameInScope(scope: RuntimeScope, userId: string | null, name: string) {
  const storageScopeId = runtimeScopeStorageId(scope);
  const normalizedName = name.toLowerCase();
  const nameFilter = userId
    ? and(eq(teamMembers.teamId, storageScopeId), sql`lower(${users.name}) = ${normalizedName}`, ne(users.id, userId))
    : and(eq(teamMembers.teamId, storageScopeId), sql`lower(${users.name}) = ${normalizedName}`);
  const [nameOwner] = await db
    .select({ id: users.id })
    .from(teamMembers)
    .innerJoin(users, eq(teamMembers.userId, users.id))
    .where(nameFilter)
    .limit(1);

  if (nameOwner) {
    throw Object.assign(new Error("Name already exists"), { statusCode: 409 });
  }
}

async function isReferencedByOrfRecords(scope: RuntimeScope, name: string) {
  const storageScopeId = runtimeScopeStorageId(scope);
  const objectiveRows = await db
    .select({
      challengers: objectives.challengers,
      assignedChallengers: objectives.assignedChallengers,
      challengeApplications: objectives.challengeApplications,
    })
    .from(objectives)
    .where(eq(objectives.teamId, storageScopeId));
  if (
    objectiveRows.some(
      (objective) =>
        (objective.challengers ?? []).includes(name) ||
        (objective.assignedChallengers ?? []).includes(name) ||
        (objective.challengeApplications ?? []).some((application) => application.applicant === name),
    )
  ) {
    return true;
  }

  const contributionRows = await db
    .select({
      reviewer: objectiveContributionReviews.reviewer,
      allocations: objectiveContributionReviews.allocations,
    })
    .from(objectiveContributionReviews)
    .where(eq(objectiveContributionReviews.teamId, storageScopeId));
  if (
    contributionRows.some(
      (review) =>
        review.reviewer === name ||
        (review.allocations ?? []).some((allocation) => allocation.member === name),
    )
  ) {
    return true;
  }

  const [resultRef, taskRef, feedbackRef, lootRef, ledgerRef] = await Promise.all([
    db
      .select({ id: results.id })
      .from(results)
      .where(and(eq(results.teamId, storageScopeId), eq(results.definer, name)))
      .limit(1),
    db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.teamId, storageScopeId), eq(tasks.assignee, name)))
      .limit(1),
    db
      .select({ id: feedback.id })
      .from(feedback)
      .where(and(eq(feedback.teamId, storageScopeId), eq(feedback.owner, name)))
      .limit(1),
    db
      .select({ id: objectiveLoot.id })
      .from(objectiveLoot)
      .where(and(eq(objectiveLoot.teamId, storageScopeId), eq(objectiveLoot.submittedBy, name)))
      .limit(1),
    db
      .select({ id: pointLedger.id })
      .from(pointLedger)
      .where(and(eq(pointLedger.teamId, storageScopeId), eq(pointLedger.memberName, name)))
      .limit(1),
  ]);

  return [resultRef, taskRef, feedbackRef, lootRef, ledgerRef].some((rows) => rows.length > 0);
}

async function assertCanRenameUser(scope: RuntimeScope, userId: string, nextName: string) {
  const [user] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.name === nextName) {
    return;
  }

  if (await isReferencedByOrfRecords(scope, user.name)) {
    throw Object.assign(new Error("User name is referenced by ORF records"), { statusCode: 409 });
  }
}

function assertCanChangeRole(actorUserId: string, userId: string, nextRole: UserRole) {
  if (actorUserId === userId && nextRole !== "admin") {
    throw Object.assign(new Error("Admin cannot demote self"), { statusCode: 409 });
  }
}

async function assertCanDeleteUser(scope: RuntimeScope, actorUserId: string, userId: string) {
  if (actorUserId === userId) {
    throw Object.assign(new Error("Admin cannot delete self"), { statusCode: 409 });
  }

  const [user] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
  if (user && (await isReferencedByOrfRecords(scope, user.name))) {
    throw Object.assign(new Error("User is referenced by ORF records"), { statusCode: 409 });
  }
}

export async function getScopedUsers(scope: RuntimeScope): Promise<OrfUser[]> {
  const storageScopeId = runtimeScopeStorageId(scope);
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      oryIdentityId: users.oryIdentityId,
      role: teamMembers.role,
      status: users.status,
      lastOnlineAt: users.lastOnlineAt,
    })
    .from(teamMembers)
    .innerJoin(users, eq(teamMembers.userId, users.id))
    .where(eq(teamMembers.teamId, storageScopeId))
    .orderBy(asc(users.name));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email ?? "",
    role: normalizeRole(row.role),
    status: row.status ?? "active",
    authLinked: Boolean(row.oryIdentityId),
    lastOnlineAt: row.lastOnlineAt,
  }));
}

export async function getRegistrationRequests(scope: RuntimeScope): Promise<OrfUser[]> {
  const storageScopeId = runtimeScopeStorageId(scope);
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      oryIdentityId: users.oryIdentityId,
      role: teamMembers.role,
      status: users.status,
      lastOnlineAt: users.lastOnlineAt,
    })
    .from(teamMembers)
    .innerJoin(users, eq(teamMembers.userId, users.id))
    .where(and(eq(teamMembers.teamId, storageScopeId), eq(users.status, "pending")))
    .orderBy(asc(users.createdAt), asc(users.name));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email ?? "",
    role: normalizeRole(row.role),
    status: row.status ?? "pending",
    authLinked: Boolean(row.oryIdentityId),
    lastOnlineAt: row.lastOnlineAt,
  }));
}

export async function createScopedUser(scope: RuntimeScope, actorUserId: string, input: UserInput): Promise<OrfUser[]> {
  const normalized = normalizeInput(input);
  if (!normalized.name || !normalized.email) {
    throw Object.assign(new Error("Name and email are required"), { statusCode: 400 });
  }

  const [matchedUser] = await db.select().from(users).where(sql`lower(${users.email}) = ${normalized.email}`).limit(1);
  let matchedMembership: { role: string } | undefined;
  const storageScopeId = runtimeScopeStorageId(scope);
  if (matchedUser) {
    [matchedMembership] = await db
      .select({ role: teamMembers.role })
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, storageScopeId), eq(teamMembers.userId, matchedUser.id)))
      .limit(1);

    if (matchedMembership) {
      assertCanChangeRole(actorUserId, matchedUser.id, normalized.role);
      await assertCanRenameUser(scope, matchedUser.id, normalized.name);
    }
  }

  await assertUniqueUserNameInScope(scope, matchedUser?.id ?? null, normalized.name);
  if (!matchedMembership && (await isReferencedByOrfRecords(scope, normalized.name))) {
    throw Object.assign(new Error("Name is referenced by ORF records"), { statusCode: 409 });
  }

  await db.transaction(async (tx) => {
    const existingUser = matchedUser ?? (await tx.select().from(users).where(sql`lower(${users.email}) = ${normalized.email}`).limit(1))[0];
    const userId = existingUser?.id ?? (await nextUserId(normalized.email));

    if (existingUser) {
      await tx.update(users).set({ name: normalized.name, email: normalized.email, status: "active" }).where(eq(users.id, userId));
    } else {
      await tx.insert(users).values({
        id: userId,
        name: normalized.name,
        email: normalized.email,
        status: "active",
        createdAt: today(),
      });
    }

    await tx
      .insert(teamMembers)
      .values({ teamId: storageScopeId, userId, role: normalized.role })
      .onConflictDoUpdate({
        target: [teamMembers.teamId, teamMembers.userId],
        set: { role: normalized.role },
      });
  });

  return getScopedUsers(scope);
}

export async function updateScopedUser(scope: RuntimeScope, actorUserId: string, userId: string, input: UserInput): Promise<OrfUser[]> {
  const normalized = normalizeInput(input);
  assertCanChangeRole(actorUserId, userId, normalized.role);
  return updateScopedUserRecord(scope, userId, normalized);
}

async function updateScopedUserRecord(scope: RuntimeScope, userId: string, normalized: UserInput): Promise<OrfUser[]> {
  if (!normalized.name || !normalized.email) {
    throw Object.assign(new Error("Name and email are required"), { statusCode: 400 });
  }

  await assertMembershipExists(scope, userId);
  const [currentUser] = await db.select({ email: users.email, oryIdentityId: users.oryIdentityId }).from(users).where(eq(users.id, userId)).limit(1);
  if (!currentUser) {
    throw Object.assign(new Error("User not found"), { statusCode: 404 });
  }

  if (currentUser.oryIdentityId && normalizeEmail(currentUser.email ?? "") !== normalized.email) {
    throw Object.assign(new Error("Bound login email cannot be changed"), { statusCode: 409 });
  }

  const [emailOwner] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(sql`lower(${users.email}) = ${normalized.email}`, ne(users.id, userId)))
    .limit(1);

  if (emailOwner) {
    throw Object.assign(new Error("Email already exists"), { statusCode: 409 });
  }

  await assertCanRenameUser(scope, userId, normalized.name);
  await assertUniqueUserNameInScope(scope, userId, normalized.name);

  await db.transaction(async (tx) => {
    await tx.update(users).set({ name: normalized.name, email: normalized.email }).where(eq(users.id, userId));
    await tx
      .update(teamMembers)
      .set({ role: normalized.role })
      .where(and(eq(teamMembers.teamId, runtimeScopeStorageId(scope)), eq(teamMembers.userId, userId)));
  });

  return getScopedUsers(scope);
}

export async function deleteScopedUser(scope: RuntimeScope, actorUserId: string, userId: string): Promise<OrfUser[]> {
  await assertMembershipExists(scope, userId);
  await assertCanDeleteUser(scope, actorUserId, userId);

  await db.delete(teamMembers).where(and(eq(teamMembers.teamId, runtimeScopeStorageId(scope)), eq(teamMembers.userId, userId)));
  return getScopedUsers(scope);
}

export async function approveRegistrationRequest(scope: RuntimeScope, userId: string): Promise<OrfUser[]> {
  await assertMembershipExists(scope, userId);
  await db.update(users).set({ status: "active" }).where(eq(users.id, userId));
  return getScopedUsers(scope);
}

export async function rejectRegistrationRequest(scope: RuntimeScope, userId: string): Promise<OrfUser[]> {
  await assertMembershipExists(scope, userId);
  await db.update(users).set({ status: "rejected" }).where(eq(users.id, userId));
  return getScopedUsers(scope);
}

export async function disableScopedUser(scope: RuntimeScope, actorUserId: string, userId: string): Promise<OrfUser[]> {
  await assertMembershipExists(scope, userId);
  if (actorUserId === userId) {
    throw Object.assign(new Error("Admin cannot delete self"), { statusCode: 409 });
  }
  await db.update(users).set({ status: "disabled" }).where(eq(users.id, userId));
  return getScopedUsers(scope);
}

export async function recordUserOnlineActivity(userId: string) {
  const [user] = await db.select({ lastOnlineAt: users.lastOnlineAt }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) {
    throw Object.assign(new Error("User not found"), { statusCode: 404 });
  }

  const now = new Date();
  const lastOnlineAt = user.lastOnlineAt ? Date.parse(user.lastOnlineAt) : 0;
  if (lastOnlineAt && now.getTime() - lastOnlineAt < ONLINE_ACTIVITY_WRITE_INTERVAL_MS) {
    return { updated: false, lastOnlineAt: user.lastOnlineAt };
  }

  const nextLastOnlineAt = now.toISOString();
  await db.update(users).set({ lastOnlineAt: nextLastOnlineAt }).where(eq(users.id, userId));
  return { updated: true, lastOnlineAt: nextLastOnlineAt };
}
