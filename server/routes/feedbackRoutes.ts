import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  feedbackReferenceCardDataFromReadModel,
  feedbackIssueListRequestFromInput,
  feedbackImpactSchema,
  feedbackPrioritySchema,
  feedbackRelationTypeSchema,
  feedbackSubscriptionMutationModeSchema,
  feedbackTransitionInputSchema,
} from "@orf/feedback-module/contracts";
import {
  commitFeedbackImportBatch,
  feedbackBackupZipFileName,
  preflightFeedbackImport,
  type FeedbackImportActor,
} from "@orf/feedback-module/server";
import { requireFeedbackInScope, requireUserScopeContext } from "../auth/accessPolicy";
import { db } from "../db/client";
import { projects } from "../db/schema";
import { env } from "../env";
import {
  getFeedbackDashboardSummaryReadModelData,
  getFeedbackIssueDetailReadModelData,
  getFeedbackIssueListReadModelData,
} from "../readModels/feedbackIssueReadModel";
import {
  addFeedbackRelation,
  createFeedback,
  getFeedbackReferences,
  listFeedbackReferences,
  searchFeedbackReferences,
  getFeedbackReportAttachmentContent,
  getFeedbackSubscription,
  listFeedbackAssigneeOptions,
  markFeedbackViewed,
  removeFeedbackRelation,
  transitionFeedback,
  updateFeedbackAssignee,
  updateFeedbackSubscription,
  updateFeedbackMetadata,
  type FeedbackCommandActor,
  type FeedbackCommandResult,
} from "../feedback/feedbackCommandAdapter";
import { publishOrfDataInvalidation } from "../realtime/orfReadModelInvalidations";
import { runtimeScopeStorageId } from "../repositories/runtimeScope";
import {
  buildFeedbackBackupZipForScope,
  FeedbackBackupAttachmentUnavailableError,
} from "../feedback/feedbackBackupExport";

const feedbackParamsSchema = z.object({ feedbackId: z.string().min(1) });
const feedbackRelationParamsSchema = z.object({ feedbackId: z.string().min(1), relationId: z.string().min(1) });
const feedbackImportParamsSchema = z.object({ batchId: z.string().min(1) });
const feedbackReportAttachmentParamsSchema = z.object({ attachmentId: z.string().min(1) });
const feedbackReportAttachmentContentQuerySchema = z.object({
  disposition: z.enum(["attachment", "inline"]).optional(),
});
const feedbackReferenceCardQuerySchema = z.object({
  activity: z.preprocess((value) => typeof value === "string" && value.trim() === "" ? undefined : value, z.string().trim().min(1).optional()),
  comment: z.preprocess((value) => typeof value === "string" && value.trim() === "" ? undefined : value, z.string().trim().min(1).optional()),
});
const createFeedbackBodySchema = z.object({
  title: z.string().trim().min(1),
  causeCategories: z.array(z.string().trim().min(1)).min(1),
  impact: feedbackImpactSchema,
  priority: feedbackPrioritySchema.nullable().optional(),
  description: z.string().trim().min(1),
  assigneeUserId: z.string().trim().min(1).nullable().optional(),
  projectId: z.string().nullable().optional(),
});
const createFeedbackMultipartFieldsSchema = z.object({
  title: z.string().trim().min(1),
  causeCategories: z.string().trim().min(1),
  impact: feedbackImpactSchema,
  priority: z.string().optional(),
  description: z.string().trim().min(1),
  assigneeUserId: z.string().optional(),
  projectId: z.string().optional(),
});
const updateFeedbackMetadataBodySchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
  title: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
  causeCategories: z.array(z.string().trim().min(1)).min(1).optional(),
  impact: feedbackImpactSchema.optional(),
  priority: feedbackPrioritySchema.nullable().optional(),
  projectId: z.string().trim().min(1).nullable().optional(),
}).strict();
const updateFeedbackAssigneeBodySchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
  assigneeUserId: z.string().trim().min(1).nullable(),
}).strict();
const addFeedbackRelationBodySchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
  targetFeedbackId: z.string().trim().min(1),
  type: feedbackRelationTypeSchema,
}).strict();
const removeFeedbackRelationBodySchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
}).strict();
const markFeedbackViewedBodySchema = z.object({
  seenThroughSequence: z.number().int().nonnegative(),
}).strict();
const updateFeedbackSubscriptionBodySchema = z.object({
  mode: feedbackSubscriptionMutationModeSchema,
});
const feedbackReferencesQuerySchema = z.object({
  id: z.union([z.string(), z.array(z.string())]).optional(),
  ids: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(120).optional(),
  q: z.string().trim().optional(),
});

