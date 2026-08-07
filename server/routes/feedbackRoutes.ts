import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  feedbackImpactSchema,
  feedbackPrioritySchema,
  feedbackRelationTypeSchema,
  feedbackTransitionInputSchema,
} from "@orf/feedback-module/contracts";
import { requireFeedbackInScope, requireUserScopeContext } from "../auth/accessPolicy";
import { env } from "../env";
import {
  getFeedbackIssueDetailReadModelData,
  getFeedbackIssueReadModelData,
} from "../readModels/feedbackIssueReadModel";
import { getFeedbackSubscriptionMode, setFeedbackSubscriptionMode } from "../repositories/feedbackSubscriptionRepository";
import {
  addFeedbackRelation,
  createFeedback,
  getFeedbackReferences,
  searchFeedbackReferences,
  getFeedbackReportAttachmentContent,
  listFeedbackAssigneeOptions,
  markFeedbackViewed,
  removeFeedbackRelation,
  transitionFeedback,
  updateFeedbackAssignee,
  updateFeedbackMetadata,
  type FeedbackCommandActor,
  type FeedbackCommandResult,
} from "../repositories/feedbackRepository";

const feedbackParamsSchema = z.object({ feedbackId: z.string().min(1) });
const feedbackRelationParamsSchema = z.object({ feedbackId: z.string().min(1), relationId: z.string().min(1) });
const feedbackReportAttachmentParamsSchema = z.object({ attachmentId: z.string().min(1) });
const feedbackReportAttachmentContentQuerySchema = z.object({
  disposition: z.enum(["attachment", "inline"]).optional(),
});
const createFeedbackBodySchema = z.object({
  title: z.string().trim().min(1),
  causeCategories: z.array(z.string().trim().min(1)).min(1),
  impact: feedbackImpactSchema,
  priority: feedbackPrioritySchema.nullable().optional(),
  description: z.string().trim().min(1),
  assigneeUserId: z.string().trim().min(1).nullable().optional(),
  projectId: z.string().nullable().optional(),
});
const createFeedbackMultipartFieldsSchema = z.object({
  title: z.string().trim().min(1),
  causeCategories: z.string().trim().min(1),
  impact: feedbackImpactSchema,
  priority: z.string().optional(),
  description: z.string().trim().min(1),
  assigneeUserId: z.string().optional(),
  projectId: z.string().optional(),
});
const updateFeedbackMetadataBodySchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
  title: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
  causeCategories: z.array(z.string().trim().min(1)).min(1).optional(),
  impact: feedbackImpactSchema.optional(),
  priority: feedbackPrioritySchema.nullable().optional(),
  projectId: z.string().trim().min(1).nullable().optional(),
}).strict();
const updateFeedbackAssigneeBodySchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
  assigneeUserId: z.string().trim().min(1).nullable(),
}).strict();
const addFeedbackRelationBodySchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
  targetFeedbackId: z.string().trim().min(1),
  type: feedbackRelationTypeSchema,
}).strict();
const removeFeedbackRelationBodySchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
}).strict();
const markFeedbackViewedBodySchema = z.object({
  seenThroughSequence: z.number().int().nonnegative(),
}).strict();
const updateFeedbackSubscriptionBodySchema = z.object({
  mode: z.enum(["none", "subscribed", "muted"]),
});
const feedbackReferencesQuerySchema = z.object({
  id: z.union([z.string(), z.array(z.string())]).optional(),
  ids: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  q: z.string().trim().optional(),
});

function parseCauseCategories(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return z.array(z.string().trim().min(1)).min(1).parse(parsed);
  } catch {
    return z.array(z.string().trim().min(1)).min(1).parse([]);
  }
}

function parsePriority(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? feedbackPrioritySchema.parse(normalized) : null;
}

function parseFeedbackReferenceQuery(query: unknown) {
  const parsed = feedbackReferencesQuerySchema.parse(query);
  const repeatedIds = Array.isArray(parsed.id) ? parsed.id : parsed.id ? [parsed.id] : [];
  const commaSeparatedIds = parsed.ids?.split(",") ?? [];
  return {
    ids: [...repeatedIds, ...commaSeparatedIds].map((value) => value.trim()).filter(Boolean).slice(0, 100),
    limit: parsed.limit ?? 20,
    q: parsed.q?.trim() ?? "",
  };
}

function normalizeOptionalId(value: string | null | undefined) {
  return value?.trim() || null;
}

