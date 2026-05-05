import cors from "@fastify/cors";
import Fastify from "fastify";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z, ZodError } from "zod";
import { getAuthenticatedOrfUser } from "./auth/ory";
import { registerAuthRoutes, requireAuthenticatedApi } from "./auth/routes";
import { env } from "./env";
import {
  getPermissionRulesForTeam,
  getPrimaryTeamIdForUser,
  permissionActions,
  permissionResources,
  permissionStages,
  replaceRolePermissionRules,
} from "./repositories/permissionRepository";
import {
  createChecklistItem,
  createResult,
  createTask,
  deleteChecklistItem,
  deleteObjective,
  deleteResult,
  deleteTask,
  getOrfStateSnapshot,
  getTaskManagementData,
  moveChecklistItem,
  moveResult,
  moveTask,
  setTaskCompletion,
  updateChecklistItemLabel,
  updateObjectiveTitle,
  updateResultTitle,
  updateChecklistItem,
  updateTaskTitle,
  updateTaskStatus,
} from "./repositories/orfRepository";
import { createTeamUser, deleteTeamUser, getTeamUsers, updateTeamUser } from "./repositories/userRepository";

const taskStatusSchema = z.enum(["Backlog", "Todo", "In Progress", "In Review", "Done"]);
const prioritySchema = z.enum(["Low", "Medium", "High", "Critical"]);
const metricDirectionSchema = z.enum(["increase", "decrease"]);
const uncertaintyLevelSchema = z.enum(["入门", "进阶", "破局", "渡劫", "飞升"]);
const userRoleSchema = z.enum(["admin", "member"]);
const userBodySchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().email().transform((value) => value.toLowerCase()),
  role: userRoleSchema,
});
const editablePermissionRoleSchema = z.enum(["member"]);
const permissionStageSchema = z.enum(permissionStages);
const permissionResourceSchema = z.enum(permissionResources);
const permissionActionSchema = z.enum(permissionActions);
const updateTaskStatusBodySchema = z.object({ status: taskStatusSchema });
const titleBodySchema = z.object({ title: z.string().trim().min(1) });
const labelBodySchema = z.object({ label: z.string().trim().min(1) });
const completionBodySchema = z.object({ done: z.boolean() });
const taskParamsSchema = z.object({ taskId: z.string().min(1) });
const checklistParamsSchema = taskParamsSchema.extend({ itemId: z.string().min(1) });
const resultParamsSchema = z.object({ resultId: z.string().min(1) });
const objectiveParamsSchema = z.object({ objectiveId: z.string().min(1) });
const userParamsSchema = z.object({ userId: z.string().min(1) });
const permissionRoleParamsSchema = z.object({ role: userRoleSchema });
const placementSchema = z.enum(["before", "after"]);
const permissionRuleSchema = z.object({
  role: editablePermissionRoleSchema,
  stage: permissionStageSchema,
  resource: permissionResourceSchema,
  actions: z.array(permissionActionSchema),
});
const updateRolePermissionsBodySchema = z.object({
  permissionRules: z.array(permissionRuleSchema),
});
const defaultPermissionStage = "orfReestimate";
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
  owner: z.string().optional(),
});
const createTaskBodySchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  assignee: z.string().optional(),
  priority: prioritySchema.optional(),
  linkedObjectiveId: z.string().optional(),
  linkedResultId: z.string().min(1),
  dueDate: z.string().optional(),
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

function corsOrigin() {
  if (env.CORS_ORIGIN === "*") {
    return true;
  }

  return env.CORS_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean);
}

