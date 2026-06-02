import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify from "fastify";
import type { FastifyReply } from "fastify";
import { z, ZodError } from "zod";
import { registerAuthRoutes, requireAuthenticatedApi } from "./auth/routes";
import {
  authorizeObjectiveWorkItemMutation,
  requireAdminContext,
  requireFeedbackInScope,
  requireResultEditContext,
  requireTargetInScope,
  requireUserScopeContext,
  requireWorkItemTargetMutation,
  requireWriteContext,
} from "./auth/accessPolicy";
import { databaseUnavailablePayload, isDatabaseUnavailableError } from "./db/errors";
import { assertRuntimeDatabaseSchema, databaseSchemaMismatchPayload, isDatabaseSchemaMismatchError } from "./db/schemaGuard";
import { env } from "./env";
import { registerOptionalIntegrations } from "./integrations";
import {
  getPermissionRulesForScope,
  hasRolePermission,
} from "./repositories/permissionRepository";
import { getDefaultRuntimeScopeForUser } from "./repositories/runtimeScope";
import {
  acceptObjectiveChallenge,
  applyForObjectiveChallenge,
  approveObjectiveChallengeApplication,
  canDeleteObjective,
  canCreateFeedbackForResult,
  canEditObjectiveResultsDuringReestimate,
  canMutateObjectiveResults,
  canMutateResult,
  createChecklistItem,
  createFeedback,
  createObjective,
  createObjectiveAlignmentRequest,
  createResult,
  createTask,
  deleteChecklistItem,
  deleteObjective,
  deleteResult,
  deleteTask,
  freezeObjectiveAfterReestimate,
  moveChecklistItem,
  moveResult,
  moveTask,
  publishObjective,
  proposeResultUpdate,
  recruitObjectiveChallengers,
  rejectObjectiveChallengeApplication,
  reviewObjectiveLoot,
  reviewObjectiveAlignmentRequest,
  resolveObjectiveIdForWorkItem,
  setTaskCompletion,
  submitObjectiveLoot,
  submitObjectiveTrialReview,
  updateChecklistItemLabel,
  updateFeedbackStatus,
  updateObjectiveDetails,
  reviewObjectiveTrialReview,
  updateResultConfidence,
  updateResultUncertaintyLevel,
  updateResultTitle,
  updateChecklistItem,
  updateTaskTitle,
  updateTaskStatus,
} from "./repositories/orfRepository";
import {
  getScopedUsers,
} from "./repositories/userRepository";
import { registerSettingsRoutes } from "./routes/settingsRoutes";
import { registerNotificationRoutes } from "./routes/notificationRoutes";
import { registerOrfReadRoutes } from "./routes/orfReadRoutes";
import { registerCommentRoutes } from "./routes/commentRoutes";
import { registerUserRoutes } from "./routes/userRoutes";
import { registerUserAvatarRoutes } from "./users/avatar/avatarRoutes";
import { registerPermissionRoutes } from "./routes/permissionRoutes";
import { registerRealtimeRoutes } from "./routes/realtimeRoutes";
import { isDateOnlyString } from "../src/utils/date";

