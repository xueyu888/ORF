import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { PermissionKey } from "../../src/config/permissions";
import { CHAT_POLL_INPUT_CONTRACT } from "../../src/domain/chatPollContract";
import { requireUserScopeContext } from "../auth/accessPolicy";
import { env } from "../env";
import { CHAT_SYNC_PAGE_SIZE, CHAT_SYNC_PROTOCOL_VERSION, isChatSyncCursor } from "../../src/domain/chatSync";
import { getChatSync } from "../chat/chatSyncRepository";
import { setChatReaction } from "../chat/chatReactionService";
import { loadChatWebLinkTitle } from "../chat/chatWebLinkTitleService";
import {
  byteRangeSelectionFromRequest,
  sendByteRangeNotSatisfiable,
  sendRangedContent,
} from "../http/rangedContentResponse";
import { getRolePermissionKeysForScope } from "../repositories/permissionRepository";
import {
  addChatChannelMembers,
  archiveChatChannel,
  createChatChannel,
  createDirectChannel,
  deleteChatMessage,
  endChatPoll,
  getChatAttachmentContent,
  getChatBootstrap,
  getChatMessageContext,
  getChatUnreadTarget,
  getChatUnreadSummary,
  getChatThread,
  listProjectChatChannels,
  listChatMentionableUsers,
  listChatUsers,
  listChatMessages,
  listChatThreads,
  listPinnedChatMessages,
  listSavedChatMessages,
  markChatChannelRead,
  setChatChannelUnread,
  publishChatTyping,
  removeChatChannelMember,
  requestChatMessageAcknowledgement,
  searchChatMessages,
  sendChatMessage,
  setChatMessagePin,
  setChatMessageSaved,
  setChatPollVote,
  setChatThreadFollow,
  updateChatChannel,
  updateChatMessage,
  uploadChatAttachment,
  type ChatActor,
} from "../repositories/chatRepository";

const channelTypeSchema = z.enum(["public", "private", "direct"]);
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

const unreadTargetQuerySchema = messageContextQuerySchema.extend({
  lastReadAt: z.string()
    .refine((value) => value.trim() === "" || !Number.isNaN(Date.parse(value)), "Invalid lastReadAt")
    .optional(),
  manuallyUnread: z.enum(["true", "false"]).optional(),
  surface: z.enum(["main", "threadMention"]),
});

const createChannelBodySchema = z.object({
  type: z.enum(["public", "private"]),
  displayName: z.string().trim().min(1).max(80),
  name: z.string().trim().max(80).optional(),
  projectId: z.string().trim().min(1).nullable().optional(),
  purpose: z.string().trim().max(240).optional(),
  header: z.string().trim().max(500).optional(),
  memberUserIds: z.array(z.string().uuid()).max(200).optional(),
});

const createDirectBodySchema = z.object({
  userIds: z.array(z.string().uuid()).length(1),
});

const updateChannelBodySchema = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
  name: z.string().trim().min(1).max(80).optional(),
  projectId: z.string().trim().min(1).nullable().optional(),
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
  requireAcknowledgement: z.boolean().optional(),
});

const createPollBodySchema = z.object({
  question: z.string().trim().min(1).max(CHAT_POLL_INPUT_CONTRACT.maximumQuestionLength),
  options: z.array(z.string().trim().min(1).max(CHAT_POLL_INPUT_CONTRACT.maximumOptionLabelLength))
    .min(CHAT_POLL_INPUT_CONTRACT.minimumOptionCount)
    .max(CHAT_POLL_INPUT_CONTRACT.maximumOptionCount),
  selectionMode: z.enum(["single", "multiple"]),
  visibility: z.enum(["named", "anonymous"]),
});

