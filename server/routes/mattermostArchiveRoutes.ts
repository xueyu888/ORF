import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAdminContext } from "../auth/accessPolicy";
import {
  getMattermostArchiveFileContent,
  getMattermostArchiveViewerData,
} from "../repositories/mattermostArchiveReadRepository";

const booleanQuerySchema = z.union([z.boolean(), z.literal("true"), z.literal("false")]).optional();
const archiveViewerQuerySchema = z.object({
  channelId: z.string().trim().min(1).optional(),
  includeDeleted: booleanQuerySchema.transform((value) => value === undefined || value === true || value === "true"),
  limit: z.coerce.number().int().min(1).max(200).default(80),
  page: z.coerce.number().int().min(1).default(1),
  q: z.string().trim().max(200).optional().default(""),
});
const archiveFileParamsSchema = z.object({ fileId: z.string().min(1) });

export function registerMattermostArchiveRoutes(app: FastifyInstance) {
  app.get("/api/mattermost-archive", async (request, reply) => {
    const context = await requireAdminContext(request, reply);
    if (!context) {
      return reply;
    }

    const query = archiveViewerQuerySchema.parse(request.query);
    return getMattermostArchiveViewerData(query);
  });

  app.get("/api/mattermost-archive/files/:fileId/content", async (request, reply) => {
    const context = await requireAdminContext(request, reply);
    if (!context) {
      return reply;
    }

    const params = archiveFileParamsSchema.parse(request.params);
    const outcome = await getMattermostArchiveFileContent(params.fileId);
    if (outcome.status === "notFound") {
      return reply.code(404).send({ error: "Mattermost archive file not found" });
    }
    if (outcome.status === "notPreviewable") {
      return reply.code(415).send({ error: "Mattermost archive file is not previewable" });
    }

    reply.header("Cache-Control", "private, max-age=300");
    reply.header("Content-Disposition", `inline; filename="${safeContentDispositionName(outcome.fileName)}"`);
    reply.header("Content-Type", outcome.contentType);
    if (outcome.contentLength !== undefined) {
      reply.header("Content-Length", outcome.contentLength);
    }
    return reply.send(outcome.body);
  });
}

function safeContentDispositionName(fileName: string) {
  return (fileName.trim() || "mattermost-archive-image").replace(/["\\\r\n]/g, "_");
}
