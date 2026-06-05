import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import {
  requireAdminContext,
  requireObjectiveContentEditContext,
  requireTargetInScope,
  requireUserScopeContext,
  requireWriteContext,
} from "../auth/accessPolicy";
import {
  acceptObjectiveChallenge,
  applyForObjectiveChallenge,
  approveObjectiveChallengeApplication,
  canDeleteObjective,
  createObjective,
  createObjectiveAlignmentRequest,
  createProject,
  deleteProject,
  deleteObjective,
  freezeObjectiveAfterReestimate,
  publishObjective,
  recruitObjectiveChallengers,
  rejectObjectiveChallengeApplication,
  reviewObjectiveAlignmentRequest,
  reviewObjectiveLoot,
  reviewObjectiveTrialReview,
  submitObjectiveLoot,
  submitObjectiveTrialReview,
  updateObjectiveDetails,
  updateObjectiveProject,
} from "../repositories/orfRepository";
import { isDateOnlyString } from "../../src/utils/date";

const lootResultClaimStatusSchema = z.enum(["completed", "falsified", "notClaimed"]);
const objectiveAcceptedResultSchema = z.enum(["completed", "falsified", "overturned", "abandoned", "overdelivered"]);
const resultAcceptedResultSchema = z.enum(["unreviewed", "completed", "falsified", "failed"]);
const requiredTextSchema = z.string().trim().min(1);
const optionalTextSchema = z.string().trim().transform((value) => value || undefined).optional();
const optionalNullableTextSchema = z.string().trim().transform((value) => value || null).nullable().optional();
const objectiveParamsSchema = z.object({ objectiveId: z.string().min(1) });
const projectParamsSchema = z.object({ projectId: z.string().min(1) });
const trialReviewParamsSchema = objectiveParamsSchema.extend({ trialReviewId: z.string().min(1) });
const alignmentRequestParamsSchema = objectiveParamsSchema.extend({ alignmentRequestId: z.string().min(1) });
const applicationParamsSchema = objectiveParamsSchema.extend({ applicationId: z.string().min(1) });
const optionalDateTimeSchema = z.string().trim().datetime().transform((value) => value || undefined).optional();
const dateOnlySchema = z.string().trim().refine(isDateOnlyString, { message: "Invalid date" });
const createObjectiveBodySchema = z.object({
  title: z.string().trim().min(1),
  whyItMatters: z.string().trim().min(1),
  projectId: optionalNullableTextSchema,
  cycle: z.string().trim().min(1),
  boundary: z.string().trim().min(1),
  finalDueAt: dateOnlySchema.optional(),
});
const createProjectBodySchema = z.object({
  name: requiredTextSchema,
});
const objectiveDetailsBodySchema = z.object({
  title: requiredTextSchema.optional(),
  finalDueAt: dateOnlySchema.optional(),
}).refine((body) => body.title !== undefined || body.finalDueAt !== undefined, { message: "No objective fields to update" });
const objectiveProjectBodySchema = z.object({
  projectId: optionalNullableTextSchema,
});
const recruitBodySchema = z.object({
  members: z.array(z.string().trim().min(1)).min(1),
});
const challengeApplicationBodySchema = z.object({
  reason: requiredTextSchema,
});
const submitLootBodySchema = z.object({
  body: z.string().trim().min(1),
  resultClaims: z.array(z.object({
    resultId: z.string().min(1),
    claim: lootResultClaimStatusSchema,
    evidenceText: z.string().trim(),
  })).min(1),
  selfTestReportUrl: z.string().trim().optional().nullable(),
  selfTestReportBody: z.string().trim().optional().nullable(),
});
const reviewTrialBodySchema = z.object({
  status: z.enum(["approved", "needsWork"]),
  commanderFeedback: requiredTextSchema,
});
const createAlignmentRequestBodySchema = z.object({
  kind: z.enum(["reestimateCompletion", "acceptance"]),
  scheduledAt: optionalDateTimeSchema,
  meetingRoom: optionalTextSchema,
  note: optionalTextSchema,
});
const reviewAlignmentRequestBodySchema = z.object({
  status: z.enum(["scheduled", "completed", "needsWork", "cancelled"]),
  scheduledAt: optionalDateTimeSchema,
  meetingRoom: optionalTextSchema,
  commanderFeedback: optionalTextSchema,
});
const contributionAllocationSchema = z.object({
  member: z.string().trim().min(1),
  memberUserId: z.string().trim().min(1).nullable().optional(),
  ratio: z.number().min(0).max(1),
});
const reviewLootBodySchema = z.object({
  lootId: z.string().min(1).optional(),
  acceptedResult: objectiveAcceptedResultSchema.optional(),
  resultReviews: z.array(z.object({
    resultId: z.string().min(1),
    acceptedResult: resultAcceptedResultSchema,
  })).optional(),
  contributionResolution: z.object({
    ratios: z.array(contributionAllocationSchema).min(1),
    reason: z.string().trim().min(1),
  }).optional(),
  reason: z.string().trim().optional(),
});

