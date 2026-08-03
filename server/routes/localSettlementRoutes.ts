import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { requireAdminContext, requireTargetInScope, requireUserScopeContext } from "../auth/accessPolicy";
import { db } from "../db/client";
import { objectiveSettlementEvents, objectives } from "../db/schema";
import {
  fetchLocalSettlementService,
  LocalSettlementServiceUnavailableError,
  localSettlementProxyBasePath,
  type LocalSettlementServiceResponse,
} from "../localSettlement/localSettlementProxy";
import { runtimeScopeStorageId, type RuntimeScope } from "../repositories/runtimeScope";
import { canSubmitObjectiveContributionReviewByFlow } from "../../src/domain/orfLifecycle";
import { objectiveSettlementReviewWindow } from "../../src/domain/orfSettlement";
import { isObjectiveChallenger, objectiveChallengerTargets, objectiveChallengerUserIds } from "../../src/domain/orfObjectiveParticipants";
import type { ContributionReviewDraftPercentAllocation, ContributionReviewPercentAllocation } from "../../src/types/orf";
import { localDateString } from "../../src/utils/date";
import { getUserMapsForStorageScope } from "../readModels/orfReadModelMappers";

const objectiveParamsSchema = z.object({ objectiveId: z.string().min(1) });
const settlementSummaryBodySchema = z.object({
  participantUserIds: z.array(z.string().trim().min(1)).optional(),
});
const draftAllocationSchema = z.object({
  input: z.string(),
  member: z.string().min(1),
  memberUserId: z.string().min(1),
});
const submitAllocationSchema = z.object({
  member: z.string().min(1),
  memberUserId: z.string().min(1),
  percent: z.number().int().min(0).max(100),
});
const reviewDraftBodySchema = z.discriminatedUnion("kind", [
  z.object({
    allocations: z.array(draftAllocationSchema).min(1),
    kind: z.literal("score"),
  }),
  z.object({
    abstentionReason: z.string(),
    kind: z.literal("abstain"),
  }),
]);
const reviewSubmitBodySchema = z.discriminatedUnion("kind", [
  z.object({
    allocations: z.array(submitAllocationSchema).min(1),
    kind: z.literal("score"),
  }),
  z.object({
    abstentionReason: z.string(),
    kind: z.literal("abstain"),
  }),
]);
type SettlementObjective = Pick<
  typeof objectives.$inferSelect,
  "challengerUserIds" | "finalDueAt" | "flowStatus" | "id" | "teamId" | "title"
>;
type ContributionTarget = {
  member: string;
  memberUserId: string;
};
type ReviewRouteContext = {
  challengers: string[];
  objective: SettlementObjective;
  targets: ContributionTarget[];
};

async function settlementObjectiveInScope(objectiveId: string, scope: RuntimeScope) {
  const [objective] = await db
    .select({
      challengerUserIds: objectives.challengerUserIds,
      finalDueAt: objectives.finalDueAt,
      flowStatus: objectives.flowStatus,
      id: objectives.id,
      teamId: objectives.teamId,
      title: objectives.title,
    })
    .from(objectives)
    .where(eq(objectives.id, objectiveId))
    .limit(1);

  if (!objective || objective.teamId !== runtimeScopeStorageId(scope)) return null;
  return objective;
}

async function contributionChallengerTargets(objective: SettlementObjective, participantUserIds?: string[]) {
  const { userNameById } = await getUserMapsForStorageScope(objective.teamId);
  const targets = objectiveChallengerTargets(objective, userNameById);

  if (!participantUserIds) return targets;

  const requestedIds = Array.from(new Set(participantUserIds.map((value) => value.trim()).filter(Boolean)));
  const objectiveUserIdSet = new Set(objectiveChallengerUserIds(objective));
  if (requestedIds.length === 0 || requestedIds.some((userId) => !objectiveUserIdSet.has(userId))) {
    return null;
  }

  const targetByUserId = new Map(targets.map((target) => [target.memberUserId, target]));
  return requestedIds.map((userId) => targetByUserId.get(userId)).filter((target): target is ContributionTarget => Boolean(target));
}

async function objectiveSettlementEventsForObjective(objectiveId: string) {
  return await db
    .select({ kind: objectiveSettlementEvents.kind })
    .from(objectiveSettlementEvents)
    .where(eq(objectiveSettlementEvents.objectiveId, objectiveId));
}

