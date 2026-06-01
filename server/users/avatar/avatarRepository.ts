import type { Readable } from "node:stream";
import { and, eq, inArray } from "drizzle-orm";
import type { OrfUser, UserRole } from "../../../src/types/orf";
import { db } from "../../db/client";
import { teamMembers, users } from "../../db/schema";
import { objectStorage } from "../../storage/objectStorage";
import { validateImageUpload } from "../../storage/images";
import type { RuntimeScope } from "../../repositories/runtimeScope";
import { runtimeScopeStorageId } from "../../repositories/runtimeScope";

type UserAvatarSource = {
  avatarObjectKey?: string | null;
  avatarUpdatedAt?: string | null;
  id: string;
};

type ScopedUserRow = {
  avatarObjectKey: string | null;
  avatarUpdatedAt: string | null;
  email: string | null;
  id: string;
  lastOnlineAt: string | null;
  name: string;
  oryIdentityId: string | null;
  role: string;
  status: OrfUser["status"] | null;
};

export type UserAvatarFileOutcome =
  | { status: "ok"; body: Readable; contentLength?: number; contentType: string }
  | { status: "notFound" };

export type UserAvatarMutationOutcome =
  | { status: "ok"; user: OrfUser }
  | { status: "invalid" }
  | { status: "notFound" }
  | { status: "tooLarge" }
  | { status: "unsupported" };

function normalizeRole(role: string): UserRole {
  return role === "admin" ? "admin" : "member";
}

function safePathSegment(value: string) {
  return value.trim().replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "") || "user";
}

function nowIso() {
  return new Date().toISOString();
}

function userAvatarObjectKey(input: { extension: string; timestamp: string; userId: string }) {
  const stamp = input.timestamp.replace(/[^0-9A-Za-z]+/g, "");
  return `users/${safePathSegment(input.userId)}/avatar/${stamp}.${input.extension}`;
}

function scopedUserDto(row: ScopedUserRow): OrfUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email ?? "",
    role: normalizeRole(row.role),
    status: row.status ?? "active",
    authLinked: Boolean(row.oryIdentityId),
    lastOnlineAt: row.lastOnlineAt,
    avatarUrl: avatarUrlForUser(row),
  };
}

export function avatarUrlForUser(row: UserAvatarSource) {
  if (!row.avatarObjectKey) {
    return null;
  }

  const version = row.avatarUpdatedAt ? `?v=${encodeURIComponent(row.avatarUpdatedAt)}` : "";
  return `/api/users/${encodeURIComponent(row.id)}/avatar${version}`;
}

export async function getUserAvatarUrlMap(userIds: string[]) {
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueIds.length === 0) {
    return new Map<string, string | null>();
  }

  const rows = await db
    .select({
      id: users.id,
      avatarObjectKey: users.avatarObjectKey,
      avatarUpdatedAt: users.avatarUpdatedAt,
    })
    .from(users)
    .where(inArray(users.id, uniqueIds));

  return new Map(rows.map((row) => [row.id, avatarUrlForUser(row)]));
}

async function getScopedUserById(scope: RuntimeScope, userId: string) {
  const storageScopeId = runtimeScopeStorageId(scope);
  const [row] = await db
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
    .where(and(eq(teamMembers.teamId, storageScopeId), eq(teamMembers.userId, userId)))
    .limit(1);

  return row ? scopedUserDto(row) : null;
}

export async function uploadCurrentUserAvatar(
  scope: RuntimeScope,
  userId: string,
  input: { body: Buffer; mimeType: string },
): Promise<UserAvatarMutationOutcome> {
  if (!input.body.byteLength) {
    return { status: "invalid" };
  }

  const currentUser = await getScopedUserById(scope, userId);
  if (!currentUser) {
    return { status: "notFound" };
  }

  const validation = validateImageUpload({ buffer: input.body, contentType: input.mimeType });
  if (validation.status !== "ok") {
    return { status: validation.status };
  }

  const updatedAt = nowIso();
  const objectKey = userAvatarObjectKey({
    extension: validation.metadata.extension,
    timestamp: updatedAt,
    userId,
  });
  const [previous] = await db
    .select({ avatarObjectKey: users.avatarObjectKey })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  await objectStorage.putObject({
    body: input.body,
    contentLength: input.body.byteLength,
    contentType: validation.metadata.mimeType,
    key: objectKey,
  });

  try {
    await db
      .update(users)
      .set({
        avatarObjectKey: objectKey,
        avatarMimeType: validation.metadata.mimeType,
        avatarUpdatedAt: updatedAt,
      })
      .where(eq(users.id, userId));
  } catch (error) {
    await objectStorage.deleteObject(objectKey).catch(() => undefined);
    throw error;
  }

  if (previous?.avatarObjectKey && previous.avatarObjectKey !== objectKey) {
    await objectStorage.deleteObject(previous.avatarObjectKey).catch(() => undefined);
  }

  const user = await getScopedUserById(scope, userId);
  return user ? { status: "ok", user } : { status: "notFound" };
}

export async function deleteCurrentUserAvatar(scope: RuntimeScope, userId: string): Promise<UserAvatarMutationOutcome> {
  const currentUser = await getScopedUserById(scope, userId);
  if (!currentUser) {
    return { status: "notFound" };
  }

  const [previous] = await db
    .select({ avatarObjectKey: users.avatarObjectKey })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  await db
    .update(users)
    .set({
      avatarObjectKey: null,
      avatarMimeType: null,
      avatarUpdatedAt: null,
    })
    .where(eq(users.id, userId));

  if (previous?.avatarObjectKey) {
    await objectStorage.deleteObject(previous.avatarObjectKey).catch(() => undefined);
  }

  const user = await getScopedUserById(scope, userId);
  return user ? { status: "ok", user } : { status: "notFound" };
}

export async function getUserAvatarFile(scope: RuntimeScope, userId: string): Promise<UserAvatarFileOutcome> {
  const storageScopeId = runtimeScopeStorageId(scope);
  const [row] = await db
    .select({
      avatarMimeType: users.avatarMimeType,
      avatarObjectKey: users.avatarObjectKey,
    })
    .from(teamMembers)
    .innerJoin(users, eq(teamMembers.userId, users.id))
    .where(and(eq(teamMembers.teamId, storageScopeId), eq(teamMembers.userId, userId)))
    .limit(1);

  if (!row?.avatarObjectKey || !row.avatarMimeType) {
    return { status: "notFound" };
  }

  const stored = await objectStorage.getObject(row.avatarObjectKey);
  if (!stored) {
    return { status: "notFound" };
  }

  return {
    status: "ok",
    body: stored.body,
    contentLength: stored.contentLength,
    contentType: row.avatarMimeType,
  };
}
