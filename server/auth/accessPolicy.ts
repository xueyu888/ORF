import type { FastifyReply, FastifyRequest } from "fastify";
import type { PermissionKey } from "../../src/config/permissions";
import { canEditObjectiveContentForUser } from "../../src/domain/orfObjectiveContent";
import {
  authResolutionLogContext,
  authResolutionShouldLog,
  resolveAuthenticatedOrfUser,
  sendAuthResolutionFailure,
} from "./sessionResolution";
import {
  getRolePermissionKeysForScope,
  getPermissionRulesForScope,
  hasRolePermission,
} from "../repositories/permissionRepository";
import {
  canEditResultDuringReestimate,
  canMutateObjectiveWorkItem,
  resolveObjectiveIdForWorkItem,
  resolveRuntimeScopeForFeedback,
  resolveRuntimeScopeForWorkItem,
} from "../access/orfTargetAccess";
import { getDefaultRuntimeScopeForUser, runtimeScopeStorageId, type RuntimeScope } from "../repositories/runtimeScope";

export type AuthenticatedOrfUser = Extract<Awaited<ReturnType<typeof resolveAuthenticatedOrfUser>>, { status: "authenticated" }>["user"];
type RequestWithOrfUser = FastifyRequest & { orfUser?: AuthenticatedOrfUser | null };

async function getRequestOrfUser(request: FastifyRequest, reply: FastifyReply, logMessage: string) {
  const requestWithUser = request as RequestWithOrfUser;
  if (requestWithUser.orfUser !== undefined) {
    return requestWithUser.orfUser;
  }

  const resolution = await resolveAuthenticatedOrfUser(request.headers.cookie);
  if (resolution.status === "authenticated") {
    requestWithUser.orfUser = resolution.user;
    return resolution.user;
  }

  if (resolution.status === "anonymous") {
    requestWithUser.orfUser = null;
    return null;
  }

  if (authResolutionShouldLog(resolution)) {
    request.log.warn(authResolutionLogContext(resolution), logMessage);
  }
  sendAuthResolutionFailure(reply, resolution);
  return undefined;
}

export async function requireApiUser(request: FastifyRequest, reply: FastifyReply) {
  const user = await getRequestOrfUser(request, reply, "Ory API session check failed");

  if (user === undefined) {
    return null;
  }

  if (!user) {
    reply.code(401).send({ error: "Unauthorized" });
    return null;
  }

  if (user.status !== "active") {
    reply.code(403).send({ error: "User is not approved", status: user.status });
    return null;
  }

  return user;
}

export async function requireAdminUser(request: FastifyRequest, reply: FastifyReply) {
  const user = await requireApiUser(request, reply);
  if (!user) {
    return null;
  }

  if (user.role !== "admin") {
    reply.code(403).send({ error: "Forbidden" });
    return null;
  }

  return user;
}

export async function requireUserScopeContext(request: FastifyRequest, reply: FastifyReply) {
  const user = await requireApiUser(request, reply);
  if (!user) {
    return null;
  }

  const scope = await getDefaultRuntimeScopeForUser(user.id);
  if (!scope) {
    reply.code(404).send({ error: "Runtime scope not found" });
    return null;
  }

  return { user, scope };
}

export async function requireAdminScope(request: FastifyRequest, reply: FastifyReply) {
  const user = await requireAdminUser(request, reply);
  if (!user) {
    return null;
  }

  const scope = await getDefaultRuntimeScopeForUser(user.id);
  if (!scope) {
    reply.code(404).send({ error: "Runtime scope not found" });
    return null;
  }

  return scope;
}

export async function requireAdminContext(request: FastifyRequest, reply: FastifyReply) {
  const user = await requireAdminUser(request, reply);
  if (!user) {
    return null;
  }

  const scope = await getDefaultRuntimeScopeForUser(user.id);
  if (!scope) {
    reply.code(404).send({ error: "Runtime scope not found" });
    return null;
  }

  return { user, scope };
}

export async function requireWriteContext(
  request: FastifyRequest,
  reply: FastifyReply,
  permission: PermissionKey,
) {
  const context = await requireUserScopeContext(request, reply);
  if (!context) {
    return null;
  }
  const { user, scope } = context;

  if (user.role === "admin") {
    return context;
  }

  const permissionRules = await getPermissionRulesForScope(scope);
  const allowed = hasRolePermission(user.role, permissionRules, permission);

  if (!allowed) {
    reply.code(403).send({ error: "Forbidden" });
    return null;
  }

  return context;
}

