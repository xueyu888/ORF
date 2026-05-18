import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify from "fastify";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z, ZodError } from "zod";
import { getAuthenticatedOrfUser } from "./auth/ory";
import { authServiceUnavailablePayload, isAuthServiceUnavailableError } from "./auth/errors";
import { registerAuthRoutes, requireAuthenticatedApi } from "./auth/routes";
import { databaseUnavailablePayload, isDatabaseUnavailableError } from "./db/errors";
import { env } from "./env";
import { registerOptionalIntegrations } from "./integrations";
import {
  getRolePermissionKeysForTeam,
  getPermissionRulesForTeam,
  getPrimaryTeamIdForUser,
  hasRolePermission,
  permissionKeys,
  replaceRolePermissionRules,
} from "./repositories/permissionRepository";
import type { PermissionKey } from "../src/config/permissions";
import {
  acceptObjectiveChallenge,
  applyForObjectiveChallenge,
  approveObjectiveChallengeApplication,
  canDeleteObjective,
  canCreateFeedbackForResult,
  canEditObjectiveResultsDuringReestimate,
  canEditResultDuringReestimate,
  canMutateObjectiveResults,
  canMutateResult,
  canMutateObjectiveWorkItem,
  createComment,
  createChecklistItem,
  createFeedback,
  createObjective,
  createResult,
  createTask,
  deleteCommentMessage,
  deleteChecklistItem,
  deleteObjective,
  deleteResult,
  deleteTask,
  declineObjectiveChallenge,
  freezeObjectiveAfterReestimate,
  getBountyHallData,
  getMyChallengesData,
  getOrfStateSnapshot,
  getTaskManagementData,
  moveChecklistItem,
  moveResult,
  moveTask,
  publishObjective,
  proposeResultUpdate,
  recruitObjectiveChallengers,
  rejectObjectiveChallengeApplication,
  reopenObjectiveReestimate,
  reviewObjectiveLoot,
  resolveObjectiveIdForWorkItem,
  resolveTeamIdForFeedback,
  resolveTeamIdForWorkItem,
  setTaskCompletion,
  submitObjectiveContributionReview,
  submitObjectiveLoot,
  updateCommentMessage,
  updateCommentThreadStatus,
  updateChecklistItemLabel,
  updateFeedbackStatus,
  updateObjectiveStage,
  updateObjectiveTitle,
  updateResultConfidence,
  updateResultTitle,
  updateChecklistItem,
  updateTaskTitle,
  updateTaskStatus,
} from "./repositories/orfRepository";
import {
  approveRegistrationRequest,
  createTeamUser,
  deleteTeamUser,
  disableTeamUser,
  getRegistrationRequests,
  getTeamUsers,
  rejectRegistrationRequest,
  updateTeamUser,
} from "./repositories/userRepository";
import {
  backgroundSceneConfigSchema,
  backgroundSceneSchema,
  getVisualBackgroundFile,
  listVisualBackgrounds,
  saveUploadedVisualBackground,
  saveVisualBackgroundConfig,
  setDefaultVisualBackground,
  visualBackgroundError,
} from "./settings/visualBackgrounds";

