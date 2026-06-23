import { and, asc, eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { requireAdminContext, requireTargetInScope, requireUserScopeContext } from "../auth/accessPolicy";
import { db } from "../db/client";
import { objectives, results } from "../db/schema";
import {
  fetchLocalSettlementService,
  LocalSettlementServiceUnavailableError,
  localSettlementProxyBasePath,
  type LocalSettlementServiceResponse,
} from "../localSettlement/localSettlementProxy";
import { runtimeScopeStorageId, type RuntimeScope } from "../repositories/runtimeScope";
import { canSettleObjectiveLootByFlow, canSubmitObjectiveContributionReviewByFlow } from "../../src/domain/orfLifecycle";
import { calibratedResultPoints } from "../../src/domain/orfSettlement";
import { isObjectiveChallenger, objectiveParticipantSnapshot } from "../../src/domain/orfObjectiveParticipants";
import type { ContributionReviewDraftMetricRow, ContributionReviewMetricRow } from "../../src/types/orf";
import { getUserMapsForStorageScope } from "../readModels/orfReadModelMappers";

const objectiveParamsSchema = z.object({ objectiveId: z.string().min(1) });
const settlementSummaryBodySchema = z.object({
  participantUserIds: z.array(z.string().trim().min(1)).optional(),
});
const draftMetricAllocationSchema = z.object({
  input: z.string(),
  member: z.string().min(1),
  memberUserId: z.string().min(1),
});
const draftMetricRowSchema = z.object({
  allocations: z.array(draftMetricAllocationSchema),
  metricId: z.string().min(1),
});
const submitMetricAllocationSchema = z.object({
  member: z.string().min(1),
  memberUserId: z.string().min(1),
  percent: z.number().int().min(0).max(100),
});
const submitMetricRowSchema = z.object({
  allocations: z.array(submitMetricAllocationSchema),
  metricId: z.string().min(1),
});
const reviewDraftBodySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("score"),
    metricRows: z.array(draftMetricRowSchema).min(1),
  }),
  z.object({
    abstentionReason: z.string(),
    kind: z.literal("abstain"),
  }),
]);
const reviewSubmitBodySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("score"),
    metricRows: z.array(submitMetricRowSchema).min(1),
  }),
  z.object({
    abstentionReason: z.string(),
    kind: z.literal("abstain"),
  }),
]);
type SettlementObjective = Pick<
  typeof objectives.$inferSelect,
  "challengerUserIds" | "flowStatus" | "id" | "teamId" | "title"
>;
type ContributionTarget = {
  member: string;
  memberUserId: string;
};
type ReviewMetricSource = {
  detail: string;
  id: string;
  isFallbackObjectiveRow: boolean;
  points: number;
  title: string;
};
type ReviewRouteContext = {
  challengers: string[];
  objective: SettlementObjective;
  targets: ContributionTarget[];
};

const objectiveFallbackMetricId = "__objective__";