function commandActor(context: NonNullable<Awaited<ReturnType<typeof requireUserScopeContext>>>): FeedbackCommandActor {
  return {
    id: context.user.id,
    name: context.user.name,
    role: context.user.role,
    status: context.user.status,
    scope: context.scope,
  };
}

async function readCreateFeedbackBody(request: FastifyRequest) {
  const contentType = request.headers["content-type"] ?? "";
  if (!contentType.includes("multipart/form-data")) {
    const body = createFeedbackBodySchema.parse(request.body);
    return {
      title: body.title,
      causeCategories: body.causeCategories,
      impact: body.impact,
      priority: body.priority ?? null,
      description: body.description,
      assigneeUserId: normalizeOptionalId(body.assigneeUserId),
      projectId: normalizeOptionalId(body.projectId),
      attachments: [],
    };
  }

  const fields: Record<string, string> = {};
  const attachments: Array<{ body: Buffer; clientId: string; fileName: string; mimeType: string }> = [];
  for await (const part of request.parts({ limits: { fileSize: env.OBJECT_STORAGE_UPLOAD_MAX_BYTES } })) {
    if (part.type === "field" && typeof part.value === "string") {
      fields[part.fieldname] = part.value;
    }
    if (part.type === "file" && part.fieldname.startsWith("attachment:")) {
      const clientId = part.fieldname.slice("attachment:".length).trim();
      if (clientId) {
        attachments.push({
          body: await part.toBuffer(),
          clientId,
          fileName: part.filename,
          mimeType: part.mimetype,
        });
      }
    }
  }

  const body = createFeedbackMultipartFieldsSchema.parse(fields);
  return {
    title: body.title,
    causeCategories: parseCauseCategories(body.causeCategories),
    impact: body.impact,
    priority: parsePriority(body.priority),
    description: body.description,
    assigneeUserId: normalizeOptionalId(body.assigneeUserId),
    projectId: normalizeOptionalId(body.projectId),
    attachments,
  };
}

function sendFeedbackCommandOutcome(reply: FastifyReply, outcome: FeedbackCommandResult) {
  if (outcome.status === "notFound") {
    return reply.code(404).send({ error: "Feedback not found" });
  }
  if (outcome.status === "forbidden") {
    return reply.code(403).send({ error: "Forbidden" });
  }
  if (outcome.status === "conflict") {
    return reply.code(409).send({ error: "Feedback version conflict" });
  }
  if (outcome.status === "invalidAssignee") {
    return reply.code(409).send({ error: "Feedback assignee must be an active member" });
  }
  if (outcome.status === "invalidProject") {
    return reply.code(409).send({ error: "Feedback project not found" });
  }
  if (outcome.status === "invalid") {
    return reply.code(400).send({ error: "Feedback command is invalid" });
  }
  return { ok: true, changed: outcome.changed };
}

