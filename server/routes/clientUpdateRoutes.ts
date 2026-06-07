import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { isClientReleaseVersion, normalizeReleaseVersion } from "../../src/features/client-updates/clientUpdateModel";
import { getCachedClientReleaseByVersion, getCachedLatestClientRelease } from "../clientUpdates/clientReleaseRepository";

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
}
