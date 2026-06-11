import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { PermissionKey } from "../../src/config/permissions";
import { requireUserScopeContext } from "../auth/accessPolicy";
import { env } from "../env";
import { getRolePermissionKeysForScope } from "../repositories/permissionRepository";
import {
  addChatChannelMembers,
  archiveChatChannel,
  createChatChannel,
  createDirectOrGroupChannel,
  deleteChatMessage,
  getChatAttachmentContent,
  getChatBootstrap,
  getChatMessageContext,
  getChatUnreadContext,
  getChatUnreadSummary,
  getChatThread,
  listChatMentionableUsers,
  listChatMessages,
  listChatThreads,
  listPinnedChatMessages,
  listSavedChatMessages,
  markChatChannelRead,
  setChatChannelUnread,
  publishChatTyping,
  removeChatChannelMember,
  searchChatMessages,
  sendChatMessage,
  setChatReaction,
  setChatMessagePin,
  setChatMessageSaved,
  setChatThreadFollow,
  updateChatChannel,
  updateChatMessage,
  uploadChatAttachment,
  type ChatActor,
} from "../repositories/chatRepository";

const channelTypeSchema = z.enum(["public", "private", "direct", "group"]);
const channelIdParamsSchema = z.object({ channelId: z.string().min(1) });
const messageParamsSchema = channelIdParamsSchema.extend({ messageId: z.string().min(1) });
const memberParamsSchema = channelIdParamsSchema.extend({ userId: z.string().uuid() });
const threadParamsSchema = z.object({ rootMessageId: z.string().min(1) });
const attachmentParamsSchema = z.object({ attachmentId: z.string().min(1) });

const listMessagesQuerySchema = z.object({
  before: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

const messageContextQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
});

const unreadContextQuerySchema = messageContextQuerySchema.extend({
  lastReadAt: z.string()
    .refine((value) => value.trim() === "" || !Number.isNaN(Date.parse(value)), "Invalid lastReadAt")
    .optional(),
  manuallyUnread: z.enum(["true", "false"]).optional(),
});

const createChannelBodySchema = z.object({
  type: z.enum(["public", "private"]),
  displayName: z.string().trim().min(1).max(80),
  name: z.string().trim().max(80).optional(),
  purpose: z.string().trim().max(240).optional(),
  header: z.string().trim().max(500).optional(),
  memberUserIds: z.array(z.string().uuid()).max(200).optional(),
});

const createDirectBodySchema = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(16),
});

const updateChannelBodySchema = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
  name: z.string().trim().min(1).max(80).optional(),
  purpose: z.string().trim().max(240).optional(),
  header: z.string().trim().max(500).optional(),
  favorite: z.boolean().optional(),
  muted: z.boolean().optional(),
});

const addMembersBodySchema = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(200),
});

const sendMessageBodySchema = z.object({
  body: z.string().max(20000).default(""),
  rootMessageId: z.string().min(1).nullable().optional(),
  parentMessageId: z.string().min(1).nullable().optional(),
  attachmentIds: z.array(z.string().min(1)).max(20).optional(),
});

const updateMessageBodySchema = z.object({
  body: z.string().trim().min(1).max(20000),
});

const reactionBodySchema = z.object({
  emojiName: z.string().trim().min(1).max(80),
});

const pinBodySchema = z.object({
  pinned: z.boolean(),
});

const saveBodySchema = z.object({
  saved: z.boolean(),
});

const followThreadBodySchema = z.object({
  following: z.boolean(),
});

const markReadBodySchema = z.object({
  includeThreads: z.boolean().optional(),
  messageId: z.string().min(1).nullable().optional(),
}).optional();

const channelUnreadBodySchema = z.object({
  messageId: z.string().min(1).nullable().optional(),
});

