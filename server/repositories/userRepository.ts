import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import type { OrfUser, UserRole } from "../../src/types/orf";
import { canEnableUserAccount } from "../../src/domain/userAccountLifecycle";
import { deleteOryIdentity, updateOryIdentityEmail } from "../auth/ory";
import { db } from "../db/client";
import {
  commentAttachments,
  commentMessages,
  commentThreads,
  evidence,
  feedback,
  notifications,
  objectiveAlignmentRequests,
  objectiveLoot,
  objectiveTrialReviews,
  objectives,
  pointLedger,
  results,
  tasks,
  teamMembers,
  users,
  workLogEntries,
} from "../db/schema";
import { deleteUserPersonalSettings } from "../settings/personalSettings";
import { objectStorage } from "../storage/objectStorage";
import type { RuntimeScope } from "./runtimeScope";
import { runtimeScopeStorageId } from "./runtimeScope";
import { avatarUrlForUser } from "../users/avatar/avatarRepository";

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

async function nextUserId() {
  while (true) {
    const candidate = randomUUID();
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.id, candidate)).limit(1);
    if (!existing) {
      return candidate;
    }
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

async function getScopedUserStatus(scope: RuntimeScope, userId: string) {
  const storageScopeId = runtimeScopeStorageId(scope);
  const [membership] = await db
    .select({ status: users.status })
    .from(teamMembers)
    .innerJoin(users, eq(teamMembers.userId, users.id))
    .where(and(eq(teamMembers.teamId, storageScopeId), eq(teamMembers.userId, userId)))
    .limit(1);

  if (!membership) {
    throw Object.assign(new Error("User not found"), { statusCode: 404 });
  }

  return membership.status;
}

async function getScopedUserRecord(scope: RuntimeScope, userId: string) {
  const storageScopeId = runtimeScopeStorageId(scope);
  const [row] = await db
    .select({
      avatarObjectKey: users.avatarObjectKey,
      email: users.email,
      id: users.id,
      name: users.name,
      oryIdentityId: users.oryIdentityId,
    })
    .from(teamMembers)
    .innerJoin(users, eq(teamMembers.userId, users.id))
    .where(and(eq(teamMembers.teamId, storageScopeId), eq(teamMembers.userId, userId)))
    .limit(1);

  if (!row) {
    throw Object.assign(new Error("User not found"), { statusCode: 404 });
  }

  return row;
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

async function isUserIdReferencedByOrfRecords(scope: RuntimeScope, userId: string) {
  const storageScopeId = runtimeScopeStorageId(scope);
  const [
    objectiveRef,
    resultRef,
    taskRef,
    feedbackRef,
    evidenceRef,
    lootRef,
    ledgerRef,
    trialReviewRef,
    alignmentRequestRef,
    threadRef,
    messageRef,
    attachmentRef,
    workLogRef,
  ] = await Promise.all([
    db
      .select({ id: objectives.id })
      .from(objectives)
      .where(
        and(
          eq(objectives.teamId, storageScopeId),
          or(
            eq(objectives.createdBy, userId),
            eq(objectives.updatedBy, userId),
            sql`${objectives.challengerUserIds} ? ${userId}`,
            sql`${objectives.assignedChallengerUserIds} ? ${userId}`,
            sql`exists (
              select 1
              from jsonb_array_elements(${objectives.challengeApplications}) as application(value)
              where application.value->>'applicantUserId' = ${userId}
            )`,
          ),
        ),
      )
      .limit(1),
    db
      .select({ id: results.id })
      .from(results)
      .where(and(eq(results.teamId, storageScopeId), or(eq(results.createdBy, userId), eq(results.updatedBy, userId), eq(results.definerUserId, userId))))
      .limit(1),
    db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.teamId, storageScopeId), or(eq(tasks.createdBy, userId), eq(tasks.updatedBy, userId), eq(tasks.assigneeUserId, userId))))
      .limit(1),
    db
      .select({ id: feedback.id })
      .from(feedback)
      .where(and(eq(feedback.teamId, storageScopeId), or(eq(feedback.createdBy, userId), eq(feedback.updatedBy, userId), eq(feedback.ownerUserId, userId))))
      .limit(1),
    db
      .select({ id: evidence.id })
      .from(evidence)
      .where(and(eq(evidence.teamId, storageScopeId), or(eq(evidence.createdBy, userId), eq(evidence.updatedBy, userId), eq(evidence.ownerUserId, userId))))
      .limit(1),
    db
      .select({ id: objectiveLoot.id })
      .from(objectiveLoot)
      .where(and(eq(objectiveLoot.teamId, storageScopeId), eq(objectiveLoot.submittedByUserId, userId)))
      .limit(1),
    db
      .select({ id: pointLedger.id })
      .from(pointLedger)
      .where(and(eq(pointLedger.teamId, storageScopeId), eq(pointLedger.userId, userId)))
      .limit(1),
    db
      .select({ id: objectiveTrialReviews.id })
      .from(objectiveTrialReviews)
      .where(and(eq(objectiveTrialReviews.teamId, storageScopeId), or(eq(objectiveTrialReviews.requestedByUserId, userId), eq(objectiveTrialReviews.reviewedByUserId, userId))))
      .limit(1),
    db
      .select({ id: objectiveAlignmentRequests.id })
      .from(objectiveAlignmentRequests)
      .where(and(eq(objectiveAlignmentRequests.teamId, storageScopeId), or(eq(objectiveAlignmentRequests.requestedByUserId, userId), eq(objectiveAlignmentRequests.reviewedByUserId, userId))))
      .limit(1),
    db
      .select({ id: commentThreads.id })
      .from(commentThreads)
      .where(and(eq(commentThreads.teamId, storageScopeId), eq(commentThreads.createdBy, userId)))
      .limit(1),
    db
      .select({ id: commentMessages.id })
      .from(commentMessages)
      .innerJoin(commentThreads, eq(commentMessages.threadId, commentThreads.id))
      .where(and(eq(commentThreads.teamId, storageScopeId), eq(commentMessages.authorUserId, userId)))
      .limit(1),
    db
      .select({ id: commentAttachments.id })
      .from(commentAttachments)
      .where(and(eq(commentAttachments.teamId, storageScopeId), eq(commentAttachments.createdBy, userId), isNotNull(commentAttachments.messageId)))
      .limit(1),
    db
      .select({ id: workLogEntries.id })
      .from(workLogEntries)
      .where(and(eq(workLogEntries.teamId, storageScopeId), eq(workLogEntries.authorUserId, userId)))
      .limit(1),
  ]);

  return [
    objectiveRef,
    resultRef,
    taskRef,
    feedbackRef,
    evidenceRef,
    lootRef,
    ledgerRef,
    trialReviewRef,
    alignmentRequestRef,
    threadRef,
    messageRef,
    attachmentRef,
    workLogRef,
  ].some((rows) => rows.length > 0);
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

  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  if (user && (await isUserIdReferencedByOrfRecords(scope, user.id))) {
    throw Object.assign(new Error("User is referenced by ORF records"), { statusCode: 409 });
  }
}

