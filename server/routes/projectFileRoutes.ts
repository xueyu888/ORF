import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { PermissionKey } from "../../src/config/permissions";
import { requireUserScopeContext } from "../auth/accessPolicy";
import { env } from "../env";
import { getRolePermissionKeysForScope } from "../repositories/permissionRepository";
import {
  createProjectFolder,
  deleteProjectFileNode,
  getProjectFileBootstrap,
  getProjectFileContent,
  listProjectFileChildren,
  uploadProjectFile,
} from "../repositories/projectFileRepository";
import type { ChatActor } from "../repositories/chatRepository";

const channelIdParamsSchema = z.object({ channelId: z.string().min(1) });
const nodeParamsSchema = channelIdParamsSchema.extend({ nodeId: z.string().min(1) });
const projectFileParamsSchema = z.object({ fileId: z.string().min(1) });
const projectFileContentQuerySchema = z.object({
  disposition: z.enum(["attachment", "inline"]).optional(),
});
const createFolderBodySchema = z.object({
  name: z.string().trim().min(1).max(160),
  parentNodeId: z.string().min(1),
});
const uploadFieldsSchema = z.object({
  parentNodeId: z.string().min(1),
});

async function chatActorFromRequest(request: FastifyRequest, reply: FastifyReply): Promise<ChatActor | null> {
  const context = await requireUserScopeContext(request, reply);
  if (!context) {
    return null;
  }

  const permissions = context.user.role === "admin" ? [] : await getRolePermissionKeysForScope(context.scope, context.user.role);
  const has = (key: PermissionKey) => context.user.role === "admin" || permissions.includes(key);
  return {
    id: context.user.id,
    name: context.user.name,
    role: context.user.role,
    scope: context.scope,
    canRead: has("chat.read"),
    canWrite: has("chat.write"),
    canCreatePrivateChannel: has("chat.channel.create"),
    canCreatePublicChannel: has("chat.channel.manage"),
    canManageAnyChannel: has("chat.channel.manage"),
    canManageAnyMembers: has("chat.member.manage"),
  };
}

function sendProjectFileOutcome<T extends { status: string }>(reply: FastifyReply, outcome: T) {
  if (outcome.status === "notFound") return reply.code(404).send({ error: "Project file resource not found" });
  if (outcome.status === "forbidden") return reply.code(403).send({ error: "Forbidden" });
  if (outcome.status === "invalid") return reply.code(400).send({ error: "Invalid project file request" });
  if (outcome.status === "conflict") return reply.code(409).send({ error: "A file or folder with this name already exists" });
  if (outcome.status === "tooLarge") return reply.code(413).send({ error: "Project file is too large" });
  return outcome;
}

async function uploadProjectFileFromRequest(request: FastifyRequest, input: { actor: ChatActor; channelId: string }) {
  const fields: Record<string, string> = {};
  for await (const part of request.parts({ limits: { fields: 2, files: 1, fileSize: env.ORF_INFRA_UPLOAD_MAX_BYTES } })) {
    if (part.type === "field" && typeof part.value === "string") {
      fields[part.fieldname] = part.value;
      continue;
    }
    if (part.type === "file" && part.fieldname !== "file") {
      part.file.resume();
      continue;
    }
    if (part.type === "file" && part.fieldname === "file") {
      const parsed = uploadFieldsSchema.safeParse(fields);
      if (!parsed.success) {
        part.file.resume();
        return { status: "invalid" as const };
      }
      return uploadProjectFile({
        body: part.file,
        channelId: input.channelId,
        fileName: part.filename,
        mimeType: part.mimetype,
        parentNodeId: parsed.data.parentNodeId,
      }, input.actor);
    }
  }
  return null;
}

export function registerProjectFileRoutes(app: FastifyInstance) {
  app.get("/api/chat/channels/:channelId/project-files", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    const params = channelIdParamsSchema.parse(request.params);
    return sendProjectFileOutcome(reply, await getProjectFileBootstrap(params.channelId, actor));
  });

  app.get("/api/chat/channels/:channelId/project-files/nodes/:nodeId/children", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    const params = nodeParamsSchema.parse(request.params);
    return sendProjectFileOutcome(reply, await listProjectFileChildren({
      channelId: params.channelId,
      parentNodeId: params.nodeId,
    }, actor));
  });

  app.post("/api/chat/channels/:channelId/project-files/folders", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    const params = channelIdParamsSchema.parse(request.params);
    const body = createFolderBodySchema.parse(request.body);
    return sendProjectFileOutcome(reply, await createProjectFolder({
      channelId: params.channelId,
      name: body.name,
      parentNodeId: body.parentNodeId,
    }, actor));
  });

  app.post("/api/chat/channels/:channelId/project-files/upload", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    const params = channelIdParamsSchema.parse(request.params);
    const outcome = await uploadProjectFileFromRequest(request, { actor, channelId: params.channelId });
    if (!outcome) return reply.code(400).send({ error: "File is required" });
    return sendProjectFileOutcome(reply, outcome);
  });

  app.delete("/api/chat/channels/:channelId/project-files/nodes/:nodeId", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    const params = nodeParamsSchema.parse(request.params);
    return sendProjectFileOutcome(reply, await deleteProjectFileNode({
      channelId: params.channelId,
      nodeId: params.nodeId,
    }, actor));
  });

  app.get("/api/project-files/:fileId/content", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    const params = projectFileParamsSchema.parse(request.params);
    const query = projectFileContentQuerySchema.parse(request.query);
    const outcome = await getProjectFileContent(params.fileId, actor, query);
    if (outcome.status === "notFound") return reply.code(404).send({ error: "Project file not found" });
    if (outcome.status === "forbidden") return reply.code(403).send({ error: "Forbidden" });
    reply.header("Cache-Control", "private, max-age=60");
    reply.header("Content-Disposition", contentDispositionHeader(outcome.contentDisposition, outcome.fileName));
    reply.header("Content-Type", outcome.contentType);
    reply.header("X-Content-Type-Options", "nosniff");
    if (outcome.contentLength !== undefined) {
      reply.header("Content-Length", outcome.contentLength);
    }
    return reply.send(outcome.body);
  });
}

function contentDispositionHeader(disposition: "attachment" | "inline", fileName: string) {
  const fallback = (fileName || "project-file")
    .replace(/["\\\r\n]/g, "_")
    .replace(/[^\x20-\x7e]/g, "_")
    .trim() || "project-file";
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName || "project-file")}`;
}
