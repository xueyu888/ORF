import cors from "@fastify/cors";
import Fastify from "fastify";
import { z, ZodError } from "zod";
import { ORF_SESSION_COOKIE, getAuthenticatedOrfUser, loginWithPassword, registerWithPassword, revokeApiSession } from "./auth/ory";
import { env } from "./env";
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
  updateChecklistItem,
  updateTaskStatus,
} from "./repositories/orfRepository";

const taskStatusSchema = z.enum(["Backlog", "Todo", "In Progress", "In Review", "Done"]);
const prioritySchema = z.enum(["Low", "Medium", "High", "Critical"]);
const metricDirectionSchema = z.enum(["increase", "decrease"]);
const updateTaskStatusBodySchema = z.object({ status: taskStatusSchema });
const completionBodySchema = z.object({ done: z.boolean() });
const loginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
const registrationBodySchema = loginBodySchema.extend({
  name: z.string().min(1),
});
const taskParamsSchema = z.object({ taskId: z.string().min(1) });
const checklistParamsSchema = taskParamsSchema.extend({ itemId: z.string().min(1) });
const resultParamsSchema = z.object({ resultId: z.string().min(1) });
const objectiveParamsSchema = z.object({ objectiveId: z.string().min(1) });
const placementSchema = z.enum(["before", "after"]);
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

function sessionCookie(sessionToken: string) {
  const secure = env.ORF_APP_URL.startsWith("https://") ? "; Secure" : "";
  return `${ORF_SESSION_COOKIE}=${encodeURIComponent(sessionToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${secure}`;
}