async function requireObjectiveDeleteUnlocked(reply: FastifyReply, objectiveId: string) {
  const access = await canDeleteObjective(objectiveId);
  if (access.status === "notFound") {
    reply.code(404).send({ error: "Objective not found" });
    return false;
  }

  if (access.status === "locked") {
    reply.code(409).send({ error: "Objective cannot be deleted after submission or settlement", flowStatus: access.flowStatus });
    return false;
  }

  return true;
}

function sendObjectiveFlowOutcome(reply: FastifyReply, outcome: Awaited<ReturnType<typeof publishObjective>>) {
  if (outcome.status === "notFound") {
    return reply.code(404).send({ error: "Objective not found" });
  }

  if (outcome.status === "invalid") {
    return reply.code(409).send({ error: "Objective status does not allow this operation" });
  }

  return { objective: outcome.objective };
}

function sendLootOutcome(reply: FastifyReply, outcome: Awaited<ReturnType<typeof submitObjectiveLoot>>) {
  if (outcome.status === "notFound") {
    return reply.code(404).send({ error: "Objective not found" });
  }

  if (outcome.status === "forbidden") {
    return reply.code(403).send({ error: "Only challengers can submit loot" });
  }

  if (outcome.status === "invalid") {
    return reply.code(400).send({ error: "Loot submission is incomplete" });
  }

  if (outcome.status === "closed") {
    return reply.code(409).send({ error: "Objective must be frozen before loot submission" });
  }

  return { loot: outcome.loot };
}

function sendObjectiveDetailsOutcome(reply: FastifyReply, outcome: Awaited<ReturnType<typeof updateObjectiveDetails>>) {
  if (outcome.status === "notFound") {
    return reply.code(404).send({ error: "Objective not found" });
  }

  if (outcome.status === "invalid") {
    return reply.code(400).send({ error: "Objective details are incomplete or invalid" });
  }

  if (outcome.status === "locked") {
    return reply.code(409).send({ error: "Objective deadline is locked for the current lifecycle state" });
  }

  return { objective: outcome.objective };
}

function sendTrialReviewOutcome(
  reply: FastifyReply,
  outcome: Awaited<ReturnType<typeof submitObjectiveTrialReview>> | Awaited<ReturnType<typeof reviewObjectiveTrialReview>>,
) {
  if (outcome.status === "notFound") {
    return reply.code(404).send({ error: "Objective trial review not found" });
  }

  if (outcome.status === "forbidden") {
    return reply.code(403).send({ error: "Only challengers can request objective trial review" });
  }

  if (outcome.status === "invalid") {
    return reply.code(400).send({ error: "Objective trial review is incomplete" });
  }

  if (outcome.status === "closed") {
    return reply.code(409).send({ error: "Objective must be frozen before trial review" });
  }

  if (outcome.status === "duplicate") {
    return reply.code(409).send({ error: "Objective already has a trial review" });
  }

  return { trialReview: outcome.trialReview };
}

function sendAlignmentRequestOutcome(
  reply: FastifyReply,
  outcome: Awaited<ReturnType<typeof createObjectiveAlignmentRequest>> | Awaited<ReturnType<typeof reviewObjectiveAlignmentRequest>>,
) {
  if (outcome.status === "notFound") {
    return reply.code(404).send({ error: "Objective alignment request not found" });
  }

  if (outcome.status === "forbidden") {
    return reply.code(403).send({ error: "Only objective challengers can request alignment" });
  }

  if (outcome.status === "invalid") {
    return reply.code(400).send({ error: "Objective alignment request is invalid" });
  }

  if (outcome.status === "closed") {
    return reply.code(409).send({ error: "Objective is not open for this alignment request" });
  }

  if (outcome.status === "duplicate") {
    return reply.code(409).send({ error: "Objective already has an open alignment request" });
  }

  return { alignmentRequest: outcome.request };
}

