import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  isClientReleaseVersion,
  isTrustedClientUpdateUrl,
  normalizeReleaseVersion,
  resolveClientUpdateReceiptStage,
  selectClientUpdateAsset,
  type ClientReleaseInfo,
} from "../../src/features/client-updates/clientUpdateModel";
import { requireAdminContext, requireUserScopeContext } from "../auth/accessPolicy";
import { publishClientUpdateAnnouncement } from "../clientUpdates/clientUpdateAnnouncement";
import { clearClientReleaseCache, getCachedClientReleaseByVersion, getCachedLatestClientRelease } from "../clientUpdates/clientReleaseRepository";
import {
  getClientUpdateCoverage,
  recordClientUpdateReceipt,
} from "../clientUpdates/clientUpdateReceiptRepository";
import {
  buildClientUpdateAssetDownloadUrl,
  getStoredClientUpdateAsset,
  isClientUpdateAssetFileName,
  storeClientUpdateAssetFile,
  upsertStoredClientUpdateRelease,
} from "../clientUpdates/clientUpdateAssetStore";
import { env } from "../env";
import {
  byteRangeSelectionFromRequest,
  sendByteRangeNotSatisfiable,
  sendRangedContent,
} from "../http/rangedContentResponse";
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
const releaseManifestBodySchema = z.object({
  release: z.object({
    assets: z.array(z.object({
      contentType: z.string().trim().min(1).nullable().optional(),
      downloadUrl: z.string().trim().url().nullable().optional(),
      mirrorDownloadUrl: z.string().trim().url().nullable().optional(),
      name: z.string().trim().min(1).refine(isClientUpdateAssetFileName, { message: "Invalid client update asset file name" }),
      size: z.number().int().nonnegative().nullable().optional(),
    })).min(1),
    body: z.string().nullable().optional(),
    htmlUrl: z.string().trim().url(),
    isDraft: z.boolean(),
    isPrerelease: z.boolean(),
    name: z.string().nullable().optional(),
    publishedAt: z.string().nullable().optional(),
    tagName: z.string()
      .trim()
      .min(1)
      .transform(normalizeReleaseVersion)
      .refine(isClientReleaseVersion, { message: "Invalid client release version" }),
    version: z.string()
      .trim()
      .min(1)
      .transform(normalizeReleaseVersion)
      .refine(isClientReleaseVersion, { message: "Invalid client release version" }),
  }),
});
const releaseAssetParamsSchema = z.object({
  fileName: z.string().trim().min(1).refine(isClientUpdateAssetFileName, { message: "Invalid client update asset file name" }),
  version: z.string()
    .trim()
    .min(1)
    .transform(normalizeReleaseVersion)
    .refine(isClientReleaseVersion, { message: "Invalid client release version" }),
});
const clientUpdateReceiptBodySchema = z.object({
  currentVersion: z.string()
    .trim()
    .min(1)
    .transform(normalizeReleaseVersion)
    .refine(isClientReleaseVersion, { message: "Invalid current client version" }),
  platform: z.enum(["android", "desktop-windows"]),
  stage: z.enum(["checked", "prompted", "install_started", "activated"]),
});

type ClientUpdateBroadcastRequest = FastifyRequest & { orfClientUpdateBroadcastAuthorized?: boolean };
type ClientUpdateAssetPublishRequest = FastifyRequest & { orfClientUpdatePublishAuthorized?: boolean };
type ClientUpdateBroadcastContext =
  | { kind: "machine"; scope: RuntimeScope }
  | ({ kind: "admin" } & NonNullable<Awaited<ReturnType<typeof requireAdminContext>>>);

