import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUserScopeContext } from "../auth/accessPolicy";
import {
  getUnreadNotificationCount,
  listNotificationsForUser,
  markAllNotificationsRead,
  markNotificationRead,
} from "../repositories/notificationRepository";

const notificationParamsSchema = z.object({ notificationId: z.string().min(1) });

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
}
