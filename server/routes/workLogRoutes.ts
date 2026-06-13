import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { isDateOnlyString } from "../../src/utils/date";
import { requireUserScopeContext } from "../auth/accessPolicy";
import {
  listMyWorkLogDay,
  listWorkLogActivity,
  listWorkLogObjectiveOptions,
  saveMyWorkLogDay,
} from "../repositories/workLogRepository";

const dateSchema = z.string().refine(isDateOnlyString, "Expected YYYY-MM-DD date");

const myDayQuerySchema = z.object({
  date: dateSchema,
});

const myDayParamsSchema = z.object({
  date: dateSchema,
});

const saveDayBodySchema = z.object({
  entries: z.array(z.object({
    bodyMarkdown: z.string().trim().min(1).max(12000),
    objectiveId: z.string().trim().min(1),
  })).max(24),
});

const activityQuerySchema = z.object({
  from: dateSchema.optional(),
  limit: z.coerce.number().int().positive().max(160).optional(),
  objectiveId: z.string().trim().min(1).optional(),
  to: dateSchema.optional(),
  userId: z.string().trim().min(1).optional(),
});

function workLogSaveFailureMessage(reason: string) {
  if (reason === "duplicateObjective") return "同一天同一个目标只能保留一条工作日志";
  if (reason === "emptyBody") return "工作日志内容不能为空";
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

  app.put("/api/work-logs/my-day/:date", async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }

    const params = myDayParamsSchema.parse(request.params);
    const body = saveDayBodySchema.parse(request.body);
    const outcome = await saveMyWorkLogDay(context.user, context.scope, params.date, body.entries);
    if (outcome.status === "forbidden") {
      return reply.code(403).send({ error: "只有正式挑战成员可以填写自己的工作日志" });
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