async function reviewRouteContext(input: {
  objectiveId: string;
  reply: FastifyReply;
  scope: RuntimeScope;
  user: { id: string; name: string; role: string };
}): Promise<ReviewRouteContext | null> {
  if (!(await requireTargetInScope(input.reply, { type: "objective", id: input.objectiveId }, input.scope, "Objective not found"))) {
    return null;
  }

  const objective = await settlementObjectiveInScope(input.objectiveId, input.scope);
  if (!objective) {
    input.reply.code(404).send({ error: "Objective not found" });
    return null;
  }
  if (
    input.user.role !== "member" ||
    !canSubmitObjectiveContributionReviewByFlow(objective) ||
    !objectiveSettlementReviewWindow({
      objective,
      settlementEvents: await objectiveSettlementEventsForObjective(objective.id),
      today: localDateString(new Date()),
    }).open ||
    !isObjectiveChallenger(objective, input.user.id)
  ) {
    input.reply.code(403).send({ error: "Forbidden" });
    return null;
  }

  const targets = await contributionChallengerTargets(objective);
  if (!targets || targets.length === 0) {
    input.reply.code(400).send({ error: "Invalid settlement participants" });
    return null;
  }

  return {
    challengers: targets.map((target) => target.member),
    objective,
    targets,
  };
}

function contributionTargetKey(target: ContributionTarget) {
  return target.memberUserId.trim();
}

function inputAllocationByTarget<T extends { member: string; memberUserId: string }>(
  allocations: T[],
  targets: ContributionTarget[],
) {
  const byKey = new Map<string, T>();
  for (const allocation of allocations) {
    const key = allocation.memberUserId?.trim();
    if (!key || byKey.has(key)) return null;
    byKey.set(key, allocation);
  }

  const ordered = targets.map((target) => byKey.get(contributionTargetKey(target)) ?? null);
  return ordered.every((allocation): allocation is T => allocation !== null) ? ordered : null;
}

function buildDraftAllocations(input: {
  allocations: z.infer<typeof draftAllocationSchema>[];
  targets: ContributionTarget[];
}): ContributionReviewDraftPercentAllocation[] | null {
  const allocations = inputAllocationByTarget(input.allocations, input.targets);
  if (!allocations) return null;
  return allocations.map((allocation, index) => ({
    input: allocation.input,
    member: input.targets[index]!.member,
    memberUserId: input.targets[index]!.memberUserId,
  }));
}