const pollVoteBodySchema = z.object({
  optionIds: z.array(z.string().trim().min(1)).min(1).max(CHAT_POLL_INPUT_CONTRACT.maximumOptionCount),
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
const projectChannelsQuerySchema = z.object({ projectId: z.string().trim().min(1) });
const webLinkTitleQuerySchema = z.object({ url: z.string().trim().max(2_048).url() });
const chatSyncQuerySchema = z.object({
  cursor: z.string().refine(isChatSyncCursor, "Invalid chat sync cursor").optional(),
  limit: z.coerce.number().int().positive().max(CHAT_SYNC_PAGE_SIZE).default(CHAT_SYNC_PAGE_SIZE),
  permissionFingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  protocolVersion: z.coerce.number().int().positive().optional(),
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

async function uploadChatAttachmentFromRequest(request: FastifyRequest, input: { actor: ChatActor; channelId: string }) {
  for await (const part of request.parts({ limits: { fields: 1, files: 1, fileSize: env.ORF_INFRA_UPLOAD_MAX_BYTES } })) {
    if (part.type === "file" && part.fieldname !== "file") {
      part.file.resume();
    }
    if (part.type === "file" && part.fieldname === "file") {
      return uploadChatAttachment({
        channelId: input.channelId,
        body: part.file,
        fileName: part.filename,
        mimeType: part.mimetype,
      }, input.actor);
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

  app.get("/api/chat/sync", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    if (!actor.canRead) return reply.code(403).send({ error: "Forbidden" });
    const query = chatSyncQuerySchema.parse(request.query);
    return getChatSync({
      actor,
      cursor: query.cursor,
      limit: query.limit,
      permissionFingerprint: query.permissionFingerprint,
      protocolVersion: query.protocolVersion ?? CHAT_SYNC_PROTOCOL_VERSION,
    });
  });

  app.get("/api/chat/users", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    return { users: await listChatUsers(actor) };
  });

  app.get("/api/chat/unread-summary", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    return getChatUnreadSummary(actor);
  });

  app.get("/api/chat/link-title", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    if (!actor.canRead) return reply.code(403).send({ error: "Forbidden" });
    const query = webLinkTitleQuerySchema.parse(request.query);
    try {
      return await loadChatWebLinkTitle(query.url);
    } catch {
      return reply.code(422).send({ error: "网页暂时无法解析" });
    }
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

  app.get("/api/chat/channels/:channelId/unread-target", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    const params = channelIdParamsSchema.parse(request.params);
    const query = unreadTargetQuerySchema.parse(request.query);
    const anchor = query.lastReadAt === undefined && query.manuallyUnread === undefined ? undefined : {
      lastReadAt: query.lastReadAt?.trim() ? query.lastReadAt : null,
      manuallyUnread: query.manuallyUnread === "true",
    };
    return sendOutcome(reply, await getChatUnreadTarget({
      anchor,
      channelId: params.channelId,
      limit: query.limit,
      surface: query.surface,
    }, actor));
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

  app.get("/api/chat/project-channels", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    const query = projectChannelsQuerySchema.parse(request.query);
    return sendOutcome(reply, await listProjectChatChannels(query.projectId, actor));
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
    return sendOutcome(reply, await createDirectChannel(body, actor));
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
    return sendOutcome(reply, await sendChatMessage({ ...body, channelId: params.channelId }, actor));
  });

  app.post("/api/chat/channels/:channelId/polls", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    const params = channelIdParamsSchema.parse(request.params);
    const body = createPollBodySchema.parse(request.body);
    return sendOutcome(reply, await sendChatMessage({
      body: body.question,
      channelId: params.channelId,
      poll: {
        options: body.options,
        selectionMode: body.selectionMode,
        visibility: body.visibility,
      },
    }, actor));
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

  app.post("/api/chat/channels/:channelId/messages/:messageId/acknowledgement", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    const params = messageParamsSchema.parse(request.params);
    return sendOutcome(reply, await requestChatMessageAcknowledgement(params, actor));
  });

  app.put("/api/chat/channels/:channelId/messages/:messageId/poll/vote", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    const params = messageParamsSchema.parse(request.params);
    const body = pollVoteBodySchema.parse(request.body);
    return sendOutcome(reply, await setChatPollVote({ ...params, optionIds: body.optionIds }, actor));
  });

  app.post("/api/chat/channels/:channelId/messages/:messageId/poll/close", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    const params = messageParamsSchema.parse(request.params);
    return sendOutcome(reply, await endChatPoll(params, actor));
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

  app.post("/api/chat/channels/:channelId/attachments", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    const params = channelIdParamsSchema.parse(request.params);
    const outcome = await uploadChatAttachmentFromRequest(request, { actor, channelId: params.channelId });
    if (!outcome) return reply.code(400).send({ error: "File is required" });
    return sendOutcome(reply, outcome);
  });

  app.get("/api/chat/attachments/:attachmentId/content", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;
    const params = attachmentParamsSchema.parse(request.params);
    const outcome = await getChatAttachmentContent(params.attachmentId, actor, {
      byteRange: byteRangeSelectionFromRequest(request),
    });
    if (outcome.status === "notFound") return reply.code(404).send({ error: "Chat attachment not found" });
    if (outcome.status === "forbidden") return reply.code(403).send({ error: "Forbidden" });
    if (outcome.status === "rangeNotSatisfiable") {
      return sendByteRangeNotSatisfiable(reply, outcome.totalContentLength);
    }
    return sendRangedContent(reply, {
      body: outcome.body,
      cacheControl: "private, max-age=60",
      contentLength: outcome.contentLength,
      contentType: outcome.contentType,
      range: outcome.range,
      totalContentLength: outcome.totalContentLength,
    });
  });
}