function parseCauseCategories(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return z.array(z.string().trim().min(1)).min(1).parse(parsed);
  } catch {
    return z.array(z.string().trim().min(1)).min(1).parse([]);
  }
}

function parsePriority(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? feedbackPrioritySchema.parse(normalized) : null;
}

function parseFeedbackReferenceQuery(query: unknown) {
  const parsed = feedbackReferencesQuerySchema.parse(query);
  const repeatedIds = Array.isArray(parsed.id) ? parsed.id : parsed.id ? [parsed.id] : [];
  const commaSeparatedIds = parsed.ids?.split(",") ?? [];
  return {
    ids: [...repeatedIds, ...commaSeparatedIds].map((value) => value.trim()).filter(Boolean).slice(0, 100),
    limit: parsed.limit ?? 20,
    q: parsed.q?.trim() ?? "",
  };
}

function normalizeOptionalId(value: string | null | undefined) {
  return value?.trim() || null;
}

function commandActor(context: NonNullable<Awaited<ReturnType<typeof requireUserScopeContext>>>): FeedbackCommandActor {
  return {
    id: context.user.id,
    name: context.user.name,
    role: context.user.role,
    status: context.user.status,
    scope: context.scope,
  };
}

function feedbackImportActor(context: NonNullable<Awaited<ReturnType<typeof requireUserScopeContext>>>): FeedbackImportActor {
  return {
    id: context.user.id,
    role: context.user.role,
    status: context.user.status === "active" ? "active" : "inactive",
    teamId: runtimeScopeStorageId(context.scope),
  };
}

function requireActiveFeedbackTransferActor(
  reply: FastifyReply,
  context: NonNullable<Awaited<ReturnType<typeof requireUserScopeContext>>>,
) {
  if (context.user.status !== "active") {
    reply.code(403).send({ error: "Only active members can import or export feedback" });
    return null;
  }
  return feedbackImportActor(context);
}

async function readCreateFeedbackBody(request: FastifyRequest) {
  const contentType = request.headers["content-type"] ?? "";
  if (!contentType.includes("multipart/form-data")) {
    const body = createFeedbackBodySchema.parse(request.body);
    return {
      title: body.title,
      causeCategories: body.causeCategories,
      impact: body.impact,
      priority: body.priority ?? null,
      description: body.description,
      assigneeUserId: normalizeOptionalId(body.assigneeUserId),
      projectId: normalizeOptionalId(body.projectId),
      attachments: [],
    };
  }

  const fields: Record<string, string> = {};
  const attachments: Array<{ body: Buffer; clientId: string; fileName: string; mimeType: string }> = [];
  for await (const part of request.parts({ limits: { fileSize: env.OBJECT_STORAGE_UPLOAD_MAX_BYTES } })) {
    if (part.type === "field" && typeof part.value === "string") {
      fields[part.fieldname] = part.value;
    }
    if (part.type === "file" && part.fieldname.startsWith("attachment:")) {
      const clientId = part.fieldname.slice("attachment:".length).trim();
      if (clientId) {
        attachments.push({
          body: await part.toBuffer(),
          clientId,
          fileName: part.filename,
          mimeType: part.mimetype,
        });
      }
    }
  }

  const body = createFeedbackMultipartFieldsSchema.parse(fields);
  return {
    title: body.title,
    causeCategories: parseCauseCategories(body.causeCategories),
    impact: body.impact,
    priority: parsePriority(body.priority),
    description: body.description,
    assigneeUserId: normalizeOptionalId(body.assigneeUserId),
    projectId: normalizeOptionalId(body.projectId),
    attachments,
  };
}

async function readFeedbackImportUpload(request: FastifyRequest) {
  const contentType = request.headers["content-type"] ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return null;
  }

  let file: { body: Buffer; fileName: string; mimeType: string } | null = null;
  const fields: Record<string, string> = {};
  for await (const part of request.parts({ limits: { fileSize: env.OBJECT_STORAGE_UPLOAD_MAX_BYTES } })) {
    if (part.type === "field" && typeof part.value === "string") {
      fields[part.fieldname] = part.value;
      continue;
    }
    if (part.type === "file" && part.fieldname === "file") {
      file = {
        body: await part.toBuffer(),
        fileName: part.filename || "feedback-import.csv",
        mimeType: part.mimetype,
      };
    }
  }

  return file ? { ...file, fields } : null;
}

