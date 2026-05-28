import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAdminContext, requireApiUser } from "../auth/accessPolicy";
import {
  getBountyHallData,
  getMyChallengesData,
  getOrfStateSnapshot,
  getTaskManagementData,
} from "../repositories/orfRepository";
import { getDefaultRuntimeScopeForUser } from "../repositories/runtimeScope";

const myChallengesQuerySchema = z.object({
  scope: z.enum(["mine", "all"]).default("mine"),
});

export function registerOrfReadRoutes(app: FastifyInstance) {
  app.get("/api/tasks-page", async (request, reply) => {
    const user = await requireApiUser(request, reply);
    if (!user) {
      return reply;
    }

    const scope = await getDefaultRuntimeScopeForUser(user.id);
    if (!scope) {
      return reply.code(404).send({ error: "Runtime scope not found" });
    }

    return user.role === "admin"
      ? getTaskManagementData({ scope })
      : getMyChallengesData(user.name, false, { scope });
  });

  app.get("/api/bounties", async (request, reply) => {
    const user = await requireApiUser(request, reply);
    if (!user) {
      return reply;
    }

    const scope = await getDefaultRuntimeScopeForUser(user.id);
    if (!scope) {
      return reply.code(404).send({ error: "Runtime scope not found" });
    }

    return getBountyHallData(user.name, { scope }, user.role);
  });

  app.get("/api/my-challenges", async (request, reply) => {
    const user = await requireApiUser(request, reply);
    if (!user) {
      return reply;
    }

    const scope = await getDefaultRuntimeScopeForUser(user.id);
    if (!scope) {
      return reply.code(404).send({ error: "Runtime scope not found" });
    }

    const query = myChallengesQuerySchema.parse(request.query);
    if (query.scope === "all" && user.role !== "admin") {
      return reply.code(403).send({ error: "Forbidden" });
    }

    return getMyChallengesData(user.name, query.scope === "all", { scope });
  });

  app.get("/api/orf-state", async (request, reply) => {
    const context = await requireAdminContext(request, reply);
    if (!context) {
      return reply;
    }

    return getOrfStateSnapshot({ scope: context.scope });
  });
}
