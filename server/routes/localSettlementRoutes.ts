import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { requireAdminContext, requireTargetInScope, requireUserScopeContext } from "../auth/accessPolicy";
import { db } from "../db/client";
import { objectives } from "../db/schema";
import {
  fetchLocalSettlementService,
  LocalSettlementServiceUnavailableError,
  localSettlementProxyBasePath,
  type LocalSettlementServiceResponse,
} from "../localSettlement/localSettlementProxy";
import { runtimeScopeStorageId, type RuntimeScope } from "../repositories/runtimeScope";
import { canReviewObjectiveLootByFlow, canSubmitObjectiveContributionReviewByFlow } from "../../src/domain/orfLifecycle";
import { isObjectiveChallenger, objectiveParticipantSnapshot } from "../../src/domain/orfObjectiveParticipants";
import { getUserMapsForStorageScope } from "../readModels/orfReadModelMappers";

const objectiveParamsSchema = z.object({ objectiveId: z.string().min(1) });
const encryptedReviewEnvelopeSchema = z.object({
  ciphertext: z.string().min(1),
  encryptedKey: z.string().min(1),
  iv: z.string().min(1),
  keyId: z.string().min(1),
});

type SettlementObjective = Pick<
  typeof objectives.$inferSelect,
  "challengerUserIds" | "challengers" | "flowStatus" | "id" | "teamId"
>;

async function settlementObjectiveInScope(objectiveId: string, scope: RuntimeScope) {
  const [objective] = await db
    .select({
      challengerUserIds: objectives.challengerUserIds,
      challengers: objectives.challengers,
      flowStatus: objectives.flowStatus,
      id: objectives.id,
      teamId: objectives.teamId,
    })
    .from(objectives)
    .where(eq(objectives.id, objectiveId))
    .limit(1);

  if (!objective || objective.teamId !== runtimeScopeStorageId(scope)) return null;
  return objective;
}

async function contributionChallengerNames(objective: SettlementObjective) {
  const { userIdByName, userNameById } = await getUserMapsForStorageScope(objective.teamId);
  return objectiveParticipantSnapshot({
    challengerNames: objective.challengers,
    challengerUserIds: objective.challengerUserIds,
    userIdByName,
    userNameById,
  }).challengers;
}

function sendLocalSettlementResponse(reply: FastifyReply, response: LocalSettlementServiceResponse) {
  if (response.contentType) {
    reply.header("content-type", response.contentType);
  }

  return reply.code(response.status).send(response.body);
}

function sendLocalSettlementUnavailable(reply: FastifyReply) {
  return reply.code(502).send({ error: "Local settlement service unavailable" });
}

export function registerLocalSettlementRoutes(app: FastifyInstance) {
  app.get(`${localSettlementProxyBasePath}/health`, async (_request, reply) => {
    try {
      return sendLocalSettlementResponse(reply, await fetchLocalSettlementService({ method: "GET", path: "/health" }));
    } catch (error) {
      if (error instanceof LocalSettlementServiceUnavailableError) return sendLocalSettlementUnavailable(reply);
      throw error;
    }
  });

  app.get(`${localSettlementProxyBasePath}/public-key`, async (_request, reply) => {
    try {
      return sendLocalSettlementResponse(reply, await fetchLocalSettlementService({ method: "GET", path: "/public-key" }));
    } catch (error) {
      if (error instanceof LocalSettlementServiceUnavailableError) return sendLocalSettlementUnavailable(reply);
      throw error;
    }
  });

  app.post(`${localSettlementProxyBasePath}/objectives/:objectiveId/reviews`, async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) return reply;

    const params = objectiveParamsSchema.parse(request.params);
    if (!(await requireTargetInScope(reply, { type: "objective", id: params.objectiveId }, context.scope, "Objective not found"))) {
      return reply;
    }

    const objective = await settlementObjectiveInScope(params.objectiveId, context.scope);
    if (!objective) return reply.code(404).send({ error: "Objective not found" });
    if (
      context.user.role !== "member" ||
      !canSubmitObjectiveContributionReviewByFlow(objective) ||
      !isObjectiveChallenger(objective, context.user.id)
    ) {
      return reply.code(403).send({ error: "Forbidden" });
    }

    const body = encryptedReviewEnvelopeSchema.parse(request.body);
    try {
      return sendLocalSettlementResponse(reply, await fetchLocalSettlementService({ body, method: "POST", path: "/reviews" }));
    } catch (error) {
      if (error instanceof LocalSettlementServiceUnavailableError) return sendLocalSettlementUnavailable(reply);
      throw error;
    }
  });

  app.post(`${localSettlementProxyBasePath}/objectives/:objectiveId/summary`, async (request, reply) => {
    const context = await requireAdminContext(request, reply);
    if (!context) return reply;

    const params = objectiveParamsSchema.parse(request.params);
    if (!(await requireTargetInScope(reply, { type: "objective", id: params.objectiveId }, context.scope, "Objective not found"))) {
      return reply;
    }

    const objective = await settlementObjectiveInScope(params.objectiveId, context.scope);
    if (!objective) return reply.code(404).send({ error: "Objective not found" });
    if (!canReviewObjectiveLootByFlow(objective)) return reply.code(409).send({ error: "Objective is not ready for settlement summary" });

    const challengers = await contributionChallengerNames(objective);
    try {
      return sendLocalSettlementResponse(
        reply,
        await fetchLocalSettlementService({
          body: { challengers },
          method: "POST",
          path: `/objectives/${encodeURIComponent(params.objectiveId)}/summary`,
        }),
      );
    } catch (error) {
      if (error instanceof LocalSettlementServiceUnavailableError) return sendLocalSettlementUnavailable(reply);
      throw error;
    }
  });
}