const taskStatusSchema = z.enum(["Backlog", "Todo", "In Progress", "In Review", "Done"]);
const prioritySchema = z.enum(["Low", "Medium", "High", "Critical"]);
const impactSchema = z.enum(["Low", "Medium", "High", "Critical"]);
const metricDirectionSchema = z.enum(["increase", "decrease"]);
const uncertaintyLevelSchema = z.enum(["入门", "进阶", "破局", "渡劫", "飞升"]);
const bountySourceSchema = z.enum(["managerDefined", "memberProposed"]);
const feedbackSourceSchema = z.enum(["User report", "Eval run", "Log", "Incident", "Team review"]);
const feedbackStatusSchema = z.enum(["New", "Reviewing", "Action Created", "Result Updated", "Closed"]);
const lootResultClaimStatusSchema = z.enum(["completed", "falsified", "notClaimed"]);
const objectiveAcceptedResultSchema = z.enum(["completed", "falsified", "overturned", "abandoned", "overdelivered"]);
const resultAcceptedResultSchema = z.enum(["unreviewed", "completed", "falsified", "failed"]);
const requiredTextSchema = z.string().trim().min(1);
const optionalTextSchema = z.string().trim().transform((value) => value || undefined).optional();
const updateTaskStatusBodySchema = z.object({ status: taskStatusSchema });
const titleBodySchema = z.object({ title: requiredTextSchema });
const labelBodySchema = z.object({ label: requiredTextSchema });
const completionBodySchema = z.object({ done: z.boolean() });
const taskParamsSchema = z.object({ taskId: z.string().min(1) });
const checklistParamsSchema = taskParamsSchema.extend({ itemId: z.string().min(1) });
const resultParamsSchema = z.object({ resultId: z.string().min(1) });
const objectiveParamsSchema = z.object({ objectiveId: z.string().min(1) });
const trialReviewParamsSchema = objectiveParamsSchema.extend({ trialReviewId: z.string().min(1) });
const alignmentRequestParamsSchema = objectiveParamsSchema.extend({ alignmentRequestId: z.string().min(1) });
const applicationParamsSchema = objectiveParamsSchema.extend({ applicationId: z.string().min(1) });
const feedbackParamsSchema = z.object({ feedbackId: z.string().min(1) });
const optionalDateTimeSchema = z.string().trim().datetime().transform((value) => value || undefined).optional();
const dateOnlySchema = z.string().trim().refine(isDateOnlyString, { message: "Invalid date" });
const optionalDateOnlySchema = z.string().trim().transform((value) => value || undefined).pipe(dateOnlySchema.optional()).optional();
const placementSchema = z.enum(["before", "after"]);
const createResultBodySchema = z.object({
  objectiveId: requiredTextSchema,
  title: requiredTextSchema,
  metricName: requiredTextSchema,
  description: optionalTextSchema,
  baseline: z.number().optional(),
  current: z.number().optional(),
  target: z.number().optional(),
  unit: optionalTextSchema,
  direction: metricDirectionSchema.optional(),
  uncertaintyLevel: uncertaintyLevelSchema.optional(),
  source: bountySourceSchema.optional(),
  definer: optionalTextSchema,
});
const createObjectiveBodySchema = z.object({
  title: z.string().trim().min(1),
  whyItMatters: z.string().trim().min(1),
  cycle: z.string().trim().min(1),
  boundary: z.string().trim().min(1),
  finalDueAt: dateOnlySchema.optional(),
});
const objectiveDetailsBodySchema = z.object({
  title: requiredTextSchema.optional(),
  finalDueAt: dateOnlySchema.optional(),
}).refine((body) => body.title !== undefined || body.finalDueAt !== undefined, { message: "No objective fields to update" });
const createFeedbackBodySchema = z.object({
  phenomenon: z.string().trim().min(1),
  causeCategories: z.array(z.string().trim().min(1)).min(1),
  impact: impactSchema,
  linkedResultId: z.string().min(1),
  suggestedAdjustment: z.string().trim().min(1),
  source: feedbackSourceSchema,
  owner: z.string().trim().min(1),
});
const updateFeedbackStatusBodySchema = z.object({ status: feedbackStatusSchema });
const updateResultConfidenceBodySchema = z.object({ confidence: z.number().int().min(0).max(100) });
const updateResultUncertaintyBodySchema = z.object({ uncertaintyLevel: uncertaintyLevelSchema });
const resultUpdateProposalBodySchema = z.object({
  title: z.string().trim().min(1),
  reason: z.string().trim().min(1),
  feedbackId: z.string().min(1).optional(),
});
const createTaskBodySchema = z.object({
  title: requiredTextSchema,
  description: optionalTextSchema,
  assignee: optionalTextSchema,
  priority: prioritySchema.optional(),
  linkedObjectiveId: requiredTextSchema,
  dueDate: optionalDateOnlySchema,
  feedbackOriginId: optionalTextSchema,
});
const createChecklistItemBodySchema = z.object({
  label: optionalTextSchema,
  afterItemId: optionalTextSchema,
});
const moveResultBodySchema = z.object({
  referenceResultId: requiredTextSchema,
  placement: placementSchema.default("after"),
});
const moveTaskBodySchema = z.object({
  objectiveId: requiredTextSchema,
  referenceTaskId: optionalTextSchema,
  placement: placementSchema.optional(),
});
const moveChecklistBodySchema = z.object({
  toTaskId: requiredTextSchema,
  referenceItemId: optionalTextSchema,
  placement: placementSchema.optional(),
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
function corsOrigin() {
  if (env.CORS_ORIGIN === "*") {
    return true;
  }

  return env.CORS_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean);
}

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

export async function buildServer(options: { logger?: boolean; registerOptionalIntegrations?: boolean } = {}) {
  const app = Fastify({ logger: options.logger ?? true });

  await app.register(cors, {
    origin: corsOrigin(),
    credentials: true,
  });
  await app.register(multipart, {
    limits: {
      fileSize: env.OBJECT_STORAGE_UPLOAD_MAX_BYTES,
      files: 1,
    },
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: "Bad Request", issues: error.issues });
    }

    const statusCode =
      typeof error === "object" && error !== null && "statusCode" in error && typeof error.statusCode === "number"
        ? error.statusCode
        : undefined;
    if (statusCode && statusCode >= 400 && statusCode < 500) {
      return reply.code(statusCode).send({ error: error instanceof Error ? error.message : "Bad Request" });
    }

    if (statusCode === 503) {
      return reply.code(503).send({ error: error instanceof Error ? error.message : "Service Unavailable" });
    }

    if (isDatabaseUnavailableError(error)) {
      app.log.error(error);
      return reply.code(503).send(databaseUnavailablePayload());
    }

    if (isDatabaseSchemaMismatchError(error)) {
      app.log.error(error);
      return reply.code(503).send(databaseSchemaMismatchPayload(error));
    }

    app.log.error(error);
    return reply.code(500).send({ error: "Internal Server Error" });
  });

  await assertRuntimeDatabaseSchema();

  app.addHook("preHandler", requireAuthenticatedApi);

  app.get("/health", async () => ({
    ok: true,
    service: "orf-api",
  }));

  if (options.registerOptionalIntegrations ?? true) {
    registerOptionalIntegrations(app);
  }
  registerAuthRoutes(app);

  registerRealtimeRoutes(app);
  registerNotificationRoutes(app);
  registerOrfReadRoutes(app);
  registerSettingsRoutes(app);
  registerCommentRoutes(app);
  registerUserAvatarRoutes(app);
  registerUserRoutes(app);
  registerPermissionRoutes(app);

  app.post("/api/objectives", async (request, reply) => {
    const context = await requireWriteContext(request, reply, "objective.create");
    if (!context) {
      return reply;
    }

    const body = createObjectiveBodySchema.parse(request.body);
    const objective = await createObjective(body, { scope: context.scope, userId: context.user.id });

    return { objective };
  });

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
    const allowedByReestimate = await canEditObjectiveResultsDuringReestimate(body.objectiveId, user.name, scope);
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
      definer: source === "memberProposed" ? user.name : body.definer ?? user.name,
    });

    if (!result) {
      return reply.code(404).send({ error: "Objective not found" });
    }

    return { result };
  });

  app.post("/api/feedback", async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }
    const { user, scope } = context;

    const body = createFeedbackBodySchema.parse(request.body);
    const feedbackAccess = await canCreateFeedbackForResult(body.linkedResultId, { ...user, scope });
    if (feedbackAccess === "notFound") {
      return reply.code(404).send({ error: "Result not found" });
    }
    if (feedbackAccess === "forbidden") {
      return reply.code(403).send({ error: "Forbidden" });
    }

    const outcome = await createFeedback(body, user.id);

    if (outcome.status === "notFound") {
      return reply.code(404).send({ error: "Result not found" });
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

  app.post("/api/tasks", async (request, reply) => {
    const body = createTaskBodySchema.parse(request.body);
    const user = await requireWorkItemTargetMutation(request, reply, { type: "objective", id: body.linkedObjectiveId });
    if (!user) {
      return reply;
    }

    const scope = await getDefaultRuntimeScopeForUser(user.id);
    if (!scope) {
      return reply.code(404).send({ error: "Runtime scope not found" });
    }

    const assignee = body.assignee?.trim() || user.name;
    const activeUsers = await getScopedUsers(scope);
    if (!activeUsers.some((item) => item.status === "active" && item.name === assignee)) {
      return reply.code(400).send({ error: "Task assignee must be an active member" });
    }

    const task = await createTask({ ...body, assignee, actorId: user.id });

    if (!task) {
      return reply.code(404).send({ error: "Objective, result, or feedback not found" });
    }

    return { task };
  });

  app.post("/api/tasks/:taskId/checklist", async (request, reply) => {
    const params = taskParamsSchema.parse(request.params);
    const body = createChecklistItemBodySchema.parse(request.body);
    const user = await requireWorkItemTargetMutation(request, reply, { type: "task", id: params.taskId });
    if (!user) {
      return reply;
    }

    const created = await createChecklistItem(params.taskId, body, user.id);

    if (!created) {
      return reply.code(404).send({ error: "Task not found" });
    }

    return { item: created };
  });

  app.patch("/api/objectives/:objectiveId", async (request, reply) => {
    const params = objectiveParamsSchema.parse(request.params);
    const body = objectiveDetailsBodySchema.parse(request.body);
    const context = await requireAdminContext(request, reply);
    if (!context) {
      return reply;
    }
    const { user } = context;
    if (!(await requireTargetInScope(reply, { type: "objective", id: params.objectiveId }, context.scope, "Objective not found"))) {
      return reply;
    }

    return sendObjectiveDetailsOutcome(reply, await updateObjectiveDetails(params.objectiveId, body, context.user.id));
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

  app.patch("/api/results/:resultId/confidence", async (request, reply) => {
    const params = resultParamsSchema.parse(request.params);
    const body = updateResultConfidenceBodySchema.parse(request.body);
    const context = await requireWriteContext(request, reply, "result.edit");
    if (!context) {
      return reply;
    }
    if (!(await requireTargetInScope(reply, { type: "result", id: params.resultId }, context.scope, "Result not found"))) {
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
    const context = await requireWriteContext(request, reply, "result.edit");
    if (!context) {
      return reply;
    }
    if (!(await requireTargetInScope(reply, { type: "result", id: params.resultId }, context.scope, "Result not found"))) {
      return reply;
    }
    if (!(await requireResultUnlocked(reply, params.resultId))) {
      return reply;
    }

    const updated = await proposeResultUpdate(
      { resultId: params.resultId, title: body.title, reason: body.reason, feedbackId: body.feedbackId },
      { id: context.user.id, name: context.user.name },
    );

    if (!updated) {
      return reply.code(404).send({ error: "Result or feedback not found" });
    }

    return { ok: true };
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

  app.patch("/api/tasks/:taskId", async (request, reply) => {
    const params = taskParamsSchema.parse(request.params);
    const body = titleBodySchema.parse(request.body);
    const user = await requireWorkItemTargetMutation(request, reply, { type: "task", id: params.taskId });
    if (!user) {
      return reply;
    }

    const updated = await updateTaskTitle(params.taskId, body.title, user.id);

    if (!updated) {
      return reply.code(404).send({ error: "Task not found" });
    }

    return { ok: true };
  });

  app.patch("/api/tasks/:taskId/checklist/:itemId/label", async (request, reply) => {
    const params = checklistParamsSchema.parse(request.params);
    const body = labelBodySchema.parse(request.body);
    const user = await requireWorkItemTargetMutation(request, reply, { type: "subtask", id: params.itemId, taskId: params.taskId });
    if (!user) {
      return reply;
    }

    const updated = await updateChecklistItemLabel(params.taskId, params.itemId, body.label, user.id);

    if (!updated) {
      return reply.code(404).send({ error: "Checklist item not found" });
    }

    return { ok: true };
  });

  app.patch("/api/tasks/:taskId/status", async (request, reply) => {
    const params = taskParamsSchema.parse(request.params);
    const body = updateTaskStatusBodySchema.parse(request.body);
    const user = await requireWorkItemTargetMutation(request, reply, { type: "task", id: params.taskId });
    if (!user) {
      return reply;
    }

    const updated = await updateTaskStatus(params.taskId, body.status, user.id);

    if (!updated) {
      return reply.code(404).send({ error: "Task not found" });
    }

    return { ok: true };
  });

  app.patch("/api/tasks/:taskId/completion", async (request, reply) => {
    const params = taskParamsSchema.parse(request.params);
    const body = completionBodySchema.parse(request.body);
    const user = await requireWorkItemTargetMutation(request, reply, { type: "task", id: params.taskId });
    if (!user) {
      return reply;
    }

    const updated = await setTaskCompletion(params.taskId, body.done, user.id);

    if (!updated) {
      return reply.code(404).send({ error: "Task not found" });
    }

    return { ok: true };
  });

  app.patch("/api/tasks/:taskId/checklist/:itemId", async (request, reply) => {
    const params = checklistParamsSchema.parse(request.params);
    const body = completionBodySchema.parse(request.body);
    const user = await requireWorkItemTargetMutation(request, reply, { type: "subtask", id: params.itemId, taskId: params.taskId });
    if (!user) {
      return reply;
    }

    const updated = await updateChecklistItem(params.taskId, params.itemId, body.done, user.id);

    if (!updated) {
      return reply.code(404).send({ error: "Checklist item not found" });
    }

    return { ok: true };
  });

  app.patch("/api/results/:resultId/order", async (request, reply) => {
    const params = resultParamsSchema.parse(request.params);
    const body = moveResultBodySchema.parse(request.body);
    const context = await requireWriteContext(request, reply, "result.edit");
    if (!context) {
      return reply;
    }
    if (!(await requireTargetInScope(reply, { type: "result", id: params.resultId }, context.scope, "Result not found"))) {
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

  app.patch("/api/tasks/:taskId/move", async (request, reply) => {
    const params = taskParamsSchema.parse(request.params);
    const body = moveTaskBodySchema.parse(request.body);
    const user = await requireWorkItemTargetMutation(request, reply, { type: "task", id: params.taskId });
    if (!user) {
      return reply;
    }
    const targetObjectiveId = await resolveObjectiveIdForWorkItem({ type: "objective", id: body.objectiveId });
    if (!targetObjectiveId) {
      return reply.code(404).send({ error: "Task move target not found" });
    }
    if (!(await authorizeObjectiveWorkItemMutation(user, reply, targetObjectiveId))) {
      return reply;
    }

    const updated = await moveTask(params.taskId, body, user.id);

    if (!updated) {
      return reply.code(404).send({ error: "Task move target not found" });
    }

    return { ok: true };
  });

  app.patch("/api/tasks/:taskId/checklist/:itemId/move", async (request, reply) => {
    const params = checklistParamsSchema.parse(request.params);
    const body = moveChecklistBodySchema.parse(request.body);
    const user = await requireWorkItemTargetMutation(request, reply, { type: "subtask", id: params.itemId, taskId: params.taskId });
    if (!user) {
      return reply;
    }
    const targetObjectiveId = await resolveObjectiveIdForWorkItem({ type: "task", id: body.toTaskId });
    if (!targetObjectiveId) {
      return reply.code(404).send({ error: "Checklist move target not found" });
    }
    if (!(await authorizeObjectiveWorkItemMutation(user, reply, targetObjectiveId))) {
      return reply;
    }

    const updated = await moveChecklistItem(params.taskId, params.itemId, body, user.id);

    if (!updated) {
      return reply.code(404).send({ error: "Checklist move target not found" });
    }

    return { ok: true };
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

  app.delete("/api/results/:resultId", async (request, reply) => {
    const params = resultParamsSchema.parse(request.params);
    const context = await requireWriteContext(request, reply, "result.delete");
    if (!context) {
      return reply;
    }
    if (!(await requireTargetInScope(reply, { type: "result", id: params.resultId }, context.scope, "Result not found"))) {
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

  app.delete("/api/tasks/:taskId", async (request, reply) => {
    const params = taskParamsSchema.parse(request.params);
    if (!(await requireWorkItemTargetMutation(request, reply, { type: "task", id: params.taskId }))) {
      return reply;
    }

    const deleted = await deleteTask(params.taskId);

    if (!deleted) {
      return reply.code(404).send({ error: "Task not found" });
    }

    return { ok: true };
  });

  app.delete("/api/tasks/:taskId/checklist/:itemId", async (request, reply) => {
    const params = checklistParamsSchema.parse(request.params);
    const user = await requireWorkItemTargetMutation(request, reply, { type: "subtask", id: params.itemId, taskId: params.taskId });
    if (!user) {
      return reply;
    }

    const deleted = await deleteChecklistItem(params.taskId, params.itemId, user.id);

    if (!deleted) {
      return reply.code(404).send({ error: "Checklist item not found" });
    }

    return { ok: true };
  });

  return app;
}
