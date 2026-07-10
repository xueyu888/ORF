import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import {
  requireResultDeleteContext,
  requireResultEditContext,
  requireTargetInScope,
  requireUserScopeContext,
} from "../auth/accessPolicy";
import {
  getPermissionRulesForScope,
  hasRolePermission,
} from "../repositories/permissionRepository";
import {
  canEditObjectiveResultsDuringReestimate,
  canMutateObjectiveResults,
  canMutateResult,
  createResult,
  deleteResult,
  moveResult,
  proposeResultUpdate,
  updateResultConfidence,
  updateResultDetails,
  updateResultTitle,
  updateResultUncertaintyLevel,
} from "../repositories/orfRepository";

const metricDirectionSchema = z.enum(["increase", "decrease"]);
const uncertaintyLevelSchema = z.enum(["简易", "入门", "进阶", "破局", "渡劫", "飞升"]);
const bountySourceSchema = z.enum(["managerDefined", "memberProposed"]);
const requiredTextSchema = z.string().trim().min(1);
const optionalTextSchema = z.string().trim().transform((value) => value || undefined).optional();
const detailTextSchema = z.string().trim().nullable().optional();
const titleBodySchema = z.object({ title: requiredTextSchema });
const resultParamsSchema = z.object({ resultId: z.string().min(1) });
const placementSchema = z.enum(["before", "after"]);
const createResultBodySchema = z.object({
  objectiveId: requiredTextSchema,
  title: requiredTextSchema,
  detail: detailTextSchema,
  baseline: z.number().optional(),
  current: z.number().optional(),
  target: z.number().optional(),
  unit: optionalTextSchema,
  direction: metricDirectionSchema.optional(),
  uncertaintyLevel: uncertaintyLevelSchema.optional(),
  source: bountySourceSchema.optional(),
  definerUserId: z.string().trim().min(1).optional(),
});
const updateResultConfidenceBodySchema = z.object({ confidence: z.number().int().min(0).max(100) });
const updateResultUncertaintyBodySchema = z.object({ uncertaintyLevel: uncertaintyLevelSchema });
const updateResultDetailsBodySchema = z.object({
  detail: detailTextSchema,
}).refine((body) => "detail" in body, { message: "No result detail field to update" });
const resultUpdateProposalBodySchema = z.object({
  title: z.string().trim().min(1),
  reason: z.string().trim().min(1),
});
const moveResultBodySchema = z.object({
  referenceResultId: requiredTextSchema,
  placement: placementSchema.default("after"),
});

function sendObjectiveResultLock(reply: FastifyReply, access: Awaited<ReturnType<typeof canMutateResult>>): boolean {
  if (access.status === "notFound") {
    reply.code(404).send({ error: "Result not found" });
    return false;
  }

  if (access.status === "locked") {
    reply.code(409).send({ error: "Objective results are locked for this lifecycle state", flowStatus: access.flowStatus });
    return false;
  }

  return true;
}

async function requireObjectiveResultsUnlocked(reply: FastifyReply, objectiveId: string) {
  const access = await canMutateObjectiveResults(objectiveId);
  if (access.status === "notFound") {
    reply.code(404).send({ error: "Objective not found" });
    return false;
  }

  if (access.status === "locked") {
    reply.code(409).send({ error: "Objective results are locked for this lifecycle state", flowStatus: access.flowStatus });
    return false;
  }

  return true;
}

async function requireResultUnlocked(reply: FastifyReply, resultId: string) {
  return sendObjectiveResultLock(reply, await canMutateResult(resultId));
}

