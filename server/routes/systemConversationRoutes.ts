import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { SYSTEM_CONVERSATION_IDS } from "../../src/types/orf";
import { commentActorWithPermissions, requireUserScopeContext } from "../auth/accessPolicy";
import {
  listSystemConversationMessages,
  listSystemConversationSummaries,
  markSystemConversationMessageRead,
  markSystemConversationMessageUnread,
  markSystemConversationRead,
  replyToSystemConversationMessage,
  systemConversationConfigs,
} from "../repositories/systemConversationRepository";

const systemConversationIdSchema = z.enum(SYSTEM_CONVERSATION_IDS);
const systemConversationParamsSchema = z.object({ conversationId: systemConversationIdSchema });
const systemConversationMessageParamsSchema = systemConversationParamsSchema.extend({ messageId: z.string().min(1) });
const listSystemConversationMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).optional(),
});
const systemConversationReplyBodySchema = z.object({
  body: z.string().trim().min(1).max(20000),
});

function sendReplyOutcome(reply: FastifyReply, outcome: Awaited<ReturnType<typeof replyToSystemConversationMessage>>) {
  if (outcome.status === "notFound") {
    return reply.code(404).send({ error: "System conversation message not found" });
  }
  if (outcome.status === "notReplyable") {
    return reply.code(400).send({ error: "This system message cannot be replied to" });
  }
  if (outcome.status === "forbidden") {
    return reply.code(403).send({ error: "Forbidden" });
  }
  if (outcome.status === "invalid") {
    return reply.code(400).send({ error: "Comment body is required" });
  }
  return { ok: true, commentThread: outcome.thread ?? null };
}

export function registerSystemConversationRoutes(app: FastifyInstance) {
  app.get("/api/chat/system-conversations", async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) return reply;
    return { conversations: await listSystemConversationSummaries(context.user.id, context.scope) };
  });

  app.get("/api/chat/system-conversations/:conversationId/messages", async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) return reply;
    const params = systemConversationParamsSchema.parse(request.params);
    const query = listSystemConversationMessagesQuerySchema.parse(request.query);
    const conversations = await listSystemConversationSummaries(context.user.id, context.scope);
    return {
      conversation: conversations.find((conversation) => conversation.id === params.conversationId) ?? systemConversationConfigs[params.conversationId],
      messages: await listSystemConversationMessages(params.conversationId, context.user.id, context.scope, query.limit),
    };
  });

  app.patch("/api/chat/system-conversations/:conversationId/messages/:messageId/read", async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) return reply;
    const params = systemConversationMessageParamsSchema.parse(request.params);
    const notification = await markSystemConversationMessageRead(params.conversationId, params.messageId, context.user.id, context.scope);
    if (!notification) {
      return reply.code(404).send({ error: "System conversation message not found" });
    }
    return {
      conversations: await listSystemConversationSummaries(context.user.id, context.scope),
      notification,
    };
  });

  app.patch("/api/chat/system-conversations/:conversationId/messages/:messageId/unread", async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) return reply;
    const params = systemConversationMessageParamsSchema.parse(request.params);
    const notification = await markSystemConversationMessageUnread(params.conversationId, params.messageId, context.user.id, context.scope);
    if (!notification) {
      return reply.code(404).send({ error: "System conversation message not found" });
    }
    return {
      conversations: await listSystemConversationSummaries(context.user.id, context.scope),
      notification,
    };
  });

  app.patch("/api/chat/system-conversations/:conversationId/read-all", async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) return reply;
    const params = systemConversationParamsSchema.parse(request.params);
    const updated = await markSystemConversationRead(params.conversationId, context.user.id, context.scope);
    return {
      conversations: await listSystemConversationSummaries(context.user.id, context.scope),
      updated,
    };
  });

  app.post("/api/chat/system-conversations/:conversationId/messages/:messageId/replies", async (request, reply) => {
    const actor = await commentActorWithPermissions(request, reply);
    if (!actor) return reply;
    const params = systemConversationMessageParamsSchema.parse(request.params);
    const body = systemConversationReplyBodySchema.parse(request.body);
    return sendReplyOutcome(reply, await replyToSystemConversationMessage({
      actor,
      body: body.body,
      conversationId: params.conversationId,
      notificationId: params.messageId,
    }));
  });
}