export async function requireObjectiveContentEditContext(request: FastifyRequest, reply: FastifyReply) {
  const context = await requireUserScopeContext(request, reply);
  if (!context) {
    return null;
  }

  if (!canEditObjectiveContentForUser(context.user)) {
    reply.code(403).send({ error: "Forbidden" });
    return null;
  }

  return context;
}

export async function requireTargetInScope(
  reply: FastifyReply,
  target: Parameters<typeof resolveRuntimeScopeForWorkItem>[0],
  scope: RuntimeScope,
  message = "Work item not found",
) {
  const targetScope = await resolveRuntimeScopeForWorkItem(target);
  if (!targetScope || runtimeScopeStorageId(targetScope) !== runtimeScopeStorageId(scope)) {
    reply.code(404).send({ error: message });
    return false;
  }

  return true;
}

export async function requireFeedbackInScope(reply: FastifyReply, feedbackId: string, scope: RuntimeScope) {
  const targetScope = await resolveRuntimeScopeForFeedback(feedbackId);
  if (!targetScope || runtimeScopeStorageId(targetScope) !== runtimeScopeStorageId(scope)) {
    reply.code(404).send({ error: "Feedback not found" });
    return false;
  }

  return true;
}

async function requireResultMutationContext(
  request: FastifyRequest,
  reply: FastifyReply,
  resultId: string,
  permission: Extract<PermissionKey, "result.edit" | "result.delete">,
) {
  const context = await requireUserScopeContext(request, reply);
  if (!context) {
    return null;
  }
  const { user, scope } = context;

  if (!(await requireTargetInScope(reply, { type: "result", id: resultId }, scope, "Result not found"))) {
    return null;
  }

  if (user.role === "admin") {
    return { user, scope };
  }

  const permissionRules = await getPermissionRulesForScope(scope);
  const allowedByRole = hasRolePermission(user.role, permissionRules, permission);
  const allowedByReestimate = await canEditResultDuringReestimate(resultId, user.id);
  if (!allowedByRole && !allowedByReestimate) {
    reply.code(403).send({ error: "Forbidden" });
    return null;
  }

  return { user, scope };
}

export function requireResultEditContext(request: FastifyRequest, reply: FastifyReply, resultId: string) {
  return requireResultMutationContext(request, reply, resultId, "result.edit");
}

export function requireResultDeleteContext(request: FastifyRequest, reply: FastifyReply, resultId: string) {
  return requireResultMutationContext(request, reply, resultId, "result.delete");
}

export async function authorizeObjectiveWorkItemMutation(
  user: Awaited<ReturnType<typeof requireApiUser>>,
  reply: FastifyReply,
  objectiveId: string,
) {
  if (!user) {
    return false;
  }

  const scope = await getDefaultRuntimeScopeForUser(user.id);
  if (!scope) {
    reply.code(404).send({ error: "Runtime scope not found" });
    return false;
  }

  const targetScope = await resolveRuntimeScopeForWorkItem({ type: "objective", id: objectiveId });
  if (!targetScope || runtimeScopeStorageId(targetScope) !== runtimeScopeStorageId(scope)) {
    reply.code(404).send({ error: "Objective not found" });
    return false;
  }

  const access = await canMutateObjectiveWorkItem({ ...user, scope }, objectiveId);
  if (access === "notFound") {
    reply.code(404).send({ error: "Objective not found" });
    return false;
  }
  if (access === "forbidden") {
    reply.code(403).send({ error: "Forbidden" });
    return false;
  }

  return true;
}

export async function requireObjectiveWorkItemMutation(request: FastifyRequest, reply: FastifyReply, objectiveId: string) {
  const user = await requireApiUser(request, reply);
  if (!user) {
    return null;
  }

  return (await authorizeObjectiveWorkItemMutation(user, reply, objectiveId)) ? user : null;
}

export async function requireWorkItemTargetMutation(
  request: FastifyRequest,
  reply: FastifyReply,
  target: Parameters<typeof resolveObjectiveIdForWorkItem>[0],
) {
  const objectiveId = await resolveObjectiveIdForWorkItem(target);
  if (!objectiveId) {
    reply.code(404).send({ error: "Work item not found" });
    return null;
  }

  return requireObjectiveWorkItemMutation(request, reply, objectiveId);
}

export async function commentActorWithPermissions(request: FastifyRequest, reply: FastifyReply) {
  const context = await requireUserScopeContext(request, reply);
  if (!context) {
    return null;
  }
  const { user, scope } = context;

  if (user.role === "admin") {
    return { ...user, scope, canManageAllComments: true };
  }

  const permissions = await getRolePermissionKeysForScope(scope, user.role);
  return { ...user, scope, canManageAllComments: permissions.includes("comment.manage") };
}