export function registerFeedbackRoutes(app: FastifyInstance) {
  app.get("/api/feedback/issues", async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }

    return getFeedbackIssueReadModelData({ scope: context.scope, viewerUserId: context.user.id });
  });

  app.get("/api/feedback/:feedbackId/read-model", async (request, reply) => {
    const params = feedbackParamsSchema.parse(request.params);
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }

    const data = await getFeedbackIssueDetailReadModelData(params.feedbackId, { scope: context.scope, viewerUserId: context.user.id });
    if (!data) {
      return reply.code(404).send({ error: "Feedback not found" });
    }
    return data;
  });

  app.get("/api/feedback/assignees", async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }

    const users = await listFeedbackAssigneeOptions(context.scope);
    return { users };
  });

  app.get("/api/feedback/references", async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }

    const query = parseFeedbackReferenceQuery(request.query);
    const byId = await getFeedbackReferences(query.ids, context.scope);
    const bySearch = query.q ? await searchFeedbackReferences(query.q, context.scope, query.limit) : [];
    const seen = new Set<string>();
    return {
      feedback: [...byId, ...bySearch].filter((item) => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      }),
    };
  });

  app.get("/api/feedback/report-attachments/:attachmentId/content", async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }

    const params = feedbackReportAttachmentParamsSchema.parse(request.params);
    const query = feedbackReportAttachmentContentQuerySchema.parse(request.query);
    const outcome = await getFeedbackReportAttachmentContent(params.attachmentId, commandActor(context), query);
    if (outcome.status === "notFound") {
      return reply.code(404).send({ error: "Feedback report attachment not found" });
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

  app.post("/api/feedback", async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }

    const body = await readCreateFeedbackBody(request);
    const outcome = await createFeedback(body, commandActor(context));

    if (outcome.status === "notFound") {
      return reply.code(404).send({ error: "Runtime scope not found" });
    }
    if (outcome.status === "invalid") {
      return reply.code(400).send({ error: "Feedback body is required" });
    }
    if (outcome.status === "invalidAssignee") {
      return reply.code(409).send({ error: "Feedback assignee must be an active member" });
    }
    if (outcome.status === "invalidProject") {
      return reply.code(409).send({ error: "Feedback project not found" });
    }
    if (outcome.status === "tooLarge") {
      return reply.code(413).send({ error: "Attachment is too large" });
    }

    return { feedback: outcome.feedback };
  });

  app.post("/api/feedback/:feedbackId/transitions", async (request, reply) => {
    const params = feedbackParamsSchema.parse(request.params);
    const body = feedbackTransitionInputSchema.parse(request.body);
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }

    return sendFeedbackCommandOutcome(reply, await transitionFeedback(params.feedbackId, body, commandActor(context)));
  });

  app.patch("/api/feedback/:feedbackId/metadata", async (request, reply) => {
    const params = feedbackParamsSchema.parse(request.params);
    const body = updateFeedbackMetadataBodySchema.parse(request.body);
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }

    return sendFeedbackCommandOutcome(reply, await updateFeedbackMetadata(params.feedbackId, body, commandActor(context)));
  });

  app.patch("/api/feedback/:feedbackId/assignee", async (request, reply) => {
    const params = feedbackParamsSchema.parse(request.params);
    const body = updateFeedbackAssigneeBodySchema.parse(request.body);
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }

    return sendFeedbackCommandOutcome(reply, await updateFeedbackAssignee(params.feedbackId, body, commandActor(context)));
  });

  app.post("/api/feedback/:feedbackId/relations", async (request, reply) => {
    const params = feedbackParamsSchema.parse(request.params);
    const body = addFeedbackRelationBodySchema.parse(request.body);
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }

    return sendFeedbackCommandOutcome(reply, await addFeedbackRelation(params.feedbackId, body, commandActor(context)));
  });

  app.delete("/api/feedback/:feedbackId/relations/:relationId", async (request, reply) => {
    const params = feedbackRelationParamsSchema.parse(request.params);
    const body = removeFeedbackRelationBodySchema.parse(request.body);
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }

    return sendFeedbackCommandOutcome(reply, await removeFeedbackRelation(params.feedbackId, params.relationId, body, commandActor(context)));
  });

  app.put("/api/feedback/:feedbackId/view", async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }
    const params = feedbackParamsSchema.parse(request.params);
    if (!(await requireFeedbackInScope(reply, params.feedbackId, context.scope))) {
      return reply;
    }

    const body = markFeedbackViewedBodySchema.parse(request.body);
    return sendFeedbackCommandOutcome(reply, await markFeedbackViewed(params.feedbackId, body, commandActor(context)));
  });

  app.get("/api/feedback/:feedbackId/subscription", async (request, reply) => {
    const params = feedbackParamsSchema.parse(request.params);
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }
    if (!(await requireFeedbackInScope(reply, params.feedbackId, context.scope))) {
      return reply;
    }

    const result = await getFeedbackSubscriptionMode(params.feedbackId, {
      id: context.user.id,
      scope: context.scope,
    });
    if (result.status === "notFound") {
      return reply.code(404).send({ error: "Feedback not found" });
    }
    if (result.status === "invalid") {
      return reply.code(400).send({ error: "Feedback subscription is invalid" });
    }

    return { subscription: { mode: result.mode } };
  });

  app.put("/api/feedback/:feedbackId/subscription", async (request, reply) => {
    const params = feedbackParamsSchema.parse(request.params);
    const body = updateFeedbackSubscriptionBodySchema.parse(request.body);
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }
    if (!(await requireFeedbackInScope(reply, params.feedbackId, context.scope))) {
      return reply;
    }

    const result = await setFeedbackSubscriptionMode(params.feedbackId, body.mode, {
      id: context.user.id,
      scope: context.scope,
    });
    if (result.status === "notFound") {
      return reply.code(404).send({ error: "Feedback not found" });
    }
    if (result.status === "invalid") {
      return reply.code(400).send({ error: "Feedback subscription is invalid" });
    }

    return { subscription: { mode: result.mode } };
  });
}

function contentDispositionHeader(disposition: "attachment" | "inline", fileName: string) {
  const fallback = (fileName || "attachment")
    .replace(/["\\\r\n]/g, "_")
    .replace(/[^\x20-\x7e]/g, "_")
    .trim() || "attachment";
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName || "attachment")}`;
}
