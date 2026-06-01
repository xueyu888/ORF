import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAdminContext, requireAdminScope, requireUserScopeContext } from "../auth/accessPolicy";
import {
  approveRegistrationRequest,
  createScopedUser,
  deleteScopedUser,
  disableScopedUser,
  getRegistrationRequests,
  getScopedUsers,
  recordUserOnlineActivity,
  rejectRegistrationRequest,
  updateScopedUser,
} from "../repositories/userRepository";
import { runtimeScopeStorageId } from "../repositories/runtimeScope";
import { publishRealtimeReadModelInvalidation } from "../realtime/realtimeEventBus";

const userRoleSchema = z.enum(["admin", "member"]);
const userBodySchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  role: userRoleSchema,
});
const userParamsSchema = z.object({ userId: z.string().min(1) });

function publishUsersInvalidation(scope: Parameters<typeof runtimeScopeStorageId>[0], actorUserId?: string | null, targetUserId = "users") {
  publishRealtimeReadModelInvalidation(runtimeScopeStorageId(scope), {
    actorUserId,
    models: ["users", "taskManagement", "bountyHall"],
    reason: "user.changed",
    target: { id: targetUserId, type: "user" },
  });
}

export function registerUserRoutes(app: FastifyInstance) {
  app.get("/api/users", async (request, reply) => {
    const scope = await requireAdminScope(request, reply);
    if (!scope) {
      return reply;
    }

    return { users: await getScopedUsers(scope) };
  });

  app.get("/api/registration-requests", async (request, reply) => {
    const scope = await requireAdminScope(request, reply);
    if (!scope) {
      return reply;
    }

    return { users: await getRegistrationRequests(scope) };
  });

  app.post("/api/users/me/activity", async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }

    const activity = await recordUserOnlineActivity(context.user.id);
    if (activity.updated) {
      publishUsersInvalidation(context.scope, context.user.id, context.user.id);
    }
    return { ok: true, lastOnlineAt: activity.lastOnlineAt };
  });

  app.post("/api/users", async (request, reply) => {
    const context = await requireAdminContext(request, reply);
    if (!context) {
      return reply;
    }

    const body = userBodySchema.parse(request.body);
    const users = await createScopedUser(context.scope, context.user.id, body);
    publishUsersInvalidation(context.scope, context.user.id);
    return { users };
  });

  app.patch("/api/users/:userId", async (request, reply) => {
    const context = await requireAdminContext(request, reply);
    if (!context) {
      return reply;
    }

    const params = userParamsSchema.parse(request.params);
    const body = userBodySchema.parse(request.body);
    const users = await updateScopedUser(context.scope, context.user.id, params.userId, body);
    publishUsersInvalidation(context.scope, context.user.id, params.userId);
    return { users };
  });

  app.patch("/api/users/:userId/disable", async (request, reply) => {
    const context = await requireAdminContext(request, reply);
    if (!context) {
      return reply;
    }

    const params = userParamsSchema.parse(request.params);
    const users = await disableScopedUser(context.scope, context.user.id, params.userId);
    publishUsersInvalidation(context.scope, context.user.id, params.userId);
    return { users };
  });

  app.patch("/api/registration-requests/:userId/approve", async (request, reply) => {
    const context = await requireAdminContext(request, reply);
    if (!context) {
      return reply;
    }

    const params = userParamsSchema.parse(request.params);
    const users = await approveRegistrationRequest(context.scope, params.userId);
    publishUsersInvalidation(context.scope, context.user.id, params.userId);
    return { users };
  });

  app.patch("/api/registration-requests/:userId/reject", async (request, reply) => {
    const context = await requireAdminContext(request, reply);
    if (!context) {
      return reply;
    }

    const params = userParamsSchema.parse(request.params);
    const users = await rejectRegistrationRequest(context.scope, params.userId);
    publishUsersInvalidation(context.scope, context.user.id, params.userId);
    return { users };
  });

  app.delete("/api/users/:userId", async (request, reply) => {
    const context = await requireAdminContext(request, reply);
    if (!context) {
      return reply;
    }

    const params = userParamsSchema.parse(request.params);
    const users = await deleteScopedUser(context.scope, context.user.id, params.userId);
    publishUsersInvalidation(context.scope, context.user.id, params.userId);
    return { users };
  });
}
