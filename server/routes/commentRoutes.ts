import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { commentActorWithPermissions } from "../auth/accessPolicy";
import { env } from "../env";
import {
  createComment,
  deleteCommentMessage,
  getCommentAttachmentContent,
  listCommentMentionableUsers,
  uploadCommentAttachment,
  updateCommentMessage,
  updateCommentThreadStatus,
} from "../repositories/orfRepository";

const commentTargetTypeSchema = z.enum(["objective", "result", "task", "subtask", "feedback"]);
const commentStatusSchema = z.enum(["open", "resolved"]);
const commentThreadParamsSchema = z.object({ threadId: z.string().min(1) });
const commentMessageParamsSchema = commentThreadParamsSchema.extend({ messageId: z.string().min(1) });
const commentAttachmentParamsSchema = z.object({ attachmentId: z.string().min(1) });
const commentAttachmentContentQuerySchema = z.object({
  disposition: z.enum(["attachment", "inline"]).optional(),
});
const createCommentBodySchema = z.object({
  targetType: commentTargetTypeSchema,
  targetId: z.string().min(1),
  targetTitle: z.string().trim().min(1),
  body: z.string().trim().min(1),
  parentMessageId: z.string().min(1).optional(),
  replyToMessageId: z.string().min(1).optional(),
  replyToAuthor: z.string().trim().min(1).optional(),
});
const updateCommentStatusBodySchema = z.object({ status: commentStatusSchema });
const updateCommentMessageBodySchema = z.object({ body: z.string().trim().min(1) });
const uploadCommentAttachmentFieldsSchema = z.object({
  targetId: z.string().trim().min(1),
  targetType: commentTargetTypeSchema,
});
const commentMentionableUsersQuerySchema = uploadCommentAttachmentFieldsSchema;

function sendCommentOutcome(reply: FastifyReply, outcome: Awaited<ReturnType<typeof createComment>>) {
  if (outcome.status === "notFound") {
    return reply.code(404).send({ error: "Comment target not found" });
  }

  if (outcome.status === "forbidden") {
    return reply.code(403).send({ error: "Forbidden" });
  }

  if (outcome.status === "invalid") {
    return reply.code(400).send({ error: "Comment body is required" });
  }

  return { ok: true, commentThread: outcome.thread ?? null };
}

async function readCommentAttachmentUpload(request: FastifyRequest) {
  const fields: Record<string, string> = {};
  let file: { buffer: Buffer; fileName: string; mimeType: string } | null = null;

  for await (const part of request.parts({ limits: { fileSize: env.OBJECT_STORAGE_UPLOAD_MAX_BYTES, files: 1 } })) {
    if (part.type === "field" && typeof part.value === "string") {
      fields[part.fieldname] = part.value;
    }
    if (part.type === "file" && part.fieldname === "file") {
      file = {
        buffer: await part.toBuffer(),
        fileName: part.filename,
        mimeType: part.mimetype,
      };
    }
  }

  const target = uploadCommentAttachmentFieldsSchema.parse(fields);
  return file ? { ...target, ...file } : null;
}

export function registerCommentRoutes(app: FastifyInstance) {
  app.post("/api/comments/attachments", async (request, reply) => {
    const user = await commentActorWithPermissions(request, reply);
    if (!user) {
      return reply;
    }

    const upload = await readCommentAttachmentUpload(request);
    if (!upload) {
      return reply.code(400).send({ error: "Attachment file is required" });
    }

    const outcome = await uploadCommentAttachment({ ...upload, body: upload.buffer }, user);
    if (outcome.status === "notFound") {
      return reply.code(404).send({ error: "Comment target not found" });
    }
    if (outcome.status === "forbidden") {
      return reply.code(403).send({ error: "Forbidden" });
    }
    if (outcome.status === "tooLarge") {
      return reply.code(413).send({ error: "Attachment is too large" });
    }
    if (outcome.status === "invalid") {
      return reply.code(400).send({ error: "Attachment file is required" });
    }

    return { ok: true, attachment: outcome.attachment, markdown: outcome.markdown };
  });

  app.get("/api/comments/mentionable-users", async (request, reply) => {
    const user = await commentActorWithPermissions(request, reply);
    if (!user) {
      return reply;
    }

    const query = commentMentionableUsersQuerySchema.parse(request.query);
    const outcome = await listCommentMentionableUsers(query, user);
    if (outcome.status === "notFound") {
      return reply.code(404).send({ error: "Comment target not found" });
    }
    if (outcome.status === "forbidden") {
      return reply.code(403).send({ error: "Forbidden" });
    }

    return { users: outcome.users };
  });

  app.get("/api/comments/attachments/:attachmentId/content", async (request, reply) => {
    const user = await commentActorWithPermissions(request, reply);
    if (!user) {
      return reply;
    }

    const params = commentAttachmentParamsSchema.parse(request.params);
    const query = commentAttachmentContentQuerySchema.parse(request.query);
    const outcome = await getCommentAttachmentContent(params.attachmentId, user, query);
    if (outcome.status === "notFound") {
      return reply.code(404).send({ error: "Comment attachment not found" });
    }
    if (outcome.status === "forbidden") {
      return reply.code(403).send({ error: "Forbidden" });
    }

    reply.header("Cache-Control", "private, max-age=60");
    reply.header("Content-Disposition", contentDispositionHeader(outcome.contentDisposition, outcome.fileName));
    reply.header("Content-Type", outcome.contentType);
    reply.header("X-Content-Type-Options", "nosniff");
    if (outcome.contentLength !== undefined) {
      reply.header("Content-Length", outcome.contentLength);
    }
    return reply.send(outcome.body);
  });

  app.post("/api/comments", async (request, reply) => {
    const user = await commentActorWithPermissions(request, reply);
    if (!user) {
      return reply;
    }

    const body = createCommentBodySchema.parse(request.body);
    return sendCommentOutcome(reply, await createComment(body, user));
  });

  app.patch("/api/comments/:threadId/status", async (request, reply) => {
    const user = await commentActorWithPermissions(request, reply);
    if (!user) {
      return reply;
    }

    const params = commentThreadParamsSchema.parse(request.params);
    const body = updateCommentStatusBodySchema.parse(request.body);
    return sendCommentOutcome(reply, await updateCommentThreadStatus(params.threadId, body.status, user));
  });

  app.patch("/api/comments/:threadId/messages/:messageId", async (request, reply) => {
    const user = await commentActorWithPermissions(request, reply);
    if (!user) {
      return reply;
    }

    const params = commentMessageParamsSchema.parse(request.params);
    const body = updateCommentMessageBodySchema.parse(request.body);
    return sendCommentOutcome(reply, await updateCommentMessage(params.threadId, params.messageId, body.body, user));
  });

  app.delete("/api/comments/:threadId/messages/:messageId", async (request, reply) => {
    const user = await commentActorWithPermissions(request, reply);
    if (!user) {
      return reply;
    }

    const params = commentMessageParamsSchema.parse(request.params);
    return sendCommentOutcome(reply, await deleteCommentMessage(params.threadId, params.messageId, user));
  });
}

function contentDispositionHeader(disposition: "attachment" | "inline", fileName: string) {
  const fallback = (fileName || "attachment")
    .replace(/["\\\r\n]/g, "_")
    .replace(/[^\x20-\x7e]/g, "_")
    .trim() || "attachment";
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName || "attachment")}`;
}
