import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUserScopeContext } from "../auth/accessPolicy";
import {
  clearNotificationsForUser,
  deleteNotificationsForUser,
  getUnreadNotificationCount,
  listNotificationsForUser,
  markAllNotificationsRead,
  markNotificationRead,
} from "../repositories/notificationRepository";

const notificationParamsSchema = z.object({ notificationId: z.string().min(1) });
const notificationBulkDeleteBodySchema = z.object({
  notificationIds: z.array(z.string().min(1)).min(1).max(100),
});

export function registerNotificationRoutes(app: FastifyInstance) {
  app.get("/api/notifications", async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }

    return {
      notifications: await listNotificationsForUser(context.user.id, context.scope),
      unreadCount: await getUnreadNotificationCount(context.user.id, context.scope),
    };
  });

  app.patch("/api/notifications/:notificationId/read", async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }

    const params = notificationParamsSchema.parse(request.params);
    const notification = await markNotificationRead(params.notificationId, context.user.id, context.scope);
    if (!notification) {
      return reply.code(404).send({ error: "Notification not found" });
    }

    return {
      notification,
      unreadCount: await getUnreadNotificationCount(context.user.id, context.scope),
    };
  });

  app.patch("/api/notifications/read-all", async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }

    return {
      updated: await markAllNotificationsRead(context.user.id, context.scope),
      unreadCount: await getUnreadNotificationCount(context.user.id, context.scope),
    };
  });

  app.post("/api/notifications/bulk-delete", async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }

    const body = notificationBulkDeleteBodySchema.parse(request.body);
    return {
      deleted: await deleteNotificationsForUser(body.notificationIds, context.user.id, context.scope),
      unreadCount: await getUnreadNotificationCount(context.user.id, context.scope),
    };
  });

  app.delete("/api/notifications", async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }

    return {
      deleted: await clearNotificationsForUser(context.user.id, context.scope),
      unreadCount: await getUnreadNotificationCount(context.user.id, context.scope),
    };
  });
}
