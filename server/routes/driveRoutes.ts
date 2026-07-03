import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { PermissionKey } from "../../src/config/permissions";
import { requireUserScopeContext } from "../auth/accessPolicy";
import { env } from "../env";
import { getRolePermissionKeysForScope } from "../repositories/permissionRepository";
import {
  addChatDriveLink,
  createDriveFolder,
  deleteDriveNode,
  deleteChatDriveLink,
  getChatDriveBootstrap,
  getDriveBootstrap,
  getDriveFileContent,
  listDriveChildren,
  updateChatDriveLink,
  uploadDriveFile,
} from "../repositories/driveRepository";
import type { ChatActor } from "../repositories/chatRepository";

const channelIdParamsSchema = z.object({ channelId: z.string().min(1) });
const nodeParamsSchema = z.object({ nodeId: z.string().min(1) });
const channelLinkParamsSchema = channelIdParamsSchema.extend({ linkId: z.string().min(1) });
const driveFileParamsSchema = z.object({ fileId: z.string().min(1) });
const driveContentQuerySchema = z.object({
  disposition: z.enum(["attachment", "inline"]).optional(),
});
const createFolderBodySchema = z.object({
  name: z.string().trim().min(1).max(160),
  parentNodeId: z.string().min(1),
});
const uploadFieldsSchema = z.object({
  parentNodeId: z.string().min(1),
});
const chatDriveLinkBodySchema = z.object({
  isDefaultUploadTarget: z.boolean().optional(),
  label: z.string().trim().max(160).optional().nullable(),
  nodeId: z.string().min(1),
});
const chatDriveLinkPatchBodySchema = z.object({
  isDefaultUploadTarget: z.boolean().optional(),
  label: z.string().trim().max(160).optional().nullable(),
}).refine((value) => value.isDefaultUploadTarget !== undefined || value.label !== undefined, {
  message: "At least one field is required",
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

function sendDriveOutcome<T extends { status: string }>(reply: FastifyReply, outcome: T) {
  if (outcome.status === "notFound") return reply.code(404).send({ error: "Drive resource not found" });
  if (outcome.status === "forbidden") return reply.code(403).send({ error: "Forbidden" });
  if (outcome.status === "invalid") return reply.code(400).send({ error: "Invalid drive request" });
  if (outcome.status === "conflict") return reply.code(409).send({ error: "A file or folder with this name already exists" });
  if (outcome.status === "tooLarge") return reply.code(413).send({ error: "Drive file is too large" });
  return outcome;
}

async function uploadDriveFromRequest(request: FastifyRequest, input: { actor: ChatActor; channelId?: string | null }) {
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
      return uploadDriveFile({
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

export function registerDriveRoutes(app: FastifyInstance) {
  app.get("/api/drive", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    return sendDriveOutcome(reply, await getDriveBootstrap(actor));
  });

  app.get("/api/drive/nodes/:nodeId/children", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    const params = nodeParamsSchema.parse(request.params);
    return sendDriveOutcome(reply, await listDriveChildren({ parentNodeId: params.nodeId }, actor));
  });

  app.post("/api/drive/folders", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    const body = createFolderBodySchema.parse(request.body);
    return sendDriveOutcome(reply, await createDriveFolder({
      name: body.name,
      parentNodeId: body.parentNodeId,
    }, actor));
  });

  app.post("/api/drive/upload", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    const outcome = await uploadDriveFromRequest(request, { actor });
    if (!outcome) return reply.code(400).send({ error: "File is required" });
    return sendDriveOutcome(reply, outcome);
  });

  app.delete("/api/drive/nodes/:nodeId", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    const params = nodeParamsSchema.parse(request.params);
    return sendDriveOutcome(reply, await deleteDriveNode({ nodeId: params.nodeId }, actor));
  });

  app.get("/api/chat/channels/:channelId/drive", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    const params = channelIdParamsSchema.parse(request.params);
    return sendDriveOutcome(reply, await getChatDriveBootstrap(params.channelId, actor));
  });

  app.post("/api/chat/channels/:channelId/drive/links", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    const params = channelIdParamsSchema.parse(request.params);
    const body = chatDriveLinkBodySchema.parse(request.body);
    return sendDriveOutcome(reply, await addChatDriveLink({
      channelId: params.channelId,
      isDefaultUploadTarget: body.isDefaultUploadTarget,
      label: body.label,
      nodeId: body.nodeId,
    }, actor));
  });

  app.patch("/api/chat/channels/:channelId/drive/links/:linkId", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    const params = channelLinkParamsSchema.parse(request.params);
    const body = chatDriveLinkPatchBodySchema.parse(request.body);
    return sendDriveOutcome(reply, await updateChatDriveLink({
      channelId: params.channelId,
      isDefaultUploadTarget: body.isDefaultUploadTarget,
      label: body.label,
      linkId: params.linkId,
    }, actor));
  });

  app.delete("/api/chat/channels/:channelId/drive/links/:linkId", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    const params = channelLinkParamsSchema.parse(request.params);
    return sendDriveOutcome(reply, await deleteChatDriveLink({
      channelId: params.channelId,
      linkId: params.linkId,
    }, actor));
  });

  app.post("/api/chat/channels/:channelId/drive/upload", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    const params = channelIdParamsSchema.parse(request.params);
    const outcome = await uploadDriveFromRequest(request, { actor, channelId: params.channelId });
    if (!outcome) return reply.code(400).send({ error: "File is required" });
    return sendDriveOutcome(reply, outcome);
  });

  app.get("/api/drive/files/:fileId/content", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    const params = driveFileParamsSchema.parse(request.params);
    const query = driveContentQuerySchema.parse(request.query);
    const outcome = await getDriveFileContent(params.fileId, actor, query);
    if (outcome.status === "notFound") return reply.code(404).send({ error: "Drive file not found" });
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
  const fallback = (fileName || "drive")
    .replace(/["\\\r\n]/g, "_")
    .replace(/[^\x20-\x7e]/g, "_")
    .trim() || "drive";
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName || "drive")}`;
}