async function settlementObjectiveInScope(objectiveId: string, scope: RuntimeScope) {
  const [objective] = await db
    .select({
      challengerUserIds: objectives.challengerUserIds,
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
  const snapshot = objectiveParticipantSnapshot({
    challengerUserIds: objective.challengerUserIds,
    userNameById,
  });

  const targets = snapshot.challengers.map((member, index) => ({
    member,
    memberUserId: snapshot.challengerUserIds[index]!,
  })).filter((target) => target.memberUserId);

  if (!participantUserIds) return targets;

  const requestedIds = Array.from(new Set(participantUserIds.map((value) => value.trim()).filter(Boolean)));
  const objectiveUserIdSet = new Set(snapshot.challengerUserIds);
  if (requestedIds.length === 0 || requestedIds.some((userId) => !objectiveUserIdSet.has(userId))) {
    return null;
  }

  const requestedTargets = requestedIds.map((userId) => ({
    member: userNameById.get(userId) ?? snapshot.challengers[snapshot.challengerUserIds.indexOf(userId)] ?? "",
    memberUserId: userId,
  }));
  return requestedTargets.every((target) => target.member.trim()) ? requestedTargets : null;
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

async function objectiveReviewMetricSources(objective: SettlementObjective): Promise<ReviewMetricSource[]> {
  const rows = await db
    .select({
      detail: results.detail,
      id: results.id,
      sortOrder: results.sortOrder,
      title: results.title,
      uncertaintyLevel: results.uncertaintyLevel,
      uncertaintyScore: results.uncertaintyScore,
    })
    .from(results)
    .where(and(eq(results.objectiveId, objective.id), eq(results.teamId, objective.teamId)))
    .orderBy(asc(results.sortOrder), asc(results.id));

  if (rows.length === 0) {
    return [
      {
        detail: "",
        id: objectiveFallbackMetricId,
        isFallbackObjectiveRow: true,
        points: 1,
        title: objective.title || "目标整体",
      },
    ];
  }

  return rows.map((row) => ({
    detail: row.detail,
    id: row.id,
    isFallbackObjectiveRow: false,
    points: calibratedResultPoints(row),
    title: row.title,
  }));
}

function contributionTargetKey(target: ContributionTarget) {
  return target.memberUserId.trim();
}

function sourceRowByMetricId<T extends { metricId: string }>(inputRows: T[], sourceRows: ReviewMetricSource[]) {
  const sourceById = new Map(sourceRows.map((row) => [row.id, row]));
  const seenInputIds = new Set<string>();
  for (const row of inputRows) {
    if (seenInputIds.has(row.metricId) || !sourceById.has(row.metricId)) {
      return null;
    }
    seenInputIds.add(row.metricId);
  }
  if (seenInputIds.size !== sourceRows.length) return null;
  return sourceById;
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

async function buildDraftMetricRows(input: {
  metricRows: z.infer<typeof draftMetricRowSchema>[];
  objective: SettlementObjective;
  targets: ContributionTarget[];
}): Promise<ContributionReviewDraftMetricRow[] | null> {
  const sources = await objectiveReviewMetricSources(input.objective);
  const sourceById = sourceRowByMetricId(input.metricRows, sources);
  if (!sourceById) return null;

  const rows: ContributionReviewDraftMetricRow[] = [];
  for (const row of input.metricRows) {
    const source = sourceById.get(row.metricId)!;
    const allocations = inputAllocationByTarget(row.allocations, input.targets);
    if (!allocations) return null;
    rows.push({
      allocations: allocations.map((allocation, index) => ({
        input: allocation.input,
        member: input.targets[index]!.member,
        memberUserId: input.targets[index]!.memberUserId,
      })),
      isFallbackObjectiveRow: source.isFallbackObjectiveRow,
      metricDetail: source.detail,
      metricId: source.id,
      metricTitle: source.title,
      points: source.points,
    });
  }
  return rows;
}

async function buildSubmitMetricRows(input: {
  metricRows: z.infer<typeof submitMetricRowSchema>[];
  objective: SettlementObjective;
  targets: ContributionTarget[];
}): Promise<ContributionReviewMetricRow[] | null> {
  const sources = await objectiveReviewMetricSources(input.objective);
  const sourceById = sourceRowByMetricId(input.metricRows, sources);
  if (!sourceById) return null;

  const rows: ContributionReviewMetricRow[] = [];
  for (const row of input.metricRows) {
    const source = sourceById.get(row.metricId)!;
    const allocations = inputAllocationByTarget(row.allocations, input.targets);
    if (!allocations) return null;
    rows.push({
      allocations: allocations.map((allocation, index) => ({
        member: input.targets[index]!.member,
        memberUserId: input.targets[index]!.memberUserId,
        percent: allocation.percent,
      })),
      isFallbackObjectiveRow: source.isFallbackObjectiveRow,
      metricDetail: source.detail,
      metricId: source.id,
      metricTitle: source.title,
      points: source.points,
    });
  }
  return rows;
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
          kind: "score" as const,
          metricRows: await buildDraftMetricRows({
            metricRows: body.metricRows,
            objective: routeContext.objective,
            targets: routeContext.targets,
          }),
          objectiveId: params.objectiveId,
          objectiveTitle: routeContext.objective.title,
          reviewer: context.user.name,
          reviewerUserId: context.user.id,
          version: 1 as const,
        };
    if (payload.kind === "score" && !payload.metricRows) {
      return reply.code(400).send({ error: "Invalid contribution review metric rows" });
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
          kind: "score" as const,
          metricRows: await buildSubmitMetricRows({
            metricRows: body.metricRows,
            objective: routeContext.objective,
            targets: routeContext.targets,
          }),
          objectiveId: params.objectiveId,
          objectiveTitle: routeContext.objective.title,
          reviewer: context.user.name,
          reviewerUserId: context.user.id,
          version: 1 as const,
        };
    if (payload.kind === "score" && !payload.metricRows) {
      return reply.code(400).send({ error: "Invalid contribution review metric rows" });
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
    if (!canSettleObjectiveLootByFlow(objective)) return reply.code(409).send({ error: "Objective is not ready for settlement summary" });

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
