import cors from "@fastify/cors";
import Fastify from "fastify";
import { z } from "zod";
import { env } from "./env";
import { getOrfStateSnapshot, getTaskManagementData, setTaskCompletion, updateChecklistItem, updateTaskStatus } from "./repositories/orfRepository";

const taskStatusSchema = z.enum(["Backlog", "Todo", "In Progress", "In Review", "Done"]);
const updateTaskStatusBodySchema = z.object({ status: taskStatusSchema });
const completionBodySchema = z.object({ done: z.boolean() });
const taskParamsSchema = z.object({ taskId: z.string().min(1) });
const checklistParamsSchema = taskParamsSchema.extend({ itemId: z.string().min(1) });

function corsOrigin() {
  if (env.CORS_ORIGIN === "*") {
    return true;
  }

  return env.CORS_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean);
}

export async function buildServer() {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: corsOrigin(),
  });

  app.get("/health", async () => ({
    ok: true,
    service: "orf-api",
  }));

  app.get("/api/tasks-page", async () => getTaskManagementData());
  app.get("/api/orf-state", async () => getOrfStateSnapshot());

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

  return app;
}
