import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  isClientReleaseVersion,
  normalizeReleaseVersion,
  selectClientUpdateAsset,
} from "../../src/features/client-updates/clientUpdateModel";
import { requireAdminContext } from "../auth/accessPolicy";
import { publishClientUpdateAnnouncement } from "../clientUpdates/clientUpdateAnnouncement";
import { getCachedClientReleaseByVersion, getCachedLatestClientRelease } from "../clientUpdates/clientReleaseRepository";
import { getDefaultRuntimeScope, runtimeScopeStorageId, type RuntimeScope } from "../repositories/runtimeScope";

const releaseVersionParamsSchema = z.object({
  version: z.string()
    .trim()
    .min(1)
    .transform(normalizeReleaseVersion)
    .refine(isClientReleaseVersion, { message: "Invalid client release version" }),
});

const releaseBroadcastBodySchema = z.object({
  version: z.string()
    .trim()
    .min(1)
    .transform(normalizeReleaseVersion)
    .refine(isClientReleaseVersion, { message: "Invalid client release version" }),
});

type ClientUpdateBroadcastRequest = FastifyRequest & { orfClientUpdateBroadcastAuthorized?: boolean };
type ClientUpdateBroadcastContext =
  | { kind: "machine"; scope: RuntimeScope }
  | ({ kind: "admin" } & NonNullable<Awaited<ReturnType<typeof requireAdminContext>>>);

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

  app.post("/api/client-updates/broadcast-release", async (request, reply) => {
    try {
      const context = await requireClientUpdateBroadcastContext(request as ClientUpdateBroadcastRequest, reply);
      if (!context) {
        return reply;
      }

      const body = releaseBroadcastBodySchema.parse(request.body);
      const { release } = await getCachedClientReleaseByVersion(body.version);
      if (!selectClientUpdateAsset(release.assets, "desktop-windows")) {
        return reply.code(409).send({ error: "Client release has no Win11 installer" });
      }

      const result = publishClientUpdateAnnouncement({
        mode: context.kind === "machine" ? "automatic" : "manual",
        release,
        teamId: runtimeScopeStorageId(context.scope),
      });
      request.log.info({
        actorUserId: context.kind === "admin" ? context.user.id : null,
        actorType: context.kind,
        onlineUserCount: result.onlineUserCount,
        releaseVersion: result.releaseVersion,
        skipped: result.skipped,
        teamId: runtimeScopeStorageId(context.scope),
      }, "Broadcast ORF client update announcement by release version");
      return {
        ok: true,
        ...result,
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: "Invalid client release version" });
      }
      request.log.warn({ error }, "Client update release broadcast failed");
      return reply.code(502).send({ error: "Client update release broadcast failed" });
    }
  });
}

async function requireClientUpdateBroadcastContext(
  request: ClientUpdateBroadcastRequest,
  reply: FastifyReply,
): Promise<ClientUpdateBroadcastContext | null> {
  if (request.orfClientUpdateBroadcastAuthorized) {
    const scope = await getDefaultRuntimeScope();
    if (!scope) {
      reply.code(404).send({ error: "Runtime scope not found" });
      return null;
    }
    return { kind: "machine", scope };
  }

  const context = await requireAdminContext(request, reply);
  return context ? { kind: "admin", ...context } : null;
}