function parseFeedbackImportReferenceMappings(value: string | undefined) {
  if (!value) return undefined;
  const parsed = JSON.parse(value) as {
    assigneeUserIds?: Record<string, string | null>;
    projectIds?: Record<string, string | null>;
  };
  return {
    assigneeUserIds: importReferenceMappingRecord(parsed.assigneeUserIds),
    projectIds: importReferenceMappingRecord(parsed.projectIds),
  };
}

function importReferenceMappingRecord(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const result: Record<string, string | null> = {};
  for (const [source, target] of Object.entries(value as Record<string, unknown>)) {
    if (!source.trim()) continue;
    if (target === null || target === "") {
      result[source] = null;
    } else if (typeof target === "string") {
      result[source] = target;
    }
  }
  return result;
}

function sendFeedbackCommandOutcome(reply: FastifyReply, outcome: FeedbackCommandResult) {
  if (outcome.status === "notFound") {
    return reply.code(404).send({ error: "Feedback not found" });
  }
  if (outcome.status === "forbidden") {
    return reply.code(403).send({ error: "Forbidden" });
  }
  if (outcome.status === "conflict") {
    return reply.code(409).send({ error: "Feedback version conflict" });
  }
  if (outcome.status === "invalidAssignee") {
    return reply.code(409).send({ error: "Feedback assignee must be an active member" });
  }
  if (outcome.status === "invalidProject") {
    return reply.code(409).send({ error: "Feedback project not found" });
  }
  if (outcome.status === "invalid") {
    return reply.code(400).send({ error: "Feedback command is invalid" });
  }
  return { ok: true, changed: outcome.changed };
}

