import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireFeedbackInScope, requireUserScopeContext } from "../auth/accessPolicy";
import { createFeedback, updateFeedbackStatus } from "../repositories/orfFeedbackRepository";

const impactSchema = z.enum(["Low", "Medium", "High", "Critical"]);
const feedbackStatusSchema = z.enum(["Open", "Closed"]);
const feedbackParamsSchema = z.object({ feedbackId: z.string().min(1) });
const createFeedbackBodySchema = z.object({
  phenomenon: z.string().trim().min(1),
  causeCategories: z.array(z.string().trim().min(1)).min(1),
  impact: impactSchema,
  suggestedAdjustment: z.string().trim().min(1),
  owner: z.string().trim().min(1),
});
const updateFeedbackStatusBodySchema = z.object({ status: feedbackStatusSchema });

export function registerFeedbackRoutes(app: FastifyInstance) {
  app.post("/api/feedback", async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }
    const { user, scope } = context;

    const body = createFeedbackBodySchema.parse(request.body);
    const outcome = await createFeedback(body, { ...user, scope });

    if (outcome.status === "notFound") {
      return reply.code(404).send({ error: "Runtime scope not found" });
    }
    if (outcome.status === "invalidOwner") {
      return reply.code(409).send({ error: "Feedback owner must be an active member" });
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