export function registerOrfObjectiveRoutes(app: FastifyInstance) {
  app.post("/api/projects", async (request, reply) => {
    const context = await requireAdminContext(request, reply);
    if (!context) {
      return reply;
    }

    const body = createProjectBodySchema.parse(request.body);
    const outcome = await createProject(body, { scope: context.scope, userId: context.user.id });
    if (outcome.status === "invalid") {
      return reply.code(400).send({ error: "Project name is required" });
    }
    if (outcome.status === "duplicate") {
      return reply.code(409).send({ error: "Project already exists", project: outcome.project });
    }

    return { project: outcome.project };
  });

  app.delete("/api/projects/:projectId", async (request, reply) => {
    const params = projectParamsSchema.parse(request.params);
    const context = await requireAdminContext(request, reply);
    if (!context) {
      return reply;
    }

    const outcome = await deleteProject(params.projectId, { scope: context.scope, userId: context.user.id });
    if (outcome.status === "notFound") {
      return reply.code(404).send({ error: "Project not found" });
    }

    return { project: outcome.project };
  });

  app.post("/api/objectives", async (request, reply) => {
    const context = await requireWriteContext(request, reply, "objective.create");
    if (!context) {
      return reply;
    }

    const body = createObjectiveBodySchema.parse(request.body);
    const objective = await createObjective(body, { scope: context.scope, userId: context.user.id });
    if (!objective) {
      return reply.code(400).send({ error: "Project not found" });
    }

    return { objective };
  });

  app.patch("/api/objectives/:objectiveId", async (request, reply) => {
    const params = objectiveParamsSchema.parse(request.params);
    const body = objectiveDetailsBodySchema.parse(request.body);
    const context = await requireObjectiveContentEditContext(request, reply);
    if (!context) {
      return reply;
    }
    if (!(await requireTargetInScope(reply, { type: "objective", id: params.objectiveId }, context.scope, "Objective not found"))) {
      return reply;
    }

    return sendObjectiveDetailsOutcome(reply, await updateObjectiveDetails(params.objectiveId, body, context.user.id));
  });

  app.patch("/api/objectives/:objectiveId/project", async (request, reply) => {
    const params = objectiveParamsSchema.parse(request.params);
    const body = objectiveProjectBodySchema.parse(request.body);
    const context = await requireAdminContext(request, reply);
    if (!context) {
      return reply;
    }

    return sendObjectiveDetailsOutcome(reply, await updateObjectiveProject(params.objectiveId, body, { scope: context.scope, userId: context.user.id }));
  });

  app.patch("/api/objectives/:objectiveId/publish", async (request, reply) => {
    const context = await requireAdminContext(request, reply);
    if (!context) {
      return reply;
    }

    const params = objectiveParamsSchema.parse(request.params);
    if (!(await requireTargetInScope(reply, { type: "objective", id: params.objectiveId }, context.scope, "Objective not found"))) {
      return reply;
    }
    return sendObjectiveFlowOutcome(reply, await publishObjective(params.objectiveId, context.user.id));
  });

  app.post("/api/objectives/:objectiveId/recruitments", async (request, reply) => {
    const context = await requireAdminContext(request, reply);
    if (!context) {
      return reply;
    }

    const params = objectiveParamsSchema.parse(request.params);
    const body = recruitBodySchema.parse(request.body);
    if (!(await requireTargetInScope(reply, { type: "objective", id: params.objectiveId }, context.scope, "Objective not found"))) {
      return reply;
    }
    return sendObjectiveFlowOutcome(reply, await recruitObjectiveChallengers(params.objectiveId, body.members, context.user.id));
  });

  app.patch("/api/objectives/:objectiveId/challenge-applications/:applicationId/approve", async (request, reply) => {
    const context = await requireAdminContext(request, reply);
    if (!context) {
      return reply;
    }

    const params = applicationParamsSchema.parse(request.params);
    if (!(await requireTargetInScope(reply, { type: "objective", id: params.objectiveId }, context.scope, "Objective not found"))) {
      return reply;
    }
    return sendObjectiveFlowOutcome(
      reply,
      await approveObjectiveChallengeApplication(params.objectiveId, params.applicationId, context.user.id),
    );
  });

  app.patch("/api/objectives/:objectiveId/challenge-applications/:applicationId/reject", async (request, reply) => {
    const context = await requireAdminContext(request, reply);
    if (!context) {
      return reply;
    }

    const params = applicationParamsSchema.parse(request.params);
    if (!(await requireTargetInScope(reply, { type: "objective", id: params.objectiveId }, context.scope, "Objective not found"))) {
      return reply;
    }
    return sendObjectiveFlowOutcome(
      reply,
      await rejectObjectiveChallengeApplication(params.objectiveId, params.applicationId, context.user.id),
    );
  });

  app.patch("/api/objectives/:objectiveId/freeze", async (request, reply) => {
    const context = await requireAdminContext(request, reply);
    if (!context) {
      return reply;
    }

    const params = objectiveParamsSchema.parse(request.params);
    if (!(await requireTargetInScope(reply, { type: "objective", id: params.objectiveId }, context.scope, "Objective not found"))) {
      return reply;
    }
    return sendObjectiveFlowOutcome(reply, await freezeObjectiveAfterReestimate(params.objectiveId, context.user.id));
  });

  app.post("/api/objectives/:objectiveId/alignment-requests", async (request, reply) => {
    const params = objectiveParamsSchema.parse(request.params);
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }
    if (!(await requireTargetInScope(reply, { type: "objective", id: params.objectiveId }, context.scope, "Objective not found"))) {
      return reply;
    }

    const body = createAlignmentRequestBodySchema.parse(request.body);
    return sendAlignmentRequestOutcome(reply, await createObjectiveAlignmentRequest(params.objectiveId, body, context.user));
  });

  app.patch("/api/objectives/:objectiveId/alignment-requests/:alignmentRequestId", async (request, reply) => {
    const context = await requireAdminContext(request, reply);
    if (!context) {
      return reply;
    }

    const params = alignmentRequestParamsSchema.parse(request.params);
    if (!(await requireTargetInScope(reply, { type: "objective", id: params.objectiveId }, context.scope, "Objective not found"))) {
      return reply;
    }
    const body = reviewAlignmentRequestBodySchema.parse(request.body);
    return sendAlignmentRequestOutcome(
      reply,
      await reviewObjectiveAlignmentRequest(params.objectiveId, params.alignmentRequestId, body, context.user.id),
    );
  });

  app.post("/api/objectives/:objectiveId/review", async (request, reply) => {
    const context = await requireAdminContext(request, reply);
    if (!context) {
      return reply;
    }

    const params = objectiveParamsSchema.parse(request.params);
    const body = reviewLootBodySchema.parse(request.body);
    if (!(await requireTargetInScope(reply, { type: "objective", id: params.objectiveId }, context.scope, "Objective not found"))) {
      return reply;
    }
    return sendObjectiveFlowOutcome(reply, await reviewObjectiveLoot(params.objectiveId, body, context.user.id));
  });

  app.patch("/api/objectives/:objectiveId/challenge", async (request, reply) => {
    const params = objectiveParamsSchema.parse(request.params);
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }
    const { user } = context;
    if (!(await requireTargetInScope(reply, { type: "objective", id: params.objectiveId }, context.scope, "Objective not found"))) {
      return reply;
    }
    if (user.role !== "member" || user.status !== "active") {
      return reply.code(403).send({ error: "Only active members can accept objective challenges" });
    }

    const outcome = await acceptObjectiveChallenge(params.objectiveId, user.name, user.id);

    if (outcome.status === "notFound") {
      return reply.code(404).send({ error: "Objective not found" });
    }

    if (outcome.status === "forbidden") {
      return reply.code(403).send({ error: "This objective was not recruited for the current user" });
    }

    if (outcome.status === "closed") {
      return reply.code(409).send({ error: "Objective is not open for challenge acceptance" });
    }

    if (outcome.status === "alreadyAccepted") {
      return reply.code(409).send({ error: "Objective already includes this challenger", challengers: outcome.challengers });
    }

    if (outcome.status === "invalidDueDate") {
      return reply.code(409).send({ error: "Objective final due date is too close to start confirmation" });
    }

    return { objective: outcome.objective };
  });

  app.post("/api/objectives/:objectiveId/challenge-applications", async (request, reply) => {
    const params = objectiveParamsSchema.parse(request.params);
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }
    const { user } = context;
    if (!(await requireTargetInScope(reply, { type: "objective", id: params.objectiveId }, context.scope, "Objective not found"))) {
      return reply;
    }
    if (user.role !== "member" || user.status !== "active") {
      return reply.code(403).send({ error: "Only active members can apply for objective challenges" });
    }

    const body = challengeApplicationBodySchema.parse(request.body);
    const outcome = await applyForObjectiveChallenge(params.objectiveId, user.name, user.id, body.reason);

    if (outcome.status === "notFound") {
      return reply.code(404).send({ error: "Objective not found" });
    }
    if (outcome.status === "alreadyAccepted") {
      return reply.code(409).send({ error: "Objective already includes this challenger", challengers: outcome.challengers });
    }
    if (outcome.status === "alreadyRecruited") {
      return reply.code(409).send({ error: "Objective already recruited this challenger" });
    }
    if (outcome.status === "alreadyApplied") {
      return reply.code(409).send({ error: "Challenge application already exists" });
    }
    if (outcome.status === "forbidden") {
      return reply.code(403).send({ error: "Only active members can apply for objective challenges" });
    }
    if (outcome.status === "invalidReason") {
      return reply.code(400).send({ error: "Challenge application reason is required" });
    }
    if (outcome.status === "closed") {
      return reply.code(409).send({ error: "Objective is not open for challenge applications" });
    }

    return { objective: outcome.objective };
  });

  app.post("/api/objectives/:objectiveId/loot", async (request, reply) => {
    const params = objectiveParamsSchema.parse(request.params);
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }
    const { user, scope } = context;
    if (!(await requireTargetInScope(reply, { type: "objective", id: params.objectiveId }, scope, "Objective not found"))) {
      return reply;
    }

    const body = submitLootBodySchema.parse(request.body);
    return sendLootOutcome(reply, await submitObjectiveLoot(params.objectiveId, body, user));
  });

  app.post("/api/objectives/:objectiveId/trial-reviews", async (request, reply) => {
    const params = objectiveParamsSchema.parse(request.params);
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }
    const { user, scope } = context;
    if (!(await requireTargetInScope(reply, { type: "objective", id: params.objectiveId }, scope, "Objective not found"))) {
      return reply;
    }

    const body = submitLootBodySchema.parse(request.body);
    return sendTrialReviewOutcome(reply, await submitObjectiveTrialReview(params.objectiveId, body, user));
  });

  app.patch("/api/objectives/:objectiveId/trial-reviews/:trialReviewId", async (request, reply) => {
    const context = await requireAdminContext(request, reply);
    if (!context) {
      return reply;
    }

    const params = trialReviewParamsSchema.parse(request.params);
    const body = reviewTrialBodySchema.parse(request.body);
    if (!(await requireTargetInScope(reply, { type: "objective", id: params.objectiveId }, context.scope, "Objective not found"))) {
      return reply;
    }
    return sendTrialReviewOutcome(reply, await reviewObjectiveTrialReview(params.objectiveId, params.trialReviewId, body, context.user.id));
  });

  app.post("/api/objectives/:objectiveId/contribution-reviews", async (request, reply) => {
    const params = objectiveParamsSchema.parse(request.params);
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }
    if (!(await requireTargetInScope(reply, { type: "objective", id: params.objectiveId }, context.scope, "Objective not found"))) {
      return reply;
    }

    return reply.code(410).send({ error: "Anonymous contribution reviews must be submitted to the local settlement service" });
  });

  app.delete("/api/objectives/:objectiveId", async (request, reply) => {
    const params = objectiveParamsSchema.parse(request.params);
    const context = await requireWriteContext(request, reply, "objective.delete");
    if (!context) {
      return reply;
    }
    if (!(await requireTargetInScope(reply, { type: "objective", id: params.objectiveId }, context.scope, "Objective not found"))) {
      return reply;
    }
    if (!(await requireObjectiveDeleteUnlocked(reply, params.objectiveId))) {
      return reply;
    }

    const deleted = await deleteObjective(params.objectiveId);

    if (!deleted) {
      return reply.code(404).send({ error: "Objective not found" });
    }

    return { ok: true };
  });
}
