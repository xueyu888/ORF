import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { PermissionKey } from "../../src/config/permissions";
import { requireUserScopeContext } from "../auth/accessPolicy";
import { env } from "../env";
import { getRolePermissionKeysForScope } from "../repositories/permissionRepository";
import {
  addChatDriveLink,
  addDriveContextLink,
  createDriveFolder,
  deleteDriveContextLink,
  deleteDriveNode,
  deleteChatDriveLink,
  getDriveFileVersions,
  getChatDriveBootstrap,
  getDriveBootstrap,
  getDriveFileContent,
  getDriveNodeDetails,
  listDriveTrash,
  listDriveChildren,
  restoreDriveFileVersion,
  restoreDriveNode,
  searchDriveNodes,
  updateChatDriveLink,
  uploadDriveFile,
  uploadDriveFileVersion,
} from "../repositories/driveRepository";
import type { ChatActor } from "../repositories/chatRepository";

const channelIdParamsSchema = z.object({ channelId: z.string().min(1) });
const nodeParamsSchema = z.object({ nodeId: z.string().min(1) });
const nodeContextLinkParamsSchema = nodeParamsSchema.extend({ linkId: z.string().min(1) });
const channelLinkParamsSchema = channelIdParamsSchema.extend({ linkId: z.string().min(1) });
const driveFileParamsSchema = z.object({ fileId: z.string().min(1) });
const driveFileVersionParamsSchema = driveFileParamsSchema.extend({ versionId: z.string().min(1) });
const driveContentQuerySchema = z.object({
  disposition: z.enum(["attachment", "inline"]).optional(),
});
const driveSearchQuerySchema = z.object({
  contextId: z.string().trim().min(1).max(120).optional(),
  contextType: z.enum(["all", "project", "objective", "result", "task", "feedback", "workLog", "chatChannel", "chatMessage", "chatThread"]).optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  previewKind: z.enum(["all", "download", "image", "markdown", "pdf", "text"]).optional(),
  q: z.string().trim().max(200).optional(),
  scope: z.enum(["active", "trash"]).optional(),
  source: z.enum(["all", "manual", "chat", "project", "objective", "result", "task", "feedback", "workLog"]).optional(),
  status: z.enum(["active", "all", "trash"]).optional(),
  type: z.enum(["all", "file", "folder"]).optional(),
  updated: z.enum(["all", "7d", "30d"]).optional(),
  uploaderId: z.string().trim().min(1).max(80).optional(),
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
const driveContextLinkBodySchema = z.object({
  contextId: z.string().min(1),
  contextType: z.enum(["project", "objective", "result", "task", "feedback", "workLog", "chatChannel", "chatMessage", "chatThread"]),
  label: z.string().trim().max(160).optional().nullable(),
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

  app.get("/api/drive/search", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    const query = driveSearchQuerySchema.parse(request.query);
    return sendDriveOutcome(reply, await searchDriveNodes({
      contextId: query.contextId,
      contextType: query.contextType,
      limit: query.limit,
      previewKind: query.previewKind,
      query: query.q,
      scope: query.scope,
      source: query.source,
      status: query.status,
      type: query.type,
      updated: query.updated,
      uploaderId: query.uploaderId,
    }, actor));
  });

  app.get("/api/drive/trash", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    return sendDriveOutcome(reply, await listDriveTrash(actor));
  });

  app.get("/api/drive/nodes/:nodeId/children", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    const params = nodeParamsSchema.parse(request.params);
    return sendDriveOutcome(reply, await listDriveChildren({ parentNodeId: params.nodeId }, actor));
  });

  app.get("/api/drive/nodes/:nodeId/details", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    const params = nodeParamsSchema.parse(request.params);
    return sendDriveOutcome(reply, await getDriveNodeDetails({ nodeId: params.nodeId }, actor));
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

  app.post("/api/drive/nodes/:nodeId/restore", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    const params = nodeParamsSchema.parse(request.params);
    return sendDriveOutcome(reply, await restoreDriveNode({ nodeId: params.nodeId }, actor));
  });

  app.post("/api/drive/nodes/:nodeId/context-links", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    const params = nodeParamsSchema.parse(request.params);
    const body = driveContextLinkBodySchema.parse(request.body);
    return sendDriveOutcome(reply, await addDriveContextLink({
      contextId: body.contextId,
      contextType: body.contextType,
      label: body.label,
      nodeId: params.nodeId,
    }, actor));
  });

  app.delete("/api/drive/nodes/:nodeId/context-links/:linkId", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    const params = nodeContextLinkParamsSchema.parse(request.params);
    return sendDriveOutcome(reply, await deleteDriveContextLink({
      linkId: params.linkId,
      nodeId: params.nodeId,
    }, actor));
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

  app.get("/api/drive/files/:fileId/versions", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    const params = driveFileParamsSchema.parse(request.params);
    return sendDriveOutcome(reply, await getDriveFileVersions({ fileId: params.fileId }, actor));
  });

  app.post("/api/drive/files/:fileId/versions", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    const params = driveFileParamsSchema.parse(request.params);
    for await (const part of request.parts({ limits: { fields: 1, files: 1, fileSize: env.ORF_INFRA_UPLOAD_MAX_BYTES } })) {
      if (part.type === "file" && part.fieldname === "file") {
        return sendDriveOutcome(reply, await uploadDriveFileVersion({
          body: part.file,
          fileId: params.fileId,
          fileName: part.filename,
          mimeType: part.mimetype,
        }, actor));
      }
      if (part.type === "file") {
        part.file.resume();
      }
    }
    return reply.code(400).send({ error: "File is required" });
  });

  app.post("/api/drive/files/:fileId/versions/:versionId/restore", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    const params = driveFileVersionParamsSchema.parse(request.params);
    return sendDriveOutcome(reply, await restoreDriveFileVersion({
      fileId: params.fileId,
      versionId: params.versionId,
    }, actor));
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