export function registerOrfResultRoutes(app: FastifyInstance) {
  app.post("/api/results", async (request, reply) => {
    const body = createResultBodySchema.parse(request.body);
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }
    const { user, scope } = context;
    if (!(await requireTargetInScope(reply, { type: "objective", id: body.objectiveId }, scope, "Objective not found"))) {
      return reply;
    }
    const permissionRules = await getPermissionRulesForScope(scope);
    const source = body.source ?? "managerDefined";
    const allowedByRole = user.role === "admin" || hasRolePermission(user.role, permissionRules, "result.create");
    const allowedByReestimate = await canEditObjectiveResultsDuringReestimate(body.objectiveId, user.id, scope);
    const allowed = source === "memberProposed" ? allowedByReestimate : allowedByRole;
    if (!allowed) {
      return reply.code(403).send({ error: "Forbidden" });
    }
    if (!(await requireObjectiveResultsUnlocked(reply, body.objectiveId))) {
      return reply;
    }

    const result = await createResult({
      ...body,
      actorId: user.id,
      source,
      definerUserId: source === "memberProposed" ? user.id : body.definerUserId ?? user.id,
    });

    if (!result) {
      return reply.code(404).send({ error: "Objective not found" });
    }

    return { result };
  });

  app.patch("/api/results/:resultId", async (request, reply) => {
    const params = resultParamsSchema.parse(request.params);
    const body = titleBodySchema.parse(request.body);
    const context = await requireResultEditContext(request, reply, params.resultId);
    if (!context) {
      return reply;
    }
    if (!(await requireResultUnlocked(reply, params.resultId))) {
      return reply;
    }

    const updated = await updateResultTitle(params.resultId, body.title, context.user.id);

    if (!updated) {
      return reply.code(404).send({ error: "Result not found" });
    }

    return { ok: true };
  });

  app.patch("/api/results/:resultId/details", async (request, reply) => {
    const params = resultParamsSchema.parse(request.params);
    const body = updateResultDetailsBodySchema.parse(request.body);
    const context = await requireResultEditContext(request, reply, params.resultId);
    if (!context) {
      return reply;
    }
    if (!(await requireResultUnlocked(reply, params.resultId))) {
      return reply;
    }

    const updated = await updateResultDetails(params.resultId, body.detail, context.user.id);

    if (!updated) {
      return reply.code(404).send({ error: "Result not found" });
    }

    return { ok: true };
  });

  app.patch("/api/results/:resultId/confidence", async (request, reply) => {
    const params = resultParamsSchema.parse(request.params);
    const body = updateResultConfidenceBodySchema.parse(request.body);
    const context = await requireResultEditContext(request, reply, params.resultId);
    if (!context) {
      return reply;
    }
    if (!(await requireResultUnlocked(reply, params.resultId))) {
      return reply;
    }

    const updated = await updateResultConfidence(params.resultId, body.confidence, context.user.id);

    if (!updated) {
      return reply.code(404).send({ error: "Result not found" });
    }

    return { ok: true };
  });

  app.patch("/api/results/:resultId/uncertainty", async (request, reply) => {
    const params = resultParamsSchema.parse(request.params);
    const body = updateResultUncertaintyBodySchema.parse(request.body);
    const context = await requireResultEditContext(request, reply, params.resultId);
    if (!context) {
      return reply;
    }
    if (!(await requireResultUnlocked(reply, params.resultId))) {
      return reply;
    }

    const updated = await updateResultUncertaintyLevel(params.resultId, body.uncertaintyLevel, context.user.id);

    if (!updated) {
      return reply.code(404).send({ error: "Result not found" });
    }

    return { ok: true };
  });

  app.post("/api/results/:resultId/update-proposal", async (request, reply) => {
    const params = resultParamsSchema.parse(request.params);
    const body = resultUpdateProposalBodySchema.parse(request.body);
    const context = await requireResultEditContext(request, reply, params.resultId);
    if (!context) {
      return reply;
    }
    if (!(await requireResultUnlocked(reply, params.resultId))) {
      return reply;
    }

    const updated = await proposeResultUpdate(
      { resultId: params.resultId, title: body.title, reason: body.reason },
      { id: context.user.id, name: context.user.name },
    );

    if (!updated) {
      return reply.code(404).send({ error: "Result not found" });
    }

    return { ok: true };
  });

  app.patch("/api/results/:resultId/order", async (request, reply) => {
    const params = resultParamsSchema.parse(request.params);
    const body = moveResultBodySchema.parse(request.body);
    const context = await requireResultEditContext(request, reply, params.resultId);
    if (!context) {
      return reply;
    }
    if (!(await requireTargetInScope(reply, { type: "result", id: body.referenceResultId }, context.scope, "Result move target not found"))) {
      return reply;
    }
    if (!(await requireResultUnlocked(reply, params.resultId))) {
      return reply;
    }

    const updated = await moveResult(params.resultId, body.referenceResultId, body.placement);

    if (!updated) {
      return reply.code(404).send({ error: "Result move target not found" });
    }

    return { ok: true };
  });

  app.delete("/api/results/:resultId", async (request, reply) => {
    const params = resultParamsSchema.parse(request.params);
    const context = await requireResultDeleteContext(request, reply, params.resultId);
    if (!context) {
      return reply;
    }
    if (!(await requireResultUnlocked(reply, params.resultId))) {
      return reply;
    }

    const deleted = await deleteResult(params.resultId);

    if (!deleted) {
      return reply.code(404).send({ error: "Result not found" });
    }

    return { ok: true };
  });
}