async function requireAdminUser(request: FastifyRequest, reply: FastifyReply) {
  const user = await getAuthenticatedOrfUser(request.headers.cookie).catch((error) => {
    request.log.warn(error, "Ory admin session check failed");
    return null;
  });

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

async function requireWritePermission(
  request: FastifyRequest,
  reply: FastifyReply,
  action: (typeof permissionActions)[number],
  resource: (typeof permissionResources)[number],
) {
  const user = await getAuthenticatedOrfUser(request.headers.cookie).catch((error) => {
    request.log.warn(error, "Ory permission session check failed");
    return null;
  });

  if (!user) {
    reply.code(401).send({ error: "Unauthorized" });
    return false;
  }

  if (user.role === "admin") {
    return true;
  }

  const teamId = await getPrimaryTeamIdForUser(user.id);
  if (!teamId) {
    reply.code(404).send({ error: "Team not found" });
    return false;
  }

  const permissionRules = await getPermissionRulesForTeam(teamId);
  const allowed = permissionRules.some(
    (rule) => rule.role === user.role && rule.stage === defaultPermissionStage && rule.resource === resource && rule.actions.includes(action),
  );

  if (!allowed) {
    reply.code(403).send({ error: "Forbidden" });
    return false;
  }

  return true;
}

export async function buildServer() {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: corsOrigin(),
    credentials: true,
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

    app.log.error(error);
    return reply.code(500).send({ error: "Internal Server Error" });
  });

  app.addHook("preHandler", requireAuthenticatedApi);

  app.get("/health", async () => ({
    ok: true,
    service: "orf-api",
  }));

  registerAuthRoutes(app);

  app.get("/api/tasks-page", async () => getTaskManagementData());
  app.get("/api/orf-state", async () => getOrfStateSnapshot());

  app.get("/api/users", async (request, reply) => {
    const teamId = await requireAdminTeamId(request, reply);
    if (!teamId) {
      return reply;
    }

    return { users: await getTeamUsers(teamId) };
  });

  app.post("/api/users", async (request, reply) => {
    const teamId = await requireAdminTeamId(request, reply);
    if (!teamId) {
      return reply;
    }

    const body = userBodySchema.parse(request.body);
    return { users: await createTeamUser(teamId, body) };
  });

  app.patch("/api/users/:userId", async (request, reply) => {
    const teamId = await requireAdminTeamId(request, reply);
    if (!teamId) {
      return reply;
    }

    const params = userParamsSchema.parse(request.params);
    const body = userBodySchema.parse(request.body);
    return { users: await updateTeamUser(teamId, params.userId, body) };
  });

  app.delete("/api/users/:userId", async (request, reply) => {
    const teamId = await requireAdminTeamId(request, reply);
    if (!teamId) {
      return reply;
    }

    const params = userParamsSchema.parse(request.params);
    return { users: await deleteTeamUser(teamId, params.userId) };
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

  app.post("/api/results", async (request, reply) => {
    const body = createResultBodySchema.parse(request.body);
    if (!(await requireWritePermission(request, reply, "create", "result"))) {
      return reply;
    }

    const result = await createResult(body);

    if (!result) {
      return reply.code(404).send({ error: "Objective not found" });
    }

    return { result };
  });

  app.post("/api/tasks", async (request, reply) => {
    const body = createTaskBodySchema.parse(request.body);
    if (!(await requireWritePermission(request, reply, "create", "task"))) {
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
    if (!(await requireWritePermission(request, reply, "create", "subtask"))) {
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
    if (!(await requireWritePermission(request, reply, "edit", "objective"))) {
      return reply;
    }

    const updated = await updateObjectiveTitle(params.objectiveId, body.title);

    if (!updated) {
      return reply.code(404).send({ error: "Objective not found" });
    }

    return { ok: true };
  });

  app.patch("/api/results/:resultId", async (request, reply) => {
    const params = resultParamsSchema.parse(request.params);
    const body = titleBodySchema.parse(request.body);
    if (!(await requireWritePermission(request, reply, "edit", "result"))) {
      return reply;
    }

    const updated = await updateResultTitle(params.resultId, body.title);

    if (!updated) {
      return reply.code(404).send({ error: "Result not found" });
    }

    return { ok: true };
  });

  app.patch("/api/tasks/:taskId", async (request, reply) => {
    const params = taskParamsSchema.parse(request.params);
    const body = titleBodySchema.parse(request.body);
    if (!(await requireWritePermission(request, reply, "edit", "task"))) {
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
    if (!(await requireWritePermission(request, reply, "edit", "subtask"))) {
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
    if (!(await requireWritePermission(request, reply, "edit", "task"))) {
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
    if (!(await requireWritePermission(request, reply, "edit", "task"))) {
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
    if (!(await requireWritePermission(request, reply, "edit", "subtask"))) {
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
    if (!(await requireWritePermission(request, reply, "edit", "result"))) {
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
    if (!(await requireWritePermission(request, reply, "edit", "task"))) {
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
    if (!(await requireWritePermission(request, reply, "edit", "subtask"))) {
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
    if (!(await requireWritePermission(request, reply, "delete", "objective"))) {
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
    if (!(await requireWritePermission(request, reply, "delete", "result"))) {
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
    if (!(await requireWritePermission(request, reply, "delete", "task"))) {
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
    if (!(await requireWritePermission(request, reply, "delete", "subtask"))) {
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