export function registerFeedbackRoutes(app: FastifyInstance) {
  app.get("/api/feedback", async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }

    const listRequest = feedbackIssueListRequestFromInput(request.query as Record<string, string | string[] | null | undefined>);
    return getFeedbackIssueListReadModelData({
      filters: listRequest.filters,
      pagination: listRequest.pagination,
      scope: context.scope,
      viewerUserId: context.user.id,
    });
  });

  app.get("/api/feedback/assignees", async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }

    const users = await listFeedbackAssigneeOptions(context.scope);
    return { users };
  });

  app.get("/api/feedback/references", async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }

    const query = parseFeedbackReferenceQuery(request.query);
    const byId = await getFeedbackReferences(query.ids, context.scope);
    const bySearch = query.q ? await searchFeedbackReferences(query.q, context.scope, query.limit) : [];
    const byRecent = query.ids.length === 0 && !query.q ? await listFeedbackReferences(context.scope, query.limit) : [];
    const seen = new Set<string>();
    return {
      feedback: [...byId, ...bySearch, ...byRecent].filter((item) => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      }),
    };
  });

  app.get("/api/feedback/summary", async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }

    return getFeedbackDashboardSummaryReadModelData({ scope: context.scope });
  });

  app.get("/api/feedback/exports/backup.zip", async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }
    const actor = requireActiveFeedbackTransferActor(reply, context);
    if (!actor) {
      return reply;
    }

    const exportedAt = new Date().toISOString();
    let body: Buffer;
    try {
      body = await buildFeedbackBackupZipForScope({ exportedAt, scope: context.scope });
    } catch (error) {
      if (error instanceof FeedbackBackupAttachmentUnavailableError) {
        return reply.code(409).send({ error: "Feedback backup attachment object is unavailable" });
      }
      throw error;
    }
    reply.header("Content-Type", "application/zip");
    reply.header("Content-Disposition", contentDispositionHeader("attachment", feedbackBackupZipFileName(exportedAt)));
    reply.header("Cache-Control", "no-store");
    reply.header("Content-Length", body.length);
    return reply.send(body);
  });

  app.post("/api/feedback/imports/preflight", async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }
    const actor = requireActiveFeedbackTransferActor(reply, context);
    if (!actor) {
      return reply;
    }

    const file = await readFeedbackImportUpload(request);
    if (!file) {
      return reply.code(400).send({ error: "Feedback import file is required" });
    }

    const teamId = runtimeScopeStorageId(context.scope);
    const [assigneeOptions, projectRows] = await Promise.all([
      listFeedbackAssigneeOptions(context.scope),
      db.select({ id: projects.id, name: projects.name }).from(projects).where(eq(projects.teamId, teamId)),
    ]);
    let referenceMappings: ReturnType<typeof parseFeedbackImportReferenceMappings>;
    try {
      referenceMappings = parseFeedbackImportReferenceMappings(file.fields.referenceMappings);
    } catch {
      return reply.code(400).send({ error: "Feedback import reference mappings are invalid" });
    }

    const preflight = await preflightFeedbackImport(db, {
      actor,
      body: file.body,
      fileName: file.fileName,
      knownAssigneeUserIds: new Set(assigneeOptions.map((item) => item.id)),
      knownProjectIds: new Set(projectRows.map((item) => item.id)),
      mimeType: file.mimeType,
      referenceMappings,
    });

    return { preflight, referenceOptions: { assignees: assigneeOptions, projects: projectRows } };
  });

  app.post("/api/feedback/imports/:batchId/commit", async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }
    const actor = requireActiveFeedbackTransferActor(reply, context);
    if (!actor) {
      return reply;
    }

    const params = feedbackImportParamsSchema.parse(request.params);
    const result = await commitFeedbackImportBatch(db, { actor, batchId: params.batchId });
    if (result.status === "notFound") {
      return reply.code(404).send({ error: "Feedback import batch not found" });
    }
    if (result.status === "invalid") {
      return reply.code(409).send({ error: "Feedback import batch is not ready to commit" });
    }

    if (result.createdFeedbackIds.length > 0) {
      publishOrfDataInvalidation({
        actorUserId: context.user.id,
        models: ["feedback"],
        reason: "feedback.changed",
        teamId: runtimeScopeStorageId(context.scope),
      });
    }
    return { result };
  });

  app.get("/api/feedback/report-attachments/:attachmentId/content", async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }

    const params = feedbackReportAttachmentParamsSchema.parse(request.params);
    const query = feedbackReportAttachmentContentQuerySchema.parse(request.query);
    const outcome = await getFeedbackReportAttachmentContent(params.attachmentId, commandActor(context), query);
    if (outcome.status === "notFound") {
      return reply.code(404).send({ error: "Feedback report attachment not found" });
    }
    if (outcome.status === "forbidden") {
      return reply.code(403).send({ error: "Forbidden" });
    }

    reply.header("Cache-Control", "private, max-age=60");
    reply.header("Content-Disposition", contentDispositionHeader(outcome.contentDisposition, outcome.fileName));
    reply.header("Content-Type", outcome.contentType);
    reply.header("X-Content-Type-Options", "nosniff");
    if (outcome.contentLength !== undefined) {
      reply.header("Content-Length", outcome.contentLength);
    }
    return reply.send(outcome.body);
  });

  app.get("/api/feedback/:feedbackId/reference", async (request, reply) => {
    const params = feedbackParamsSchema.parse(request.params);
    const query = feedbackReferenceCardQuerySchema.parse(request.query);
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }

    const data = await getFeedbackIssueDetailReadModelData(params.feedbackId, { scope: context.scope, viewerUserId: context.user.id });
    if (!data) {
      return reply.code(404).send({ error: "Feedback not found" });
    }

    const reference = feedbackReferenceCardDataFromReadModel(data, {
      activityId: query.activity,
      commentMessageId: query.comment,
      feedbackId: params.feedbackId,
    });
    if (!reference) {
      return reply.code(404).send({ error: "Feedback reference not found" });
    }

    return { reference };
  });

  app.get("/api/feedback/:feedbackId", async (request, reply) => {
    const params = feedbackParamsSchema.parse(request.params);
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }

    const data = await getFeedbackIssueDetailReadModelData(params.feedbackId, { scope: context.scope, viewerUserId: context.user.id });
    if (!data) {
      return reply.code(404).send({ error: "Feedback not found" });
    }
    return data;
  });

  app.post("/api/feedback", async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }

    const body = await readCreateFeedbackBody(request);
    const outcome = await createFeedback(body, commandActor(context));

    if (outcome.status === "notFound") {
      return reply.code(404).send({ error: "Runtime scope not found" });
    }
    if (outcome.status === "invalid") {
      return reply.code(400).send({ error: "Feedback body is required" });
    }
    if (outcome.status === "invalidAssignee") {
      return reply.code(409).send({ error: "Feedback assignee must be an active member" });
    }
    if (outcome.status === "invalidProject") {
      return reply.code(409).send({ error: "Feedback project not found" });
    }
    if (outcome.status === "tooLarge") {
      return reply.code(413).send({ error: "Attachment is too large" });
    }

    return { feedback: outcome.feedback };
  });

  app.post("/api/feedback/:feedbackId/transitions", async (request, reply) => {
    const params = feedbackParamsSchema.parse(request.params);
    const body = feedbackTransitionInputSchema.parse(request.body);
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }

    return sendFeedbackCommandOutcome(reply, await transitionFeedback(params.feedbackId, body, commandActor(context)));
  });

  app.patch("/api/feedback/:feedbackId/metadata", async (request, reply) => {
    const params = feedbackParamsSchema.parse(request.params);
    const body = updateFeedbackMetadataBodySchema.parse(request.body);
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }

    return sendFeedbackCommandOutcome(reply, await updateFeedbackMetadata(params.feedbackId, body, commandActor(context)));
  });

  app.patch("/api/feedback/:feedbackId/assignee", async (request, reply) => {
    const params = feedbackParamsSchema.parse(request.params);
    const body = updateFeedbackAssigneeBodySchema.parse(request.body);
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }

    return sendFeedbackCommandOutcome(reply, await updateFeedbackAssignee(params.feedbackId, body, commandActor(context)));
  });

  app.post("/api/feedback/:feedbackId/relations", async (request, reply) => {
    const params = feedbackParamsSchema.parse(request.params);
    const body = addFeedbackRelationBodySchema.parse(request.body);
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }

    return sendFeedbackCommandOutcome(reply, await addFeedbackRelation(params.feedbackId, body, commandActor(context)));
  });

  app.delete("/api/feedback/:feedbackId/relations/:relationId", async (request, reply) => {
    const params = feedbackRelationParamsSchema.parse(request.params);
    const body = removeFeedbackRelationBodySchema.parse(request.body);
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }

    return sendFeedbackCommandOutcome(reply, await removeFeedbackRelation(params.feedbackId, params.relationId, body, commandActor(context)));
  });

  app.put("/api/feedback/:feedbackId/view", async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }
    const params = feedbackParamsSchema.parse(request.params);
    if (!(await requireFeedbackInScope(reply, params.feedbackId, context.scope))) {
      return reply;
    }

    const body = markFeedbackViewedBodySchema.parse(request.body);
    return sendFeedbackCommandOutcome(reply, await markFeedbackViewed(params.feedbackId, body, commandActor(context)));
  });

  app.get("/api/feedback/:feedbackId/subscription", async (request, reply) => {
    const params = feedbackParamsSchema.parse(request.params);
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }
    if (!(await requireFeedbackInScope(reply, params.feedbackId, context.scope))) {
      return reply;
    }

    const result = await getFeedbackSubscription(params.feedbackId, commandActor(context));
    if (result.status === "notFound") {
      return reply.code(404).send({ error: "Feedback not found" });
    }
    if (result.status === "invalid") {
      return reply.code(400).send({ error: "Feedback subscription is invalid" });
    }

    return { subscription: { mode: result.mode } };
  });

  app.put("/api/feedback/:feedbackId/subscription", async (request, reply) => {
    const params = feedbackParamsSchema.parse(request.params);
    const body = updateFeedbackSubscriptionBodySchema.parse(request.body);
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }
    if (!(await requireFeedbackInScope(reply, params.feedbackId, context.scope))) {
      return reply;
    }

    const result = await updateFeedbackSubscription(params.feedbackId, body.mode, commandActor(context));
    if (result.status === "notFound") {
      return reply.code(404).send({ error: "Feedback not found" });
    }
    if (result.status === "invalid") {
      return reply.code(400).send({ error: "Feedback subscription is invalid" });
    }

    return { subscription: { mode: result.mode } };
  });
}

function contentDispositionHeader(disposition: "attachment" | "inline", fileName: string) {
  const fallback = (fileName || "attachment")
    .replace(/["\\\r\n]/g, "_")
    .replace(/[^\x20-\x7e]/g, "_")
    .trim() || "attachment";
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName || "attachment")}`;
}