async function pendingCommentAttachmentsForUser(scope: RuntimeScope, userId: string) {
  return db
    .select({ id: commentAttachments.id, objectKey: commentAttachments.objectKey })
    .from(commentAttachments)
    .where(and(eq(commentAttachments.teamId, runtimeScopeStorageId(scope)), eq(commentAttachments.createdBy, userId), isNull(commentAttachments.messageId)));
}

async function deleteDerivedUserStorage(input: { avatarObjectKey: string | null; pendingCommentAttachmentObjectKeys: string[]; userId: string }) {
  await Promise.allSettled([
    input.avatarObjectKey ? objectStorage.deleteObject(input.avatarObjectKey) : Promise.resolve(),
    ...input.pendingCommentAttachmentObjectKeys.map((objectKey) => objectStorage.deleteObject(objectKey)),
    deleteUserPersonalSettings(input.userId),
  ]);
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
      avatarObjectKey: users.avatarObjectKey,
      avatarUpdatedAt: users.avatarUpdatedAt,
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
    avatarUrl: avatarUrlForUser(row),
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
      avatarObjectKey: users.avatarObjectKey,
      avatarUpdatedAt: users.avatarUpdatedAt,
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
    avatarUrl: avatarUrlForUser(row),
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
      throw Object.assign(new Error("User already exists"), { statusCode: 409 });
    }
  }

  await assertUniqueUserNameInScope(scope, matchedUser?.id ?? null, normalized.name);

  await db.transaction(async (tx) => {
    const existingUser = matchedUser ?? (await tx.select().from(users).where(sql`lower(${users.email}) = ${normalized.email}`).limit(1))[0];
    const userId = existingUser?.id ?? (await nextUserId());

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

  const [emailOwner] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(sql`lower(${users.email}) = ${normalized.email}`, ne(users.id, userId)))
    .limit(1);

  if (emailOwner) {
    throw Object.assign(new Error("Email already exists"), { statusCode: 409 });
  }

  await assertUniqueUserNameInScope(scope, userId, normalized.name);
  const previousEmail = normalizeEmail(currentUser.email ?? "");
  const shouldSyncOryEmail = Boolean(currentUser.oryIdentityId && previousEmail !== normalized.email);
  if (shouldSyncOryEmail) {
    await updateOryIdentityEmail(currentUser.oryIdentityId, normalized.email);
  }

  try {
    await db.transaction(async (tx) => {
      await tx.update(users).set({ name: normalized.name, email: normalized.email }).where(eq(users.id, userId));
      await tx
        .update(teamMembers)
        .set({ role: normalized.role })
        .where(and(eq(teamMembers.teamId, runtimeScopeStorageId(scope)), eq(teamMembers.userId, userId)));
    });
  } catch (error) {
    if (shouldSyncOryEmail && previousEmail) {
      await updateOryIdentityEmail(currentUser.oryIdentityId, previousEmail).catch(() => undefined);
    }
    throw error;
  }

  return getScopedUsers(scope);
}

export async function deleteScopedUser(scope: RuntimeScope, actorUserId: string, userId: string): Promise<OrfUser[]> {
  const targetUser = await getScopedUserRecord(scope, userId);
  await assertCanDeleteUser(scope, actorUserId, userId);
  const pendingAttachments = await pendingCommentAttachmentsForUser(scope, userId);

  await deleteOryIdentity(targetUser.oryIdentityId);

  await db.transaction(async (tx) => {
    if (pendingAttachments.length > 0) {
      await tx.delete(commentAttachments).where(inArray(commentAttachments.id, pendingAttachments.map((attachment) => attachment.id)));
    }

    await tx.delete(notifications).where(and(eq(notifications.teamId, runtimeScopeStorageId(scope)), eq(notifications.recipientUserId, userId)));
    await tx.delete(users).where(eq(users.id, userId));
  });

  await deleteDerivedUserStorage({
    avatarObjectKey: targetUser.avatarObjectKey,
    pendingCommentAttachmentObjectKeys: pendingAttachments.map((attachment) => attachment.objectKey),
    userId,
  });
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

export async function enableScopedUser(scope: RuntimeScope, userId: string): Promise<OrfUser[]> {
  const status = await getScopedUserStatus(scope, userId);
  if (!canEnableUserAccount(status)) {
    throw Object.assign(new Error("User is not disabled"), { statusCode: 409 });
  }
  await db.update(users).set({ status: "active" }).where(eq(users.id, userId));
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
