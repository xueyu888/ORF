import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { isDateOnlyString } from "../../src/utils/date";
import { requireUserScopeContext } from "../auth/accessPolicy";
import {
  createMyWorkLogEntry,
  listMyWorkLogDay,
  listWorkLogActivity,
  listWorkLogObjectiveOptions,
  updateMyWorkLogEntry,
} from "../repositories/workLogRepository";

const dateSchema = z.string().refine(isDateOnlyString, "Expected YYYY-MM-DD date");

const myDayQuerySchema = z.object({
  date: dateSchema,
});

const myDayParamsSchema = z.object({
  date: dateSchema,
});

const entryParamsSchema = z.object({
  entryId: z.string().trim().min(1),
});

const entryBodySchema = z.object({
  bodyMarkdown: z.string().trim().min(1).max(12000),
  objectiveId: z.string().trim().min(1).nullish(),
});

const activityQuerySchema = z.object({
  from: dateSchema.optional(),
  limit: z.coerce.number().int().positive().max(160).optional(),
  objectiveId: z.string().trim().min(1).optional(),
  to: dateSchema.optional(),
  userId: z.string().trim().min(1).optional(),
});

function workLogSaveFailureMessage(reason: string) {
  if (reason === "emptyBody") return "工作日志内容不能为空";
  if (reason === "objectiveRequired") return "普通成员填写工作日志时必须选择目标";
  return "目标不存在或当前用户不能给该目标填写工作日志";
}

export function registerWorkLogRoutes(app: FastifyInstance) {
  app.get("/api/work-logs/objectives", async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }

    return { objectives: await listWorkLogObjectiveOptions(context.user, context.scope) };
  });

  app.get("/api/work-logs/my-day", async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }

    const query = myDayQuerySchema.parse(request.query);
    return { entries: await listMyWorkLogDay(context.user.id, context.scope, query.date) };
  });

  app.post("/api/work-logs/my-day/:date", async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }

    const params = myDayParamsSchema.parse(request.params);
    const body = entryBodySchema.parse(request.body);
    const outcome = await createMyWorkLogEntry(context.user, context.scope, params.date, body);
    if (outcome.status === "forbidden") {
      return reply.code(403).send({ error: "当前账号不能填写自己的工作日志" });
    }
    if (outcome.status === "invalid") {
      return reply.code(400).send({ error: workLogSaveFailureMessage(outcome.reason) });
    }
    if (outcome.status === "notFound") {
      return reply.code(404).send({ error: "工作日志不存在或不属于当前账号" });
    }
    return { entries: outcome.entries };
  });

  app.patch("/api/work-logs/entries/:entryId", async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }

    const params = entryParamsSchema.parse(request.params);
    const body = entryBodySchema.parse(request.body);
    const outcome = await updateMyWorkLogEntry(context.user, context.scope, params.entryId, body);
    if (outcome.status === "forbidden") {
      return reply.code(403).send({ error: "当前账号不能填写自己的工作日志" });
    }
    if (outcome.status === "notFound") {
      return reply.code(404).send({ error: "工作日志不存在或不属于当前账号" });
    }
    if (outcome.status === "invalid") {
      return reply.code(400).send({ error: workLogSaveFailureMessage(outcome.reason) });
    }
    return { entries: outcome.entries };
  });

  app.get("/api/work-logs/activity", async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }

    const query = activityQuerySchema.parse(request.query);
    return { entries: await listWorkLogActivity(context.scope, query) };
  });
}