export function registerClientUpdateRoutes(app: FastifyInstance) {
  app.get("/api/client-updates/assets/:version/:fileName", async (request, reply) => {
    try {
      const params = releaseAssetParamsSchema.parse(request.params);
      const storedAsset = await getStoredClientUpdateAsset(params, {
        byteRange: byteRangeSelectionFromRequest(request),
      });
      if (storedAsset?.status === "rangeNotSatisfiable") {
        return sendByteRangeNotSatisfiable(reply, storedAsset.totalContentLength);
      }
      if (storedAsset?.status === "ok") {
        return sendRangedContent(reply, {
          body: storedAsset.stream,
          cacheControl: "public, max-age=31536000, immutable",
          contentDisposition: `attachment; filename="${params.fileName.replace(/"/g, "")}"`,
          contentLength: storedAsset.contentLength,
          contentType: storedAsset.contentType,
          range: storedAsset.range,
          totalContentLength: storedAsset.totalContentLength,
          xContentTypeOptions: "nosniff",
        });
      }

      const { release } = await getCachedClientReleaseByVersion(params.version);
      const asset = release.assets.find((candidate) => candidate.name === params.fileName) ?? null;
      if (!asset) {
        return reply.code(404).send({ error: "Client update asset not found" });
      }
      if (asset.mirrorDownloadUrl && isTrustedClientUpdateUrl(asset.mirrorDownloadUrl)) {
        return reply.redirect(asset.mirrorDownloadUrl, 302);
      }
      return reply.code(404).send({ error: "Client update asset not stored" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: "Invalid client update asset" });
      }
      request.log.warn({ error }, "Client update asset download failed");
      return reply.code(502).send({ error: "Client update asset download failed" });
    }
  });

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

  app.post("/api/client-updates/releases/:version/receipt", async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) return reply;

    try {
      const { version } = releaseVersionParamsSchema.parse(request.params);
      const body = clientUpdateReceiptBodySchema.parse(request.body);
      await getCachedClientReleaseByVersion(version);
      const stage = resolveClientUpdateReceiptStage({
        currentVersion: body.currentVersion,
        releaseVersion: version,
        stage: body.stage,
      });
      if (!stage) {
        return reply.code(409).send({ error: "Current client version cannot activate this release" });
      }
      await recordClientUpdateReceipt({
        currentVersion: body.currentVersion,
        platform: body.platform,
        releaseVersion: version,
        stage,
        teamId: runtimeScopeStorageId(context.scope),
        userId: context.user.id,
      });
      return { ok: true };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: "Invalid client update receipt" });
      }
      request.log.warn({ error }, "Client update receipt write failed");
      return reply.code(502).send({ error: "Client update receipt write failed" });
    }
  });

  app.get("/api/client-updates/releases/:version/coverage", async (request, reply) => {
    const context = await requireAdminContext(request, reply);
    if (!context) return reply;

    try {
      const { version } = releaseVersionParamsSchema.parse(request.params);
      await getCachedClientReleaseByVersion(version);
      return {
        coverage: await getClientUpdateCoverage(runtimeScopeStorageId(context.scope), version),
        releaseVersion: version,
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: "Invalid client release version" });
      }
      request.log.warn({ error }, "Client update coverage read failed");
      return reply.code(502).send({ error: "Client update coverage read failed" });
    }
  });

  app.put("/api/client-updates/releases/:version/manifest", async (request, reply) => {
    if (!(request as ClientUpdateAssetPublishRequest).orfClientUpdatePublishAuthorized) {
      return reply.code(401).send({ error: "Unauthorized" });
    }

    try {
      const { version } = releaseVersionParamsSchema.parse(request.params);
      const body = releaseManifestBodySchema.parse(request.body);
      if (body.release.version !== version || body.release.tagName !== version) {
        return reply.code(409).send({ error: "Client release manifest version mismatch" });
      }

      const release = toPublishedClientUpdateRelease(body.release);
      const storedRelease = await upsertStoredClientUpdateRelease(release);
      clearClientReleaseCache(version);
      return { ok: true, release: storedRelease };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: "Invalid client release manifest" });
      }
      request.log.warn({ error }, "Client update release manifest publish failed");
      return reply.code(502).send({ error: "Client update release manifest publish failed" });
    }
  });

  app.post("/api/client-updates/assets/:version/:fileName", async (request, reply) => {
    if (!(request as ClientUpdateAssetPublishRequest).orfClientUpdatePublishAuthorized) {
      return reply.code(401).send({ error: "Unauthorized" });
    }

    try {
      const params = releaseAssetParamsSchema.parse(request.params);
      const outcome = await storeClientUpdateAssetUpload(request, params);
      if (outcome.status === "missing") {
        return reply.code(400).send({ error: "Client update asset file is required" });
      }
      if (outcome.status === "fileNameMismatch") {
        return reply.code(409).send({ error: "Client update asset file name mismatch" });
      }
      return {
        contentLength: outcome.contentLength,
        downloadUrl: buildClientUpdateAssetDownloadUrl(params.version, params.fileName),
        ok: true,
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: "Invalid client update asset" });
      }
      request.log.warn({ error }, "Client update asset publish failed");
      return reply.code(502).send({ error: "Client update asset publish failed" });
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

      const teamId = runtimeScopeStorageId(context.scope);
      const result = publishClientUpdateAnnouncement({
        release,
        teamId,
      });
      const coverage = await getClientUpdateCoverage(teamId, result.releaseVersion);
      request.log.info({
        actorUserId: context.user.id,
        coverage,
        realtimeRecipientUserCount: result.realtimeRecipientUserCount,
        releaseVersion: result.releaseVersion,
        teamId,
      }, "Broadcast ORF client update announcement by admin request");
      return {
        ok: true,
        ...result,
        coverage,
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

      const teamId = runtimeScopeStorageId(context.scope);
      const result = publishClientUpdateAnnouncement({
        mode: context.kind === "machine" ? "automatic" : "manual",
        release,
        teamId,
      });
      const coverage = await getClientUpdateCoverage(teamId, result.releaseVersion);
      request.log.info({
        actorUserId: context.kind === "admin" ? context.user.id : null,
        actorType: context.kind,
        coverage,
        realtimeRecipientUserCount: result.realtimeRecipientUserCount,
        releaseVersion: result.releaseVersion,
        skipped: result.skipped,
        teamId,
      }, "Broadcast ORF client update announcement by release version");
      return {
        ok: true,
        ...result,
        coverage,
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

async function storeClientUpdateAssetUpload(
  request: FastifyRequest,
  params: z.infer<typeof releaseAssetParamsSchema>,
): Promise<
  | { status: "fileNameMismatch" }
  | { status: "missing" }
  | { contentLength: number; status: "ok" }
> {
  for await (const part of request.parts({ limits: { fileSize: env.ORF_INFRA_UPLOAD_MAX_BYTES, files: 1 } })) {
    if (part.type !== "file") continue;
    if (part.fieldname !== "file") {
      part.file.resume();
      continue;
    }
    if (part.filename !== params.fileName) {
      part.file.resume();
      return { status: "fileNameMismatch" };
    }
    const stored = await storeClientUpdateAssetFile({
      body: part.file,
      fileName: params.fileName,
      version: params.version,
    });
    return { contentLength: stored.contentLength, status: "ok" };
  }
  return { status: "missing" };
}

function toPublishedClientUpdateRelease(release: z.infer<typeof releaseManifestBodySchema>["release"]): ClientReleaseInfo {
  return {
    assets: release.assets.map((asset) => ({
      contentType: asset.contentType ?? null,
      downloadUrl: asset.downloadUrl ?? buildClientUpdateAssetDownloadUrl(release.version, asset.name),
      mirrorDownloadUrl: asset.mirrorDownloadUrl ?? null,
      name: asset.name,
      size: asset.size ?? null,
    })),
    body: release.body ?? null,
    htmlUrl: release.htmlUrl,
    isDraft: release.isDraft,
    isPrerelease: release.isPrerelease,
    name: release.name ?? null,
    publishedAt: release.publishedAt ?? null,
    tagName: `v${release.version}`,
    version: release.version,
  };
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