const taskStatusSchema = z.enum(["Backlog", "Todo", "In Progress", "In Review", "Done"]);
const prioritySchema = z.enum(["Low", "Medium", "High", "Critical"]);
const impactSchema = z.enum(["Low", "Medium", "High", "Critical"]);
const metricDirectionSchema = z.enum(["increase", "decrease"]);
const uncertaintyLevelSchema = z.enum(["入门", "进阶", "破局", "渡劫", "飞升"]);
const bountySourceSchema = z.enum(["managerDefined", "memberProposed"]);
const feedbackSourceSchema = z.enum(["User report", "Eval run", "Log", "Incident", "Team review"]);
const feedbackStatusSchema = z.enum(["New", "Reviewing", "Action Created", "Result Updated", "Closed"]);
const userRoleSchema = z.enum(["admin", "member"]);
const commentTargetTypeSchema = z.enum(["objective", "result", "task", "subtask"]);
const commentStatusSchema = z.enum(["open", "resolved"]);
const lootResultClaimStatusSchema = z.enum(["completed", "falsified", "notClaimed"]);
const objectiveAcceptedResultSchema = z.enum(["completed", "falsified", "overturned", "abandoned", "overdelivered"]);
const resultAcceptedResultSchema = z.enum(["unreviewed", "completed", "falsified", "failed"]);
const userBodySchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().email().transform((value) => value.toLowerCase()),
  role: userRoleSchema,
});
const editablePermissionRoleSchema = z.enum(["member"]);
const objectiveStageSchema = z.enum(["goalSetting", "resultClaiming", "orfReestimate", "goalFrozen"]);
const permissionKeySchema = z.enum(permissionKeys);
const updateTaskStatusBodySchema = z.object({ status: taskStatusSchema });
const titleBodySchema = z.object({ title: z.string().trim().min(1) });
const labelBodySchema = z.object({ label: z.string().trim().min(1) });
const completionBodySchema = z.object({ done: z.boolean() });
const objectiveStageBodySchema = z.object({ stage: objectiveStageSchema });
const taskParamsSchema = z.object({ taskId: z.string().min(1) });
const checklistParamsSchema = taskParamsSchema.extend({ itemId: z.string().min(1) });
const resultParamsSchema = z.object({ resultId: z.string().min(1) });
const objectiveParamsSchema = z.object({ objectiveId: z.string().min(1) });
const applicationParamsSchema = objectiveParamsSchema.extend({ applicationId: z.string().min(1) });
const feedbackParamsSchema = z.object({ feedbackId: z.string().min(1) });
const commentThreadParamsSchema = z.object({ threadId: z.string().min(1) });
const commentMessageParamsSchema = commentThreadParamsSchema.extend({ messageId: z.string().min(1) });
const userParamsSchema = z.object({ userId: z.string().min(1) });
const permissionRoleParamsSchema = z.object({ role: userRoleSchema });
const placementSchema = z.enum(["before", "after"]);
const permissionRuleSchema = z.object({
  role: editablePermissionRoleSchema,
  permissions: z.array(permissionKeySchema),
});
const updateRolePermissionsBodySchema = z.object({
  permissionRules: z.array(permissionRuleSchema),
});
const myChallengesQuerySchema = z.object({
  scope: z.enum(["mine", "all"]).default("mine"),
});
const visualBackgroundQuerySchema = z.object({
  scene: backgroundSceneSchema,
});
const visualBackgroundConfigBodySchema = z.object({
  scene: backgroundSceneSchema,
  config: backgroundSceneConfigSchema,
});
const visualBackgroundParamsSchema = z.object({
  id: z.string().min(1),
});
const visualBackgroundStaticParamsSchema = z.object({
  scene: backgroundSceneSchema,
  scope: z.enum(["default", "user"]),
  fileName: z.string().min(1),
});
const createResultBodySchema = z.object({
  objectiveId: z.string().min(1),
  title: z.string().min(1),
  metricName: z.string().min(1),
  description: z.string().optional(),
  baseline: z.number().optional(),
  current: z.number().optional(),
  target: z.number().optional(),
  unit: z.string().optional(),
  direction: metricDirectionSchema.optional(),
  uncertaintyLevel: uncertaintyLevelSchema.optional(),
  source: bountySourceSchema.optional(),
  definer: z.string().optional(),
});
const createObjectiveBodySchema = z.object({
  title: z.string().trim().min(1),
  whyItMatters: z.string().trim().min(1),
  cycle: z.string().trim().min(1),
  boundary: z.string().trim().min(1),
  finalDueAt: z.string().optional(),
});
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
const resultUpdateProposalBodySchema = z.object({
  title: z.string().trim().min(1),
  reason: z.string().trim().min(1),
  feedbackId: z.string().min(1).optional(),
});
const createTaskBodySchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  assignee: z.string().optional(),
  priority: prioritySchema.optional(),
  linkedObjectiveId: z.string().optional(),
  linkedResultId: z.string().min(1),
  dueDate: z.string().optional(),
  feedbackOriginId: z.string().optional(),
});
const createChecklistItemBodySchema = z.object({
  label: z.string().optional(),
  afterItemId: z.string().optional(),
});
const moveResultBodySchema = z.object({
  referenceResultId: z.string().min(1),
  placement: placementSchema.default("after"),
});
const moveTaskBodySchema = z.object({
  toResultId: z.string().min(1),
  referenceTaskId: z.string().optional(),
  placement: placementSchema.optional(),
});
const moveChecklistBodySchema = z.object({
  toTaskId: z.string().min(1),
  referenceItemId: z.string().optional(),
  placement: placementSchema.optional(),
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
const recruitBodySchema = z.object({
  members: z.array(z.string().trim().min(1)).min(1),
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
const reviewLootBodySchema = z.object({
  lootId: z.string().min(1).optional(),
  acceptedResult: objectiveAcceptedResultSchema.optional(),
  resultReviews: z.array(z.object({
    resultId: z.string().min(1),
    acceptedResult: resultAcceptedResultSchema,
  })).optional(),
  contributionResolution: z.object({
    ratios: z.array(z.object({
      member: z.string().trim().min(1),
      ratio: z.number().min(0),
    })).min(1),
    reason: z.string().trim().min(1),
  }).optional(),
  reason: z.string().trim().optional(),
});
const contributionReviewBodySchema = z.object({
  allocations: z.array(z.object({
    member: z.string().trim().min(1),
    ratio: z.number().min(0),
  })).min(1),
});

type AuthenticatedOrfUser = NonNullable<Awaited<ReturnType<typeof getAuthenticatedOrfUser>>>;
type RequestWithOrfUser = FastifyRequest & { orfUser?: AuthenticatedOrfUser | null };

function corsOrigin() {
  if (env.CORS_ORIGIN === "*") {
    return true;
  }

  return env.CORS_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean);
}

async function getRequestOrfUser(request: FastifyRequest, reply: FastifyReply, logMessage: string) {
  const requestWithUser = request as RequestWithOrfUser;
  if (requestWithUser.orfUser !== undefined) {
    return requestWithUser.orfUser;
  }

  const user = await getAuthenticatedOrfUser(request.headers.cookie).catch((error) => {
    request.log.warn(error, logMessage);
    if (isDatabaseUnavailableError(error) || isAuthServiceUnavailableError(error)) {
      reply.code(503).send(isDatabaseUnavailableError(error) ? databaseUnavailablePayload() : authServiceUnavailablePayload());
      return undefined;
    }
    return null;
  });

  if (user !== undefined) {
    requestWithUser.orfUser = user;
  }

  return user;
}

async function requireAdminUser(request: FastifyRequest, reply: FastifyReply) {
  const user = await getRequestOrfUser(request, reply, "Ory admin session check failed");

  if (user === undefined) {
    return null;
  }

  if (!user) {
    reply.code(401).send({ error: "Unauthorized" });
    return null;
  }

  if (user.role !== "admin") {
    reply.code(403).send({ error: "Forbidden" });
    return null;
  }

  return user;
}

async function requireApiUser(request: FastifyRequest, reply: FastifyReply) {
  const user = await getRequestOrfUser(request, reply, "Ory API session check failed");

  if (user === undefined) {
    return null;
  }

  if (!user) {
    reply.code(401).send({ error: "Unauthorized" });
    return null;
  }

  return user;
}

async function requireUserTeamContext(request: FastifyRequest, reply: FastifyReply) {
  const user = await requireApiUser(request, reply);
  if (!user) {
    return null;
  }

  const teamId = await getPrimaryTeamIdForUser(user.id);
  if (!teamId) {
    reply.code(404).send({ error: "Team not found" });
    return null;
  }

  return { user, teamId };
}

async function requireAdminTeamId(request: FastifyRequest, reply: FastifyReply) {
  const user = await requireAdminUser(request, reply);
  if (!user) {
    return null;
  }

  const teamId = await getPrimaryTeamIdForUser(user.id);
  if (!teamId) {
    reply.code(404).send({ error: "Team not found" });
    return null;
  }

  return teamId;
}

async function requireAdminContext(request: FastifyRequest, reply: FastifyReply) {
  const user = await requireAdminUser(request, reply);
  if (!user) {
    return null;
  }

  const teamId = await getPrimaryTeamIdForUser(user.id);
  if (!teamId) {
    reply.code(404).send({ error: "Team not found" });
    return null;
  }

  return { user, teamId };
}

async function requireTargetInTeam(
  reply: FastifyReply,
  target: Parameters<typeof resolveTeamIdForWorkItem>[0],
  teamId: string,
  message = "Work item not found",
) {
  const targetTeamId = await resolveTeamIdForWorkItem(target);
  if (!targetTeamId || targetTeamId !== teamId) {
    reply.code(404).send({ error: message });
    return false;
  }

  return true;
}

async function requireFeedbackInTeam(reply: FastifyReply, feedbackId: string, teamId: string) {
  const targetTeamId = await resolveTeamIdForFeedback(feedbackId);
  if (!targetTeamId || targetTeamId !== teamId) {
    reply.code(404).send({ error: "Feedback not found" });
    return false;
  }

  return true;
}

async function requireWriteContext(
  request: FastifyRequest,
  reply: FastifyReply,
  permission: PermissionKey,
) {
  const user = await getRequestOrfUser(request, reply, "Ory permission session check failed");

  if (user === undefined) {
    return null;
  }

  if (!user) {
    reply.code(401).send({ error: "Unauthorized" });
    return null;
  }

  const teamId = await getPrimaryTeamIdForUser(user.id);
  if (!teamId) {
    reply.code(404).send({ error: "Team not found" });
    return null;
  }

  if (user.role === "admin") {
    return { user, teamId };
  }

  const permissionRules = await getPermissionRulesForTeam(teamId);
  const allowed = hasRolePermission(user.role, permissionRules, permission);

  if (!allowed) {
    reply.code(403).send({ error: "Forbidden" });
    return null;
  }

  return { user, teamId };
}

async function requireResultEditContext(request: FastifyRequest, reply: FastifyReply, resultId: string) {
  const context = await requireUserTeamContext(request, reply);
  if (!context) {
    return null;
  }
  const { user, teamId } = context;

  if (!(await requireTargetInTeam(reply, { type: "result", id: resultId }, teamId, "Result not found"))) {
    return null;
  }

  if (user.role === "admin") {
    return { user, teamId };
  }

  const permissionRules = await getPermissionRulesForTeam(teamId);
  const allowedByRole = hasRolePermission(user.role, permissionRules, "result.edit");
  const allowedByReestimate = await canEditResultDuringReestimate(resultId, user.name);
  if (!allowedByRole && !allowedByReestimate) {
    reply.code(403).send({ error: "Forbidden" });
    return null;
  }

  return { user, teamId };
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

async function authorizeObjectiveWorkItemMutation(
  user: Awaited<ReturnType<typeof requireApiUser>>,
  reply: FastifyReply,
  objectiveId: string,
) {
  if (!user) {
    return false;
  }

  const teamId = await getPrimaryTeamIdForUser(user.id);
  if (!teamId) {
    reply.code(404).send({ error: "Team not found" });
    return false;
  }

  const targetTeamId = await resolveTeamIdForWorkItem({ type: "objective", id: objectiveId });
  if (!targetTeamId || targetTeamId !== teamId) {
    reply.code(404).send({ error: "Objective not found" });
    return false;
  }

  const access = await canMutateObjectiveWorkItem({ ...user, teamId }, objectiveId);
  if (access === "notFound") {
    reply.code(404).send({ error: "Objective not found" });
    return false;
  }
  if (access === "forbidden") {
    reply.code(403).send({ error: "Forbidden" });
    return false;
  }

  return true;
}

async function requireObjectiveWorkItemMutation(request: FastifyRequest, reply: FastifyReply, objectiveId: string) {
  const user = await requireApiUser(request, reply);
  if (!user) {
    return null;
  }

  return (await authorizeObjectiveWorkItemMutation(user, reply, objectiveId)) ? user : null;
}

async function requireWorkItemTargetMutation(
  request: FastifyRequest,
  reply: FastifyReply,
  target: Parameters<typeof resolveObjectiveIdForWorkItem>[0],
) {
  const objectiveId = await resolveObjectiveIdForWorkItem(target);
  if (!objectiveId) {
    reply.code(404).send({ error: "Work item not found" });
    return null;
  }

  return requireObjectiveWorkItemMutation(request, reply, objectiveId);
}

async function commentActorWithPermissions(request: FastifyRequest, reply: FastifyReply) {
  const context = await requireUserTeamContext(request, reply);
  if (!context) {
    return null;
  }
  const { user, teamId } = context;

  if (user.role === "admin") {
    return { ...user, teamId, canManageAllComments: true };
  }

  const permissions = await getRolePermissionKeysForTeam(teamId, user.role);
  return { ...user, teamId, canManageAllComments: permissions.includes("comment.manage") };
}

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

function sendContributionReviewOutcome(reply: FastifyReply, outcome: Awaited<ReturnType<typeof submitObjectiveContributionReview>>) {
  if (outcome.status === "notFound") {
    return reply.code(404).send({ error: "Objective not found" });
  }

  if (outcome.status === "forbidden") {
    return reply.code(403).send({ error: "Only challengers can submit contribution reviews" });
  }

  if (outcome.status === "invalid") {
    return reply.code(400).send({ error: "Contribution review is incomplete" });
  }

  if (outcome.status === "closed") {
    return reply.code(409).send({ error: "Objective must be submitted before contribution review" });
  }

  return { review: outcome.review };
}

export async function buildServer(options: { logger?: boolean; registerOptionalIntegrations?: boolean } = {}) {
  const app = Fastify({ logger: options.logger ?? true });

  await app.register(cors, {
    origin: corsOrigin(),
    credentials: true,
  });
  await app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024,
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

    if (isDatabaseUnavailableError(error)) {
      app.log.error(error);
      return reply.code(503).send(databaseUnavailablePayload());
    }

    app.log.error(error);
    return reply.code(500).send({ error: "Internal Server Error" });
  });

  app.addHook("preHandler", requireAuthenticatedApi);

  app.get("/health", async () => ({
    ok: true,
    service: "orf-api",
  }));

  if (options.registerOptionalIntegrations ?? true) {
    registerOptionalIntegrations(app);
  }
  registerAuthRoutes(app);

  app.get("/settings/backgrounds/:scene/:scope/:fileName", async (request, reply) => {
    try {
      const params = visualBackgroundStaticParamsSchema.parse(request.params);
      const file = await getVisualBackgroundFile(params.scene, params.scope, params.fileName);
      reply.header("Content-Type", file.mimeType);
      return reply.send(file.stream);
    } catch (error) {
      const mapped = visualBackgroundError(error);
      return reply.code(mapped.status).send({ error: mapped.message });
    }
  });

  app.get("/api/settings/visual/backgrounds", async (request, reply) => {
    try {
      const query = visualBackgroundQuerySchema.parse(request.query);
      return {
        code: 0,
        message: "ok",
        data: await listVisualBackgrounds(query.scene),
      };
    } catch (error) {
      const mapped = visualBackgroundError(error);
      return reply.code(mapped.status).send({ code: mapped.code, message: mapped.message, data: null });
    }
  });

  app.post("/api/settings/visual/backgrounds", async (request, reply) => {
    if (!(await requireAdminContext(request, reply))) {
      return reply;
    }

    try {
      let scene: z.infer<typeof backgroundSceneSchema> | null = null;
      let file: { fileName: string; mimeType: string; buffer: Buffer } | null = null;

      for await (const part of request.parts()) {
        if (part.type === "field" && part.fieldname === "scene") {
          scene = backgroundSceneSchema.parse(part.value);
        }
        if (part.type === "file" && part.fieldname === "file") {
          file = {
            fileName: part.filename,
            mimeType: part.mimetype,
            buffer: await part.toBuffer(),
          };
        }
      }

      if (!scene) {
        return reply.code(400).send({ code: 40001, message: "invalid scene", data: null });
      }
      if (!file) {
        return reply.code(400).send({ code: 40002, message: "file is required", data: null });
      }

      return {
        code: 0,
        message: "ok",
        data: await saveUploadedVisualBackground({ scene, ...file }),
      };
    } catch (error) {
      const mapped = visualBackgroundError(error);
      return reply.code(mapped.status).send({ code: mapped.code, message: mapped.message, data: null });
    }
  });

  app.put("/api/settings/visual/backgrounds/:id/default", async (request, reply) => {
    if (!(await requireAdminContext(request, reply))) {
      return reply;
    }

    try {
      const params = visualBackgroundParamsSchema.parse(request.params);
      return {
        code: 0,
        message: "ok",
        data: await setDefaultVisualBackground(params.id),
      };
    } catch (error) {
      const mapped = visualBackgroundError(error);
      return reply.code(mapped.status).send({ code: mapped.code, message: mapped.message, data: null });
    }
  });

  app.put("/api/settings/visual/background-config", async (request, reply) => {
    if (!(await requireAdminContext(request, reply))) {
      return reply;
    }

    try {
      const body = visualBackgroundConfigBodySchema.parse(request.body);
      return {
        code: 0,
        message: "ok",
        data: await saveVisualBackgroundConfig(body.scene, body.config),
      };
    } catch (error) {
      const mapped = visualBackgroundError(error);
      return reply.code(mapped.status).send({ code: mapped.code, message: mapped.message, data: null });
    }
  });

  app.get("/api/tasks-page", async (request, reply) => {
    const user = await requireApiUser(request, reply);
    if (!user) {
      return reply;
    }

    const teamId = await getPrimaryTeamIdForUser(user.id);
    if (!teamId) {
      return reply.code(404).send({ error: "Team not found" });
    }

    return user.role === "admin"
      ? getTaskManagementData({ teamId })
      : getMyChallengesData(user.name, false, { teamId });
  });
  app.get("/api/bounties", async (request, reply) => {
    const user = await requireApiUser(request, reply);
    if (!user) {
      return reply;
    }
    const teamId = await getPrimaryTeamIdForUser(user.id);
    if (!teamId) {
      return reply.code(404).send({ error: "Team not found" });
    }

    return getBountyHallData(user.name, { teamId });
  });
  app.get("/api/my-challenges", async (request, reply) => {
    const user = await requireApiUser(request, reply);
    if (!user) {
      return reply;
    }
    const teamId = await getPrimaryTeamIdForUser(user.id);
    if (!teamId) {
      return reply.code(404).send({ error: "Team not found" });
    }

    const query = myChallengesQuerySchema.parse(request.query);
    if (query.scope === "all" && user.role !== "admin") {
      return reply.code(403).send({ error: "Forbidden" });
    }

    return getMyChallengesData(user.name, query.scope === "all", { teamId });
  });
  app.get("/api/orf-state", async (request, reply) => {
    const context = await requireAdminContext(request, reply);
    if (!context) {
      return reply;
    }

    return getOrfStateSnapshot({ teamId: context.teamId });
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

  app.get("/api/users", async (request, reply) => {
    const teamId = await requireAdminTeamId(request, reply);
    if (!teamId) {
      return reply;
    }

    return { users: await getTeamUsers(teamId) };
  });

  app.get("/api/registration-requests", async (request, reply) => {
    const teamId = await requireAdminTeamId(request, reply);
    if (!teamId) {
      return reply;
    }

    return { users: await getRegistrationRequests(teamId) };
  });

  app.post("/api/users", async (request, reply) => {
    const context = await requireAdminContext(request, reply);
    if (!context) {
      return reply;
    }

    const body = userBodySchema.parse(request.body);
    return { users: await createTeamUser(context.teamId, context.user.id, body) };
  });

  app.patch("/api/users/:userId", async (request, reply) => {
    const context = await requireAdminContext(request, reply);
    if (!context) {
      return reply;
    }

    const params = userParamsSchema.parse(request.params);
    const body = userBodySchema.parse(request.body);
    return { users: await updateTeamUser(context.teamId, context.user.id, params.userId, body) };
  });

  app.patch("/api/users/:userId/disable", async (request, reply) => {
    const context = await requireAdminContext(request, reply);
    if (!context) {
      return reply;
    }

    const params = userParamsSchema.parse(request.params);
    return { users: await disableTeamUser(context.teamId, context.user.id, params.userId) };
  });

  app.patch("/api/registration-requests/:userId/approve", async (request, reply) => {
    const context = await requireAdminContext(request, reply);
    if (!context) {
      return reply;
    }

    const params = userParamsSchema.parse(request.params);
    return { users: await approveRegistrationRequest(context.teamId, params.userId) };
  });

  app.patch("/api/registration-requests/:userId/reject", async (request, reply) => {
    const context = await requireAdminContext(request, reply);
    if (!context) {
      return reply;
    }

    const params = userParamsSchema.parse(request.params);
    return { users: await rejectRegistrationRequest(context.teamId, params.userId) };
  });

  app.delete("/api/users/:userId", async (request, reply) => {
    const context = await requireAdminContext(request, reply);
    if (!context) {
      return reply;
    }

    const params = userParamsSchema.parse(request.params);
    return { users: await deleteTeamUser(context.teamId, context.user.id, params.userId) };
  });

  app.get("/api/permissions", async (request, reply) => {
    const teamId = await requireAdminTeamId(request, reply);
    if (!teamId) {
      return reply;
    }

    return { permissionRules: await getPermissionRulesForTeam(teamId) };
  });

  app.put("/api/permissions/:role", async (request, reply) => {
    const teamId = await requireAdminTeamId(request, reply);
    if (!teamId) {
      return reply;
    }

    const params = permissionRoleParamsSchema.parse(request.params);
    if (params.role === "admin") {
      return reply.code(400).send({ error: "Admin permissions are fixed and cannot be changed" });
    }

    const body = updateRolePermissionsBodySchema.parse(request.body);
    return {
      permissionRules: await replaceRolePermissionRules(teamId, params.role, body.permissionRules),
    };
  });

  app.post("/api/objectives", async (request, reply) => {
    const context = await requireWriteContext(request, reply, "objective.create");
    if (!context) {
      return reply;
    }

    const body = createObjectiveBodySchema.parse(request.body);
    const objective = await createObjective(body, { teamId: context.teamId, userId: context.user.id });

    return { objective };
  });

  app.post("/api/results", async (request, reply) => {
    const body = createResultBodySchema.parse(request.body);
    const context = await requireUserTeamContext(request, reply);
    if (!context) {
      return reply;
    }
    const { user, teamId } = context;
    if (!(await requireTargetInTeam(reply, { type: "objective", id: body.objectiveId }, teamId, "Objective not found"))) {
      return reply;
    }
    const permissionRules = await getPermissionRulesForTeam(teamId);
    const source = body.source ?? "managerDefined";
    const allowedByRole = user.role === "admin" || hasRolePermission(user.role, permissionRules, "result.create");
    const allowedByReestimate = await canEditObjectiveResultsDuringReestimate(body.objectiveId, user.name, teamId);
    const allowed = source === "memberProposed" ? allowedByReestimate : allowedByRole;
    if (!allowed) {
      return reply.code(403).send({ error: "Forbidden" });
    }
    if (!(await requireObjectiveResultsUnlocked(reply, body.objectiveId))) {
      return reply;
    }

    const result = await createResult({
      ...body,
      source,
      definer: source === "memberProposed" ? user.name : body.definer ?? user.name,
    });

    if (!result) {
      return reply.code(404).send({ error: "Objective not found" });
    }

    return { result };
  });

  app.post("/api/feedback", async (request, reply) => {
    const context = await requireUserTeamContext(request, reply);
    if (!context) {
      return reply;
    }
    const { user, teamId } = context;

    const body = createFeedbackBodySchema.parse(request.body);
    const feedbackAccess = await canCreateFeedbackForResult(body.linkedResultId, { ...user, teamId });
    if (feedbackAccess === "notFound") {
      return reply.code(404).send({ error: "Result not found" });
    }
    if (feedbackAccess === "forbidden") {
      return reply.code(403).send({ error: "Forbidden" });
    }

    const item = await createFeedback(body, user.id);

    if (!item) {
      return reply.code(404).send({ error: "Result not found" });
    }

    return { feedback: item };
  });

  app.patch("/api/feedback/:feedbackId/status", async (request, reply) => {
    const params = feedbackParamsSchema.parse(request.params);
    const body = updateFeedbackStatusBodySchema.parse(request.body);
    const context = await requireUserTeamContext(request, reply);
    if (!context) {
      return reply;
    }
    const { user, teamId } = context;
    if (!(await requireFeedbackInTeam(reply, params.feedbackId, teamId))) {
      return reply;
    }

    const updated = await updateFeedbackStatus(params.feedbackId, body.status, {
      id: user.id,
      name: user.name,
      role: user.role,
      teamId,
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
    if (!(await requireWorkItemTargetMutation(request, reply, { type: "result", id: body.linkedResultId }))) {
      return reply;
    }

    const task = await createTask(body);

    if (!task) {
      return reply.code(404).send({ error: "Result not found" });
    }

    return { task };
  });

  app.post("/api/tasks/:taskId/checklist", async (request, reply) => {
    const params = taskParamsSchema.parse(request.params);
    const body = createChecklistItemBodySchema.parse(request.body);
    if (!(await requireWorkItemTargetMutation(request, reply, { type: "task", id: params.taskId }))) {
      return reply;
    }

    const created = await createChecklistItem(params.taskId, body);

    if (!created) {
      return reply.code(404).send({ error: "Task not found" });
    }

    return { ok: true };
  });

  app.patch("/api/objectives/:objectiveId", async (request, reply) => {
    const params = objectiveParamsSchema.parse(request.params);
    const body = titleBodySchema.parse(request.body);
    const context = await requireAdminContext(request, reply);
    if (!context) {
      return reply;
    }
    if (!(await requireTargetInTeam(reply, { type: "objective", id: params.objectiveId }, context.teamId, "Objective not found"))) {
      return reply;
    }

    const updated = await updateObjectiveTitle(params.objectiveId, body.title);

    if (!updated) {
      return reply.code(404).send({ error: "Objective not found" });
    }

    return { ok: true };
  });

  app.patch("/api/objectives/:objectiveId/stage", async (request, reply) => {
    const params = objectiveParamsSchema.parse(request.params);
    const body = objectiveStageBodySchema.parse(request.body);
    const context = await requireAdminContext(request, reply);
    if (!context) {
      return reply;
    }
    if (!(await requireTargetInTeam(reply, { type: "objective", id: params.objectiveId }, context.teamId, "Objective not found"))) {
      return reply;
    }

    const updated = await updateObjectiveStage(params.objectiveId, body.stage);

    if (!updated) {
      return reply.code(404).send({ error: "Objective not found" });
    }

    return { ok: true };
  });

  app.patch("/api/objectives/:objectiveId/publish", async (request, reply) => {
    const context = await requireAdminContext(request, reply);
    if (!context) {
      return reply;
    }

    const params = objectiveParamsSchema.parse(request.params);
    if (!(await requireTargetInTeam(reply, { type: "objective", id: params.objectiveId }, context.teamId, "Objective not found"))) {
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
    if (!(await requireTargetInTeam(reply, { type: "objective", id: params.objectiveId }, context.teamId, "Objective not found"))) {
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
    if (!(await requireTargetInTeam(reply, { type: "objective", id: params.objectiveId }, context.teamId, "Objective not found"))) {
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
    if (!(await requireTargetInTeam(reply, { type: "objective", id: params.objectiveId }, context.teamId, "Objective not found"))) {
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
    if (!(await requireTargetInTeam(reply, { type: "objective", id: params.objectiveId }, context.teamId, "Objective not found"))) {
      return reply;
    }
    return sendObjectiveFlowOutcome(reply, await freezeObjectiveAfterReestimate(params.objectiveId, context.user.id));
  });

  app.patch("/api/objectives/:objectiveId/reopen-reestimate", async (request, reply) => {
    const context = await requireAdminContext(request, reply);
    if (!context) {
      return reply;
    }

    const params = objectiveParamsSchema.parse(request.params);
    if (!(await requireTargetInTeam(reply, { type: "objective", id: params.objectiveId }, context.teamId, "Objective not found"))) {
      return reply;
    }
    return sendObjectiveFlowOutcome(reply, await reopenObjectiveReestimate(params.objectiveId, context.user.id));
  });

  app.post("/api/objectives/:objectiveId/review", async (request, reply) => {
    const context = await requireAdminContext(request, reply);
    if (!context) {
      return reply;
    }

    const params = objectiveParamsSchema.parse(request.params);
    const body = reviewLootBodySchema.parse(request.body);
    if (!(await requireTargetInTeam(reply, { type: "objective", id: params.objectiveId }, context.teamId, "Objective not found"))) {
      return reply;
    }
    return sendObjectiveFlowOutcome(reply, await reviewObjectiveLoot(params.objectiveId, body, context.user.id));
  });

  app.patch("/api/results/:resultId", async (request, reply) => {
    const params = resultParamsSchema.parse(request.params);
    const body = titleBodySchema.parse(request.body);
    if (!(await requireResultEditContext(request, reply, params.resultId))) {
      return reply;
    }
    if (!(await requireResultUnlocked(reply, params.resultId))) {
      return reply;
    }

    const updated = await updateResultTitle(params.resultId, body.title);

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
    if (!(await requireTargetInTeam(reply, { type: "result", id: params.resultId }, context.teamId, "Result not found"))) {
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

  app.post("/api/results/:resultId/update-proposal", async (request, reply) => {
    const params = resultParamsSchema.parse(request.params);
    const body = resultUpdateProposalBodySchema.parse(request.body);
    const context = await requireWriteContext(request, reply, "result.edit");
    if (!context) {
      return reply;
    }
    if (!(await requireTargetInTeam(reply, { type: "result", id: params.resultId }, context.teamId, "Result not found"))) {
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
      return reply.code(404).send({ error: "Result not found" });
    }

    return { ok: true };
  });

  app.patch("/api/objectives/:objectiveId/challenge", async (request, reply) => {
    const params = objectiveParamsSchema.parse(request.params);
    const context = await requireUserTeamContext(request, reply);
    if (!context) {
      return reply;
    }
    const { user, teamId } = context;
    if (!(await requireTargetInTeam(reply, { type: "objective", id: params.objectiveId }, teamId, "Objective not found"))) {
      return reply;
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

  app.patch("/api/objectives/:objectiveId/challenge/decline", async (request, reply) => {
    const params = objectiveParamsSchema.parse(request.params);
    const context = await requireUserTeamContext(request, reply);
    if (!context) {
      return reply;
    }
    const { user, teamId } = context;
    if (!(await requireTargetInTeam(reply, { type: "objective", id: params.objectiveId }, teamId, "Objective not found"))) {
      return reply;
    }

    return sendObjectiveFlowOutcome(reply, await declineObjectiveChallenge(params.objectiveId, user.name, user.id));
  });

  app.post("/api/objectives/:objectiveId/challenge-applications", async (request, reply) => {
    const params = objectiveParamsSchema.parse(request.params);
    const context = await requireUserTeamContext(request, reply);
    if (!context) {
      return reply;
    }
    const { user, teamId } = context;
    if (!(await requireTargetInTeam(reply, { type: "objective", id: params.objectiveId }, teamId, "Objective not found"))) {
      return reply;
    }

    const outcome = await applyForObjectiveChallenge(params.objectiveId, user.name);

    if (outcome.status === "notFound") {
      return reply.code(404).send({ error: "Objective not found" });
    }
    if (outcome.status === "alreadyAccepted") {
      return reply.code(409).send({ error: "Objective already includes this challenger", challengers: outcome.challengers });
    }
    if (outcome.status === "alreadyApplied") {
      return reply.code(409).send({ error: "Challenge application already exists" });
    }
    if (outcome.status === "closed") {
      return reply.code(409).send({ error: "Objective is not open for challenge applications" });
    }

    return { objective: outcome.objective };
  });

  app.post("/api/objectives/:objectiveId/loot", async (request, reply) => {
    const params = objectiveParamsSchema.parse(request.params);
    const context = await requireUserTeamContext(request, reply);
    if (!context) {
      return reply;
    }
    const { user, teamId } = context;
    if (!(await requireTargetInTeam(reply, { type: "objective", id: params.objectiveId }, teamId, "Objective not found"))) {
      return reply;
    }

    const body = submitLootBodySchema.parse(request.body);
    return sendLootOutcome(reply, await submitObjectiveLoot(params.objectiveId, body, user));
  });

  app.post("/api/objectives/:objectiveId/contribution-reviews", async (request, reply) => {
    const params = objectiveParamsSchema.parse(request.params);
    const context = await requireUserTeamContext(request, reply);
    if (!context) {
      return reply;
    }
    const { user, teamId } = context;
    if (!(await requireTargetInTeam(reply, { type: "objective", id: params.objectiveId }, teamId, "Objective not found"))) {
      return reply;
    }

    const body = contributionReviewBodySchema.parse(request.body);
    return sendContributionReviewOutcome(reply, await submitObjectiveContributionReview(params.objectiveId, body, user));
  });

  app.patch("/api/tasks/:taskId", async (request, reply) => {
    const params = taskParamsSchema.parse(request.params);
    const body = titleBodySchema.parse(request.body);
    if (!(await requireWorkItemTargetMutation(request, reply, { type: "task", id: params.taskId }))) {
      return reply;
    }

    const updated = await updateTaskTitle(params.taskId, body.title);

    if (!updated) {
      return reply.code(404).send({ error: "Task not found" });
    }

    return { ok: true };
  });

  app.patch("/api/tasks/:taskId/checklist/:itemId/label", async (request, reply) => {
    const params = checklistParamsSchema.parse(request.params);
    const body = labelBodySchema.parse(request.body);
    if (!(await requireWorkItemTargetMutation(request, reply, { type: "subtask", id: params.itemId, taskId: params.taskId }))) {
      return reply;
    }

    const updated = await updateChecklistItemLabel(params.taskId, params.itemId, body.label);

    if (!updated) {
      return reply.code(404).send({ error: "Checklist item not found" });
    }

    return { ok: true };
  });

  app.patch("/api/tasks/:taskId/status", async (request, reply) => {
    const params = taskParamsSchema.parse(request.params);
    const body = updateTaskStatusBodySchema.parse(request.body);
    if (!(await requireWorkItemTargetMutation(request, reply, { type: "task", id: params.taskId }))) {
      return reply;
    }

    const updated = await updateTaskStatus(params.taskId, body.status);

    if (!updated) {
      return reply.code(404).send({ error: "Task not found" });
    }

    return { ok: true };
  });

  app.patch("/api/tasks/:taskId/completion", async (request, reply) => {
    const params = taskParamsSchema.parse(request.params);
    const body = completionBodySchema.parse(request.body);
    if (!(await requireWorkItemTargetMutation(request, reply, { type: "task", id: params.taskId }))) {
      return reply;
    }

    const updated = await setTaskCompletion(params.taskId, body.done);

    if (!updated) {
      return reply.code(404).send({ error: "Task not found" });
    }

    return { ok: true };
  });

  app.patch("/api/tasks/:taskId/checklist/:itemId", async (request, reply) => {
    const params = checklistParamsSchema.parse(request.params);
    const body = completionBodySchema.parse(request.body);
    if (!(await requireWorkItemTargetMutation(request, reply, { type: "subtask", id: params.itemId, taskId: params.taskId }))) {
      return reply;
    }

    const updated = await updateChecklistItem(params.taskId, params.itemId, body.done);

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
    if (!(await requireTargetInTeam(reply, { type: "result", id: params.resultId }, context.teamId, "Result not found"))) {
      return reply;
    }
    if (!(await requireTargetInTeam(reply, { type: "result", id: body.referenceResultId }, context.teamId, "Result move target not found"))) {
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
    const targetObjectiveId = await resolveObjectiveIdForWorkItem({ type: "result", id: body.toResultId });
    if (!targetObjectiveId) {
      return reply.code(404).send({ error: "Task move target not found" });
    }
    if (!(await authorizeObjectiveWorkItemMutation(user, reply, targetObjectiveId))) {
      return reply;
    }

    const updated = await moveTask(params.taskId, body);

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

    const updated = await moveChecklistItem(params.taskId, params.itemId, body);

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
    if (!(await requireTargetInTeam(reply, { type: "objective", id: params.objectiveId }, context.teamId, "Objective not found"))) {
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
    if (!(await requireTargetInTeam(reply, { type: "result", id: params.resultId }, context.teamId, "Result not found"))) {
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
    if (!(await requireWorkItemTargetMutation(request, reply, { type: "subtask", id: params.itemId, taskId: params.taskId }))) {
      return reply;
    }

    const deleted = await deleteChecklistItem(params.taskId, params.itemId);

    if (!deleted) {
      return reply.code(404).send({ error: "Checklist item not found" });
    }

    return { ok: true };
  });

  return app;
}
