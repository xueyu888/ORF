import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAdminContext, requireAdminScope, requireApiUser } from "../auth/accessPolicy";
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

const userRoleSchema = z.enum(["admin", "member"]);
const userBodySchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  role: userRoleSchema,
});
const userParamsSchema = z.object({ userId: z.string().min(1) });

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
    const user = await requireApiUser(request, reply);
    if (!user) {
      return reply;
    }

    const activity = await recordUserOnlineActivity(user.id);
    return { ok: true, lastOnlineAt: activity.lastOnlineAt };
  });

  app.post("/api/users", async (request, reply) => {
    const context = await requireAdminContext(request, reply);
    if (!context) {
      return reply;
    }

    const body = userBodySchema.parse(request.body);
    return { users: await createScopedUser(context.scope, context.user.id, body) };
  });

  app.patch("/api/users/:userId", async (request, reply) => {
    const context = await requireAdminContext(request, reply);
    if (!context) {
      return reply;
    }

    const params = userParamsSchema.parse(request.params);
    const body = userBodySchema.parse(request.body);
    return { users: await updateScopedUser(context.scope, context.user.id, params.userId, body) };
  });

  app.patch("/api/users/:userId/disable", async (request, reply) => {
    const context = await requireAdminContext(request, reply);
    if (!context) {
      return reply;
    }

    const params = userParamsSchema.parse(request.params);
    return { users: await disableScopedUser(context.scope, context.user.id, params.userId) };
  });

  app.patch("/api/registration-requests/:userId/approve", async (request, reply) => {
    const context = await requireAdminContext(request, reply);
    if (!context) {
      return reply;
    }

    const params = userParamsSchema.parse(request.params);
    return { users: await approveRegistrationRequest(context.scope, params.userId) };
  });

  app.patch("/api/registration-requests/:userId/reject", async (request, reply) => {
    const context = await requireAdminContext(request, reply);
    if (!context) {
      return reply;
    }

    const params = userParamsSchema.parse(request.params);
    return { users: await rejectRegistrationRequest(context.scope, params.userId) };
  });

  app.delete("/api/users/:userId", async (request, reply) => {
    const context = await requireAdminContext(request, reply);
    if (!context) {
      return reply;
    }

    const params = userParamsSchema.parse(request.params);
    return { users: await deleteScopedUser(context.scope, context.user.id, params.userId) };
  });
}