const searchQuerySchema = z.object({
  q: z.string().trim().default(""),
  channelId: z.string().min(1).optional(),
  type: channelTypeSchema.optional(),
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

function sendOutcome<T extends { status: string }>(reply: FastifyReply, outcome: T) {
  if (outcome.status === "notFound") return reply.code(404).send({ error: "Chat resource not found" });
  if (outcome.status === "forbidden") return reply.code(403).send({ error: "Forbidden" });
  if (outcome.status === "invalid") return reply.code(400).send({ error: "Invalid chat request" });
  if (outcome.status === "conflict") return reply.code(409).send({ error: "Chat resource already exists" });
  if (outcome.status === "tooLarge") return reply.code(413).send({ error: "Chat attachment is too large" });
  return outcome;
}

async function uploadChatAttachmentFromRequest(request: FastifyRequest, actor: ChatActor) {
  const fields: Record<string, string> = {};

  for await (const part of request.parts({ limits: { fields: 1, files: 1, fileSize: env.ORF_INFRA_UPLOAD_MAX_BYTES } })) {
    if (part.type === "field" && typeof part.value === "string") {
      fields[part.fieldname] = part.value;
    }
    if (part.type === "file" && part.fieldname !== "file") {
      part.file.resume();
    }
    if (part.type === "file" && part.fieldname === "file") {
      const parsed = z.object({ channelId: z.string().min(1) }).parse(fields);
      return uploadChatAttachment({
        ...parsed,
        body: part.file,
        fileName: part.filename,
        mimeType: part.mimetype,
      }, actor);
    }
  }
  return null;
}

export function registerChatRoutes(app: FastifyInstance) {
  app.get("/api/chat/bootstrap", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    return getChatBootstrap(actor);
  });

  app.get("/api/chat/unread-summary", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    return getChatUnreadSummary(actor);
  });

  app.get("/api/chat/search", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    const query = searchQuerySchema.parse(request.query);
    return sendOutcome(reply, await searchChatMessages(query, actor));
  });

  app.get("/api/chat/saved", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    return sendOutcome(reply, await listSavedChatMessages(actor));
  });

  app.get("/api/chat/channels/:channelId/messages", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    const params = channelIdParamsSchema.parse(request.params);
    const query = listMessagesQuerySchema.parse(request.query);
    return sendOutcome(reply, await listChatMessages({ ...query, channelId: params.channelId }, actor));
  });

  app.get("/api/chat/channels/:channelId/unread-context", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    const params = channelIdParamsSchema.parse(request.params);
    const query = unreadContextQuerySchema.parse(request.query);
    const anchor = query.lastReadAt === undefined && query.manuallyUnread === undefined ? undefined : {
      lastReadAt: query.lastReadAt?.trim() ? query.lastReadAt : null,
      manuallyUnread: query.manuallyUnread === "true",
    };
    return sendOutcome(reply, await getChatUnreadContext({ anchor, channelId: params.channelId, limit: query.limit }, actor));
  });

  app.get("/api/chat/channels/:channelId/mentionable-users", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    const params = channelIdParamsSchema.parse(request.params);
    return sendOutcome(reply, await listChatMentionableUsers(params.channelId, actor));
  });

  app.get("/api/chat/channels/:channelId/pins", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    const params = channelIdParamsSchema.parse(request.params);
    return sendOutcome(reply, await listPinnedChatMessages(params.channelId, actor));
  });

  app.post("/api/chat/channels", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    const body = createChannelBodySchema.parse(request.body);
    return sendOutcome(reply, await createChatChannel(body, actor));
  });

  app.post("/api/chat/direct", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    const body = createDirectBodySchema.parse(request.body);
    return sendOutcome(reply, await createDirectOrGroupChannel(body, actor));
  });

  app.patch("/api/chat/channels/:channelId", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    const params = channelIdParamsSchema.parse(request.params);
    const body = updateChannelBodySchema.parse(request.body);
    return sendOutcome(reply, await updateChatChannel(params.channelId, body, actor));
  });

  app.delete("/api/chat/channels/:channelId", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    const params = channelIdParamsSchema.parse(request.params);
    return sendOutcome(reply, await archiveChatChannel(params.channelId, actor));
  });

  app.post("/api/chat/channels/:channelId/members", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    const params = channelIdParamsSchema.parse(request.params);
    const body = addMembersBodySchema.parse(request.body);
    return sendOutcome(reply, await addChatChannelMembers(params.channelId, body.userIds, actor));
  });

  app.delete("/api/chat/channels/:channelId/members/:userId", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    const params = memberParamsSchema.parse(request.params);
    return sendOutcome(reply, await removeChatChannelMember(params.channelId, params.userId, actor));
  });

  app.patch("/api/chat/channels/:channelId/read", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    const params = channelIdParamsSchema.parse(request.params);
    const body = markReadBodySchema.parse(request.body);
    return sendOutcome(reply, await markChatChannelRead(params.channelId, actor, {
      includeThreads: body?.includeThreads ?? false,
      messageId: body?.messageId ?? null,
    }));
  });

  app.patch("/api/chat/channels/:channelId/unread", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    const params = channelIdParamsSchema.parse(request.params);
    const body = channelUnreadBodySchema.parse(request.body);
    return sendOutcome(reply, await setChatChannelUnread({ channelId: params.channelId, messageId: body.messageId ?? null }, actor));
  });

  app.post("/api/chat/channels/:channelId/typing", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    const params = channelIdParamsSchema.parse(request.params);
    return sendOutcome(reply, await publishChatTyping(params.channelId, actor));
  });

  app.post("/api/chat/channels/:channelId/messages", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    const params = channelIdParamsSchema.parse(request.params);
    const body = sendMessageBodySchema.parse(request.body);
    return sendOutcome(reply, await sendChatMessage({ ...body, channelId: params.channelId }, actor, {
      onSideEffectError: (error, context) => {
        request.log.warn({ err: error, ...context }, "Chat message side effect failed");
      },
    }));
  });

  app.get("/api/chat/channels/:channelId/messages/:messageId/context", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    const params = messageParamsSchema.parse(request.params);
    const query = messageContextQuerySchema.parse(request.query);
    return sendOutcome(reply, await getChatMessageContext({ ...params, ...query }, actor));
  });

  app.patch("/api/chat/channels/:channelId/messages/:messageId", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    const params = messageParamsSchema.parse(request.params);
    const body = updateMessageBodySchema.parse(request.body);
    return sendOutcome(reply, await updateChatMessage({ ...params, body: body.body }, actor));
  });

  app.delete("/api/chat/channels/:channelId/messages/:messageId", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    const params = messageParamsSchema.parse(request.params);
    return sendOutcome(reply, await deleteChatMessage(params, actor));
  });

  app.post("/api/chat/channels/:channelId/messages/:messageId/reactions", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    const params = messageParamsSchema.parse(request.params);
    const body = reactionBodySchema.parse(request.body);
    return sendOutcome(reply, await setChatReaction({ ...params, emojiName: body.emojiName, reacting: true }, actor));
  });

  app.delete("/api/chat/channels/:channelId/messages/:messageId/reactions/:emojiName", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    const params = messageParamsSchema.extend({ emojiName: z.string().min(1) }).parse(request.params);
    return sendOutcome(reply, await setChatReaction({ ...params, emojiName: decodeURIComponent(params.emojiName), reacting: false }, actor));
  });

  app.patch("/api/chat/channels/:channelId/messages/:messageId/pin", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    const params = messageParamsSchema.parse(request.params);
    const body = pinBodySchema.parse(request.body);
    return sendOutcome(reply, await setChatMessagePin({ ...params, pinned: body.pinned }, actor));
  });

  app.patch("/api/chat/channels/:channelId/messages/:messageId/save", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    const params = messageParamsSchema.parse(request.params);
    const body = saveBodySchema.parse(request.body);
    return sendOutcome(reply, await setChatMessageSaved({ ...params, saved: body.saved }, actor));
  });

  app.get("/api/chat/threads", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    return sendOutcome(reply, await listChatThreads(actor));
  });

  app.get("/api/chat/threads/:rootMessageId", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    const params = threadParamsSchema.parse(request.params);
    return sendOutcome(reply, await getChatThread(params.rootMessageId, actor));
  });

  app.patch("/api/chat/threads/:rootMessageId/follow", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    const params = threadParamsSchema.parse(request.params);
    const body = followThreadBodySchema.parse(request.body);
    return sendOutcome(reply, await setChatThreadFollow(params.rootMessageId, body.following, actor));
  });

  app.post("/api/chat/attachments", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    const outcome = await uploadChatAttachmentFromRequest(request, actor);
    if (!outcome) return reply.code(400).send({ error: "File is required" });
    return sendOutcome(reply, outcome);
  });

  app.get("/api/chat/attachments/:attachmentId/content", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    const params = attachmentParamsSchema.parse(request.params);
    const outcome = await getChatAttachmentContent(params.attachmentId, actor);
    if (outcome.status === "notFound") return reply.code(404).send({ error: "Chat attachment not found" });
    if (outcome.status === "forbidden") return reply.code(403).send({ error: "Forbidden" });
    reply.header("Cache-Control", "private, max-age=60");
    reply.header("Content-Type", outcome.contentType);
    if (outcome.contentLength !== undefined) {
      reply.header("Content-Length", outcome.contentLength);
    }
    return reply.send(outcome.body);
  });
}
