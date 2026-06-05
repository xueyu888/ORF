import type { FastifyInstance } from "fastify";
import { requireUserScopeContext } from "../auth/accessPolicy";
import { getCurrentUserAccessData } from "../readModels/currentUserAccessReadModel";

export function registerCurrentUserAccessRoutes(app: FastifyInstance) {
  app.get("/api/me/access", async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }

    return getCurrentUserAccessData(context.user, context.scope);
  });
}
