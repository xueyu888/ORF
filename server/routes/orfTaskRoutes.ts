import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  authorizeObjectiveWorkItemMutation,
  requireWorkItemTargetMutation,
} from "../auth/accessPolicy";
import { getDefaultRuntimeScopeForUser } from "../repositories/runtimeScope";
import { getScopedUsers } from "../repositories/userRepository";
import {
  createChecklistItem,
  createTask,
  deleteChecklistItem,
  deleteTask,
  moveChecklistItem,
  moveTask,
  setTaskCompletion,
  updateChecklistItem,
  updateChecklistItemLabel,
  updateTaskStatus,
  updateTaskTitle,
} from "../repositories/orfRepository";
import { resolveObjectiveIdForWorkItem } from "../access/orfTargetAccess";
import { isDateOnlyString } from "../../src/utils/date";

const taskStatusSchema = z.enum(["Backlog", "Todo", "In Progress", "In Review", "Done"]);
const prioritySchema = z.enum(["Low", "Medium", "High", "Critical"]);
const requiredTextSchema = z.string().trim().min(1);
const optionalTextSchema = z.string().trim().transform((value) => value || undefined).optional();
const updateTaskStatusBodySchema = z.object({ status: taskStatusSchema });
const titleBodySchema = z.object({ title: requiredTextSchema });
const labelBodySchema = z.object({ label: requiredTextSchema });
const completionBodySchema = z.object({ done: z.boolean() });
const taskParamsSchema = z.object({ taskId: z.string().min(1) });
const checklistParamsSchema = taskParamsSchema.extend({ itemId: z.string().min(1) });
const dateOnlySchema = z.string().trim().refine(isDateOnlyString, { message: "Invalid date" });
const optionalDateOnlySchema = z.string().trim().transform((value) => value || undefined).pipe(dateOnlySchema.optional()).optional();
const placementSchema = z.enum(["before", "after"]);
const createTaskBodySchema = z.object({
  title: requiredTextSchema,
  description: optionalTextSchema,
  assignee: optionalTextSchema,
  priority: prioritySchema.optional(),
  linkedObjectiveId: requiredTextSchema,
  dueDate: optionalDateOnlySchema,
});
const createChecklistItemBodySchema = z.object({
  label: optionalTextSchema,
  afterItemId: optionalTextSchema,
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

export function registerOrfTaskRoutes(app: FastifyInstance) {
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
      return reply.code(404).send({ error: "Objective not found" });
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
}