function clearSessionCookie() {
  const secure = env.ORF_APP_URL.startsWith("https://") ? "; Secure" : "";
  return `${ORF_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
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

  app.addHook("preHandler", async (request, reply) => {
    const pathname = new URL(request.url, "http://orf.local").pathname;
    if (!pathname.startsWith("/api/") || pathname.startsWith("/api/auth/")) {
      return;
    }

    const user = await getAuthenticatedOrfUser(request.headers.cookie).catch((error) => {
      request.log.warn(error, "Ory session check failed");
      return null;
    });
    if (!user) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
  });

  app.get("/health", async () => ({
    ok: true,
    service: "orf-api",
  }));

  app.get("/api/auth/session", async (request) => {
    const user = await getAuthenticatedOrfUser(request.headers.cookie).catch((error) => {
      request.log.warn(error, "Ory session check failed");
      return null;
    });
    return user ? { authenticated: true, user } : { authenticated: false, user: null };
  });

  app.post("/api/auth/login", async (request, reply) => {
    const body = loginBodySchema.parse(request.body);

    const auth = await loginWithPassword(body.email, body.password).catch((error) => {
      request.log.warn(error, "Ory password login failed");
      return null;
    });

    if (!auth) {
      return reply.code(401).send({ error: "Invalid email or password" });
    }

    reply.header("Set-Cookie", sessionCookie(auth.sessionToken));
    return { authenticated: true, user: auth.user };
  });

  app.post("/api/auth/registration", async (request, reply) => {
    const body = registrationBodySchema.parse(request.body);

    const auth = await registerWithPassword(body).catch((error) => {
      request.log.warn(error, "Ory password registration failed");
      return null;
    });

    if (!auth) {
      return reply.code(400).send({ error: "Registration failed" });
    }

    reply.header("Set-Cookie", sessionCookie(auth.sessionToken));
    return { authenticated: true, user: auth.user };
  });

  app.post("/api/auth/logout", async (request, reply) => {
    await revokeApiSession(request.headers.cookie);
    reply.header("Set-Cookie", clearSessionCookie());
    return { ok: true };
  });

  app.get("/api/tasks-page", async () => getTaskManagementData());
  app.get("/api/orf-state", async () => getOrfStateSnapshot());

  app.post("/api/results", async (request, reply) => {
    const body = createResultBodySchema.parse(request.body);
    const result = await createResult(body);

    if (!result) {
      return reply.code(404).send({ error: "Objective not found" });
    }

    return { result };
  });

  app.post("/api/tasks", async (request, reply) => {
    const body = createTaskBodySchema.parse(request.body);
    const task = await createTask(body);

    if (!task) {
      return reply.code(404).send({ error: "Result not found" });
    }

    return { task };
  });

  app.post("/api/tasks/:taskId/checklist", async (request, reply) => {
    const params = taskParamsSchema.parse(request.params);
    const body = createChecklistItemBodySchema.parse(request.body);
    const created = await createChecklistItem(params.taskId, body);

    if (!created) {
      return reply.code(404).send({ error: "Task not found" });
    }

    return { ok: true };
  });

  app.patch("/api/tasks/:taskId/status", async (request, reply) => {
    const params = taskParamsSchema.parse(request.params);
    const body = updateTaskStatusBodySchema.parse(request.body);
    const updated = await updateTaskStatus(params.taskId, body.status);

    if (!updated) {
      return reply.code(404).send({ error: "Task not found" });
    }

    return { ok: true };
  });

  app.patch("/api/tasks/:taskId/completion", async (request, reply) => {
    const params = taskParamsSchema.parse(request.params);
    const body = completionBodySchema.parse(request.body);
    const updated = await setTaskCompletion(params.taskId, body.done);

    if (!updated) {
      return reply.code(404).send({ error: "Task not found" });
    }

    return { ok: true };
  });

  app.patch("/api/tasks/:taskId/checklist/:itemId", async (request, reply) => {
    const params = checklistParamsSchema.parse(request.params);
    const body = completionBodySchema.parse(request.body);
    const updated = await updateChecklistItem(params.taskId, params.itemId, body.done);

    if (!updated) {
      return reply.code(404).send({ error: "Checklist item not found" });
    }

    return { ok: true };
  });

  app.patch("/api/results/:resultId/order", async (request, reply) => {
    const params = resultParamsSchema.parse(request.params);
    const body = moveResultBodySchema.parse(request.body);
    const updated = await moveResult(params.resultId, body.referenceResultId, body.placement);

    if (!updated) {
      return reply.code(404).send({ error: "Result move target not found" });
    }

    return { ok: true };
  });

  app.patch("/api/tasks/:taskId/move", async (request, reply) => {
    const params = taskParamsSchema.parse(request.params);
    const body = moveTaskBodySchema.parse(request.body);
    const updated = await moveTask(params.taskId, body);

    if (!updated) {
      return reply.code(404).send({ error: "Task move target not found" });
    }

    return { ok: true };
  });

  app.patch("/api/tasks/:taskId/checklist/:itemId/move", async (request, reply) => {
    const params = checklistParamsSchema.parse(request.params);
    const body = moveChecklistBodySchema.parse(request.body);
    const updated = await moveChecklistItem(params.taskId, params.itemId, body);

    if (!updated) {
      return reply.code(404).send({ error: "Checklist move target not found" });
    }

    return { ok: true };
  });

  app.delete("/api/objectives/:objectiveId", async (request, reply) => {
    const params = objectiveParamsSchema.parse(request.params);
    const deleted = await deleteObjective(params.objectiveId);

    if (!deleted) {
      return reply.code(404).send({ error: "Objective not found" });
    }

    return { ok: true };
  });

  app.delete("/api/results/:resultId", async (request, reply) => {
    const params = resultParamsSchema.parse(request.params);
    const deleted = await deleteResult(params.resultId);

    if (!deleted) {
      return reply.code(404).send({ error: "Result not found" });
    }

    return { ok: true };
  });

  app.delete("/api/tasks/:taskId", async (request, reply) => {
    const params = taskParamsSchema.parse(request.params);
    const deleted = await deleteTask(params.taskId);

    if (!deleted) {
      return reply.code(404).send({ error: "Task not found" });
    }

    return { ok: true };
  });

  app.delete("/api/tasks/:taskId/checklist/:itemId", async (request, reply) => {
    const params = checklistParamsSchema.parse(request.params);
    const deleted = await deleteChecklistItem(params.taskId, params.itemId);

    if (!deleted) {
      return reply.code(404).send({ error: "Checklist item not found" });
    }

    return { ok: true };
  });

  return app;
}
