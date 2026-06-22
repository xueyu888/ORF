import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { canUseWorkLogCategories } from "../../src/domain/orfWorkLogs";
import { isDateOnlyString } from "../../src/utils/date";
import { requireUserScopeContext } from "../auth/accessPolicy";
import {
  createMyWorkLogEntry,
  deleteMyWorkLogEntry,
  getWorkLogReport,
  listWorkLogCategoryOptions,
  listMyWorkLogDay,
  listWorkLogActivity,
  listWorkLogObjectiveOptions,
  updateMyWorkLogEntry,
} from "../repositories/workLogRepository";
import {
  isWorkLogClassificationSuggestionConfigured,
  suggestWorkLogClassification,
} from "../workLogs/workLogClassificationSuggestion";
import {
  reconcileWorkLogReminderState,
  snoozeWorkLogReminderState,
} from "../workLogs/workLogReminderState";
import { runtimeScopeStorageId } from "../repositories/runtimeScope";

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
  categoryId: z.string().trim().min(1).nullish(),
  categoryName: z.string().trim().min(1).max(48).nullish(),
  durationMinutes: z.number().int().min(1).max(1440).nullish(),
  objectiveId: z.string().trim().min(1).nullish(),
  remainingEstimatePercent: z.number().int().min(0).max(100).nullish(),
});

const classificationSuggestionBodySchema = z.object({
  bodyMarkdown: z.string().trim().min(1).max(12000),
});

const activityQuerySchema = z.object({
  from: dateSchema.optional(),
  limit: z.coerce.number().int().positive().max(160).optional(),
  objectiveId: z.string().trim().min(1).optional(),
  to: dateSchema.optional(),
  userId: z.string().trim().min(1).optional(),
});

function reportRangeDays(from: string, to: string) {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

const reportQuerySchema = z
  .object({
    from: dateSchema,
    scope: z.enum(["mine", "team"]).default("mine"),
    to: dateSchema,
  })
  .superRefine((query, context) => {
    if (query.from > query.to) {
      context.addIssue({ code: "custom", message: "from 不能晚于 to", path: ["from"] });
    }
    if (reportRangeDays(query.from, query.to) > 93) {
      context.addIssue({ code: "custom", message: "工作日志报表最多查询 93 天", path: ["to"] });
    }
  });

function workLogSaveFailureMessage(reason: string) {
  if (reason === "categoryForbidden") return "只有管理员可以使用工作日志分类";
  if (reason === "classificationConflict") return "工作日志只能选择一个目标或一个分类";
  if (reason === "emptyBody") return "工作日志内容不能为空";
  if (reason === "invalidCategory") return "工作日志分类不存在或不能使用";
  if (reason === "invalidDuration") return "记录时间必须是 1-1440 分钟的整数";
  if (reason === "invalidEstimate") return "目标剩余估计必须是 0-100 的整数";
  if (reason === "objectiveRequired") return "当前账号填写工作日志时必须选择目标";
  return "目标不存在或当前用户不能给该目标填写工作日志";
}

export function registerWorkLogRoutes(app: FastifyInstance) {
  app.get("/api/work-logs/reminder-state", async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }

    return {
      reminder: await reconcileWorkLogReminderState({
        publishRealtime: true,
        teamId: runtimeScopeStorageId(context.scope),
        userId: context.user.id,
      }),
    };
  });

  app.post("/api/work-logs/reminder-state/snooze", async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }

    return {
      reminder: await snoozeWorkLogReminderState({
        teamId: runtimeScopeStorageId(context.scope),
        userId: context.user.id,
      }),
    };
  });

  app.get("/api/work-logs/objectives", async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }

    const [categories, objectives] = await Promise.all([
      canUseWorkLogCategories(context.user) ? listWorkLogCategoryOptions(context.scope) : Promise.resolve([]),
      listWorkLogObjectiveOptions(context.user, context.scope),
    ]);
    return {
      categories,
      classificationSuggestionEnabled: canUseWorkLogCategories(context.user) && isWorkLogClassificationSuggestionConfigured(),
      objectives,
    };
  });

  app.post("/api/work-logs/classification-suggestion", async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }
    if (!canUseWorkLogCategories(context.user)) {
      return reply.code(403).send({ error: "只有管理员可以使用工作日志智能分类" });
    }

    const body = classificationSuggestionBodySchema.parse(request.body);
    const [categories, objectives] = await Promise.all([
      listWorkLogCategoryOptions(context.scope),
      listWorkLogObjectiveOptions(context.user, context.scope),
    ]);
    return {
      suggestion: await suggestWorkLogClassification({
        bodyMarkdown: body.bodyMarkdown,
        categories,
        objectives,
      }),
    };
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

  app.delete("/api/work-logs/entries/:entryId", async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }

    const params = entryParamsSchema.parse(request.params);
    const outcome = await deleteMyWorkLogEntry(context.user, context.scope, params.entryId);
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

  app.get("/api/work-logs/report", async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }

    const query = reportQuerySchema.parse(request.query);
    return { report: await getWorkLogReport(context.user, context.scope, query) };
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