function buildSubmitAllocations(input: {
  allocations: z.infer<typeof submitAllocationSchema>[];
  targets: ContributionTarget[];
}): ContributionReviewPercentAllocation[] | null {
  const allocations = inputAllocationByTarget(input.allocations, input.targets);
  if (!allocations) return null;
  const totalPercent = allocations.reduce((sum, allocation) => sum + allocation.percent, 0);
  if (totalPercent !== 100) return null;
  return allocations.map((allocation, index) => ({
    member: input.targets[index]!.member,
    memberUserId: input.targets[index]!.memberUserId,
    percent: allocation.percent,
  }));
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

  app.get(`${localSettlementProxyBasePath}/objectives/:objectiveId/reviews/me`, async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) return reply;

    const params = objectiveParamsSchema.parse(request.params);
    const routeContext = await reviewRouteContext({
      objectiveId: params.objectiveId,
      reply,
      scope: context.scope,
      user: context.user,
    });
    if (!routeContext) return reply;

    try {
      return sendLocalSettlementResponse(
        reply,
        await fetchLocalSettlementService({
          body: {
            challengers: routeContext.challengers,
            reviewer: context.user.name,
            reviewerUserId: context.user.id,
            targets: routeContext.targets,
          },
          method: "POST",
          path: `/objectives/${encodeURIComponent(params.objectiveId)}/reviews/me`,
        }),
      );
    } catch (error) {
      if (error instanceof LocalSettlementServiceUnavailableError) return sendLocalSettlementUnavailable(reply);
      throw error;
    }
  });

  app.put(`${localSettlementProxyBasePath}/objectives/:objectiveId/reviews/draft`, async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) return reply;

    const params = objectiveParamsSchema.parse(request.params);
    const routeContext = await reviewRouteContext({
      objectiveId: params.objectiveId,
      reply,
      scope: context.scope,
      user: context.user,
    });
    if (!routeContext) return reply;

    const body = reviewDraftBodySchema.parse(request.body);
    const payload = body.kind === "abstain"
      ? {
          abstentionReason: body.abstentionReason,
          kind: "abstain" as const,
          objectiveId: params.objectiveId,
          objectiveTitle: routeContext.objective.title,
          reviewer: context.user.name,
          reviewerUserId: context.user.id,
          version: 1 as const,
        }
      : {
          allocations: buildDraftAllocations({
            allocations: body.allocations,
            targets: routeContext.targets,
          }),
          kind: "score" as const,
          objectiveId: params.objectiveId,
          objectiveTitle: routeContext.objective.title,
          reviewer: context.user.name,
          reviewerUserId: context.user.id,
          version: 1 as const,
        };
    if (payload.kind === "score" && !payload.allocations) {
      return reply.code(400).send({ error: "Invalid contribution review allocations" });
    }

    try {
      return sendLocalSettlementResponse(
        reply,
        await fetchLocalSettlementService({
          body: { challengers: routeContext.challengers, payload, targets: routeContext.targets },
          method: "PUT",
          path: `/objectives/${encodeURIComponent(params.objectiveId)}/reviews/draft`,
        }),
      );
    } catch (error) {
      if (error instanceof LocalSettlementServiceUnavailableError) return sendLocalSettlementUnavailable(reply);
      throw error;
    }
  });

  app.delete(`${localSettlementProxyBasePath}/objectives/:objectiveId/reviews/draft`, async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) return reply;

    const params = objectiveParamsSchema.parse(request.params);
    const routeContext = await reviewRouteContext({
      objectiveId: params.objectiveId,
      reply,
      scope: context.scope,
      user: context.user,
    });
    if (!routeContext) return reply;

    try {
      return sendLocalSettlementResponse(
        reply,
        await fetchLocalSettlementService({
          body: { reviewer: context.user.name, reviewerUserId: context.user.id },
          method: "DELETE",
          path: `/objectives/${encodeURIComponent(params.objectiveId)}/reviews/draft`,
        }),
      );
    } catch (error) {
      if (error instanceof LocalSettlementServiceUnavailableError) return sendLocalSettlementUnavailable(reply);
      throw error;
    }
  });

  app.post(`${localSettlementProxyBasePath}/objectives/:objectiveId/reviews/submit`, async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) return reply;

    const params = objectiveParamsSchema.parse(request.params);
    const routeContext = await reviewRouteContext({
      objectiveId: params.objectiveId,
      reply,
      scope: context.scope,
      user: context.user,
    });
    if (!routeContext) return reply;

    const body = reviewSubmitBodySchema.parse(request.body);
    const payload = body.kind === "abstain"
      ? {
          abstentionReason: body.abstentionReason,
          kind: "abstain" as const,
          objectiveId: params.objectiveId,
          objectiveTitle: routeContext.objective.title,
          reviewer: context.user.name,
          reviewerUserId: context.user.id,
          version: 1 as const,
        }
      : {
          allocations: buildSubmitAllocations({
            allocations: body.allocations,
            targets: routeContext.targets,
          }),
          kind: "score" as const,
          objectiveId: params.objectiveId,
          objectiveTitle: routeContext.objective.title,
          reviewer: context.user.name,
          reviewerUserId: context.user.id,
          version: 1 as const,
        };
    if (payload.kind === "score" && !payload.allocations) {
      return reply.code(400).send({ error: "Invalid contribution review allocations" });
    }

    try {
      return sendLocalSettlementResponse(
        reply,
        await fetchLocalSettlementService({
          body: { challengers: routeContext.challengers, payload, targets: routeContext.targets },
          method: "POST",
          path: `/objectives/${encodeURIComponent(params.objectiveId)}/reviews/submit`,
        }),
      );
    } catch (error) {
      if (error instanceof LocalSettlementServiceUnavailableError) return sendLocalSettlementUnavailable(reply);
      throw error;
    }
  });

  app.get(`${localSettlementProxyBasePath}/objectives/:objectiveId/reviews/me/history`, async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) return reply;

    const params = objectiveParamsSchema.parse(request.params);
    const routeContext = await reviewRouteContext({
      objectiveId: params.objectiveId,
      reply,
      scope: context.scope,
      user: context.user,
    });
    if (!routeContext) return reply;

    try {
      return sendLocalSettlementResponse(
        reply,
        await fetchLocalSettlementService({
          body: {
            challengers: routeContext.challengers,
            reviewer: context.user.name,
            reviewerUserId: context.user.id,
            targets: routeContext.targets,
          },
          method: "POST",
          path: `/objectives/${encodeURIComponent(params.objectiveId)}/reviews/history`,
        }),
      );
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

    const body = settlementSummaryBodySchema.parse(request.body ?? {});
    const objective = await settlementObjectiveInScope(params.objectiveId, context.scope);
    if (!objective) return reply.code(404).send({ error: "Objective not found" });
    if (
      !objectiveSettlementReviewWindow({
        objective,
        settlementEvents: await objectiveSettlementEventsForObjective(objective.id),
        today: localDateString(new Date()),
      }).open
    ) {
      return reply.code(409).send({ error: "Objective is not ready for settlement summary" });
    }

    const targets = await contributionChallengerTargets(objective, body.participantUserIds);
    if (!targets) return reply.code(400).send({ error: "Invalid settlement participants" });
    const challengers = targets.map((target) => target.member);
    try {
      return sendLocalSettlementResponse(
        reply,
        await fetchLocalSettlementService({
          body: { challengers, targets },
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
