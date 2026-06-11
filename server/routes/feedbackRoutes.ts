import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireFeedbackInScope, requireUserScopeContext } from "../auth/accessPolicy";
import { env } from "../env";
import { createFeedback, getFeedbackReferences, updateFeedbackStatus } from "../repositories/orfFeedbackRepository";

const impactSchema = z.enum(["Low", "Medium", "High", "Critical"]);
const feedbackStatusSchema = z.enum(["Open", "Closed"]);
const feedbackParamsSchema = z.object({ feedbackId: z.string().min(1) });
const createFeedbackBodySchema = z.object({
  phenomenon: z.string().trim().min(1),
  causeCategories: z.array(z.string().trim().min(1)).min(1),
  impact: impactSchema,
  initialBody: z.string().trim().min(1).optional(),
  suggestedAdjustment: z.string().trim().min(1).optional(),
  owner: z.string().trim().min(1),
}).refine((value) => value.initialBody || value.suggestedAdjustment, { message: "Feedback body is required" });
const createFeedbackMultipartFieldsSchema = z.object({
  phenomenon: z.string().trim().min(1),
  causeCategories: z.string().trim().min(1),
  impact: impactSchema,
  initialBody: z.string().trim().min(1),
  owner: z.string().trim().min(1),
});
const updateFeedbackStatusBodySchema = z.object({ status: feedbackStatusSchema });
const feedbackReferencesQuerySchema = z.object({
  id: z.union([z.string(), z.array(z.string())]).optional(),
  ids: z.string().optional(),
});

function parseCauseCategories(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return z.array(z.string().trim().min(1)).min(1).parse(parsed);
  } catch {
    return z.array(z.string().trim().min(1)).min(1).parse([]);
  }
}

function parseFeedbackReferenceIds(query: unknown) {
  const parsed = feedbackReferencesQuerySchema.parse(query);
  const repeatedIds = Array.isArray(parsed.id) ? parsed.id : parsed.id ? [parsed.id] : [];
  const commaSeparatedIds = parsed.ids?.split(",") ?? [];
  return [...repeatedIds, ...commaSeparatedIds].map((value) => value.trim()).filter(Boolean).slice(0, 100);
}

async function readCreateFeedbackBody(request: FastifyRequest) {
  const contentType = request.headers["content-type"] ?? "";
  if (!contentType.includes("multipart/form-data")) {
    const body = createFeedbackBodySchema.parse(request.body);
    return {
      phenomenon: body.phenomenon,
      causeCategories: body.causeCategories,
      impact: body.impact,
      initialBody: body.initialBody ?? body.suggestedAdjustment ?? "",
      owner: body.owner,
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
    phenomenon: body.phenomenon,
    causeCategories: parseCauseCategories(body.causeCategories),
    impact: body.impact,
    initialBody: body.initialBody,
    owner: body.owner,
    attachments,
  };
}

export function registerFeedbackRoutes(app: FastifyInstance) {
  app.get("/api/feedback/references", async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }

    const feedbackIds = parseFeedbackReferenceIds(request.query);
    const feedback = await getFeedbackReferences(feedbackIds, context.scope);
    return { feedback };
  });

  app.post("/api/feedback", async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }
    const { user, scope } = context;

    const body = await readCreateFeedbackBody(request);
    const outcome = await createFeedback(body, { ...user, scope });

    if (outcome.status === "notFound") {
      return reply.code(404).send({ error: "Runtime scope not found" });
    }
    if (outcome.status === "invalid") {
      return reply.code(400).send({ error: "Feedback body is required" });
    }
    if (outcome.status === "invalidOwner") {
      return reply.code(409).send({ error: "Feedback owner must be an active member" });
    }
    if (outcome.status === "tooLarge") {
      return reply.code(413).send({ error: "Image is too large" });
    }
    if (outcome.status === "unsupported") {
      return reply.code(415).send({ error: "Unsupported image type" });
    }

    return { feedback: outcome.feedback };
  });

  app.patch("/api/feedback/:feedbackId/status", async (request, reply) => {
    const params = feedbackParamsSchema.parse(request.params);
    const body = updateFeedbackStatusBodySchema.parse(request.body);
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }
    const { user, scope } = context;
    if (!(await requireFeedbackInScope(reply, params.feedbackId, scope))) {
      return reply;
    }

    const updated = await updateFeedbackStatus(params.feedbackId, body.status, {
      id: user.id,
      name: user.name,
      role: user.role,
      scope,
    });

    if (updated.status === "notFound") {
      return reply.code(404).send({ error: "Feedback not found" });
    }
    if (updated.status === "forbidden") {
      return reply.code(403).send({ error: "Forbidden" });
    }

    return { ok: true };
  });
}
