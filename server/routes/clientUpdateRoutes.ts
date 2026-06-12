import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  isClientReleaseVersion,
  normalizeReleaseVersion,
  selectClientUpdateAsset,
} from "../../src/features/client-updates/clientUpdateModel";
import { requireAdminContext } from "../auth/accessPolicy";
import { publishClientUpdateAnnouncement } from "../clientUpdates/clientUpdateAnnouncement";
import { getCachedClientReleaseByVersion, getCachedLatestClientRelease } from "../clientUpdates/clientReleaseRepository";
import { runtimeScopeStorageId } from "../repositories/runtimeScope";

const releaseVersionParamsSchema = z.object({
  version: z.string()
    .trim()
    .min(1)
    .transform(normalizeReleaseVersion)
    .refine(isClientReleaseVersion, { message: "Invalid client release version" }),
});

export function registerClientUpdateRoutes(app: FastifyInstance) {
  app.get("/api/client-updates/latest", async (_request, reply) => {
    try {
      return await getCachedLatestClientRelease();
    } catch (error) {
      app.log.warn({ error }, "Client update release check failed");
      return reply.code(502).send({ error: "Client update release check failed" });
    }
  });

  app.get("/api/client-updates/releases/:version", async (request, reply) => {
    try {
      const { version } = releaseVersionParamsSchema.parse(request.params);
      return await getCachedClientReleaseByVersion(version);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: "Invalid client release version" });
      }
      app.log.warn({ error }, "Client update release lookup failed");
      return reply.code(502).send({ error: "Client update release lookup failed" });
    }
  });

  app.post("/api/client-updates/broadcast-latest", async (request, reply) => {
    const context = await requireAdminContext(request, reply);
    if (!context) {
      return reply;
    }

    try {
      const { release } = await getCachedLatestClientRelease();
      if (!selectClientUpdateAsset(release.assets, "desktop-windows")) {
        return reply.code(409).send({ error: "Latest client release has no Win11 installer" });
      }

      const result = publishClientUpdateAnnouncement({
        release,
        teamId: runtimeScopeStorageId(context.scope),
      });
      request.log.info({
        actorUserId: context.user.id,
        onlineUserCount: result.onlineUserCount,
        releaseVersion: result.releaseVersion,
        teamId: runtimeScopeStorageId(context.scope),
      }, "Broadcast ORF client update announcement by admin request");
      return {
        ok: true,
        ...result,
      };
    } catch (error) {
      request.log.warn({ error }, "Client update release broadcast failed");
      return reply.code(502).send({ error: "Client update release broadcast failed" });
    }
  });
}
