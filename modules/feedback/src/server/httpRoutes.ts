import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  feedbackReferenceCardDataFromReadModel,
  feedbackIssueListRequestFromInput,
  feedbackImpactSchema,
  feedbackFollowUpInputSchema,
  feedbackPrioritySchema,
  feedbackRelationTypeSchema,
  feedbackSubscriptionMutationModeSchema,
  feedbackTransitionInputSchema,
  type FeedbackCommandResult,
} from "../contracts";
import type { FeedbackRequestContext } from "./applicationPorts";
import type { FeedbackServerApplication } from "./application";

const feedbackParamsSchema = z.object({ feedbackId: z.string().min(1) });
const feedbackRelationParamsSchema = z.object({ feedbackId: z.string().min(1), relationId: z.string().min(1) });
const feedbackImportParamsSchema = z.object({ batchId: z.string().min(1) });
const feedbackReportAttachmentParamsSchema = z.object({ attachmentId: z.string().min(1) });
const feedbackReportAttachmentContentQuerySchema = z.object({
  disposition: z.enum(["attachment", "inline"]).optional(),
});
const optionalFeedbackReferenceQueryValueSchema = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().min(1).optional(),
).optional();
const feedbackReferenceCardQuerySchema = z.object({
  activity: optionalFeedbackReferenceQueryValueSchema,
  comment: optionalFeedbackReferenceQueryValueSchema,
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
  causeCategories: z.array(z.string().trim().min(1)).min(1).optional(),
  impact: feedbackImpactSchema.optional(),
  priority: feedbackPrioritySchema.nullable().optional(),
  projectId: z.string().trim().min(1).nullable().optional(),
}).strict();
const updateFeedbackReportBodySchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
  description: z.string().trim().min(1),
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

type MultipartFilePart = {
  readonly file: Readable & { readonly truncated?: boolean };
  readonly fieldname: string;
  readonly filename: string;
  readonly mimetype: string;
  readonly type: "file";
  toBuffer(): Promise<Buffer>;
};

type MultipartFieldPart = {
  readonly fieldname: string;
  readonly type: "field";
  readonly value: unknown;
};

type MultipartPart = MultipartFilePart | MultipartFieldPart;

const feedbackReportAttachmentFileLimit = 1_000;

class FeedbackAttachmentUploadLimitError extends Error {
  readonly statusCode = 413;

  constructor(readonly maxBytes: number) {
    super("Feedback attachments exceed the configured total size limit");
    this.name = "FeedbackAttachmentUploadLimitError";
  }
}

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

function applicationActor(context: FeedbackRequestContext) {
  return {
    id: context.user.id,
    name: context.user.name,
    role: context.user.role,
    status: context.user.status,
    scope: context.scope,
  };
}

function requireActiveFeedbackTransferActor(reply: FastifyReply, context: FeedbackRequestContext) {
  if (context.user.status !== "active") {
    reply.code(403).send({ error: "Only active members can import or export feedback" });
    return null;
  }
  return applicationActor(context);
}

async function readCreateFeedbackBody(request: FastifyRequest, uploadMaxBytes: number) {
  const contentType = request.headers["content-type"] ?? "";
  if (!contentType.includes("multipart/form-data")) {
    const body = createFeedbackBodySchema.parse(request.body);
    return {
      input: {
        title: body.title,
        causeCategories: body.causeCategories,
        impact: body.impact,
        priority: body.priority ?? null,
        description: body.description,
        assigneeUserId: normalizeOptionalId(body.assigneeUserId),
        projectId: normalizeOptionalId(body.projectId),
        attachments: [],
      },
      dispose: async () => undefined,
    };
  }

  const fields: Record<string, string> = {};
  const attachments: Array<{ body: Readable; clientId: string; fileName: string; mimeType: string }> = [];
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "orf-feedback-upload-"));
  let aggregateBytes = 0;
  let attachmentIndex = 0;

  try {
    for await (const part of multipartParts(request, uploadMaxBytes, feedbackReportAttachmentFileLimit)) {
      if (part.type === "field" && typeof part.value === "string") {
        fields[part.fieldname] = part.value;
        continue;
      }
      if (part.type !== "file") continue;

      const clientId = part.fieldname.startsWith("attachment:")
        ? part.fieldname.slice("attachment:".length).trim()
        : "";
      if (!clientId) {
        for await (const _chunk of part.file) {
          // Consume unsupported file fields so multipart parsing can finish safely.
        }
        continue;
      }

      attachmentIndex += 1;
      const temporaryPath = join(temporaryDirectory, `${attachmentIndex}.upload`);
      const aggregateLimiter = new Transform({
        transform(chunk: Buffer | Uint8Array, _encoding, callback) {
          aggregateBytes += chunk.byteLength;
          if (aggregateBytes > uploadMaxBytes) {
            callback(new FeedbackAttachmentUploadLimitError(uploadMaxBytes));
            return;
          }
          callback(null, chunk);
        },
      });
      await pipeline(part.file, aggregateLimiter, createWriteStream(temporaryPath, { flags: "wx" }));
      if (part.file.truncated) {
        throw new FeedbackAttachmentUploadLimitError(uploadMaxBytes);
      }
      attachments.push({
        body: createReadStream(temporaryPath),
        clientId,
        fileName: part.filename,
        mimeType: part.mimetype,
      });
    }

    const body = createFeedbackMultipartFieldsSchema.parse(fields);
    return {
      input: {
        title: body.title,
        causeCategories: parseCauseCategories(body.causeCategories),
        impact: body.impact,
        priority: parsePriority(body.priority),
        description: body.description,
        assigneeUserId: normalizeOptionalId(body.assigneeUserId),
        projectId: normalizeOptionalId(body.projectId),
        attachments,
      },
      dispose: () => rm(temporaryDirectory, { force: true, recursive: true }),
    };
  } catch (error) {
    await rm(temporaryDirectory, { force: true, recursive: true });
    throw error;
  }
}

async function readFeedbackImportUpload(request: FastifyRequest, uploadMaxBytes: number) {
  const contentType = request.headers["content-type"] ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return null;
  }

  let file: { body: Buffer; fileName: string; mimeType: string } | null = null;
  const fields: Record<string, string> = {};
  for await (const part of multipartParts(request, uploadMaxBytes)) {
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

function multipartParts(request: FastifyRequest, uploadMaxBytes: number, files = 1): AsyncIterable<MultipartPart> {
  const requestWithMultipart = request as FastifyRequest & {
    parts?: (options: { limits: { fileSize: number; files: number } }) => AsyncIterable<MultipartPart>;
  };
  if (!requestWithMultipart.parts) {
    throw new Error("Feedback multipart request handling is not registered.");
  }
  return requestWithMultipart.parts({ limits: { fileSize: uploadMaxBytes, files } });
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

function isUnsupportedFeedbackImportArchive(file: { body: Buffer; fileName: string; mimeType: string }) {
  const fileName = file.fileName.toLowerCase();
  const mimeType = file.mimeType.toLowerCase();
  return (file.body.length >= 4 && file.body.readUInt32LE(0) === 0x04034b50) ||
    fileName.endsWith(".zip") ||
    mimeType.includes("zip");
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

export function registerFeedbackHttpRoutes(app: FastifyInstance, feedback: FeedbackServerApplication) {
  const updateFeedbackAssigneeRoute = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = feedbackParamsSchema.parse(request.params);
    const body = updateFeedbackAssigneeBodySchema.parse(request.body);
    const context = await feedback.actor.requireUserScopeContext(request, reply);
    if (!context) return reply;
    return sendFeedbackCommandOutcome(reply, await feedback.updateAssignee(params.feedbackId, body, applicationActor(context)));
  };

  app.get("/api/feedback", async (request, reply) => {
    const context = await feedback.actor.requireUserScopeContext(request, reply);
    if (!context) return reply;

    const listRequest = feedbackIssueListRequestFromInput(request.query as Record<string, string | string[] | null | undefined>);
    return feedback.getIssueList({
      filters: listRequest.filters,
      pagination: listRequest.pagination,
      scope: context.scope,
      viewerUserId: context.user.id,
    });
  });

  app.get("/api/feedback/assignees", async (request, reply) => {
    const context = await feedback.actor.requireUserScopeContext(request, reply);
    if (!context) return reply;

    const users = await feedback.listAssigneeOptions(context.scope);
    return { users };
  });

  app.get("/api/feedback/references", async (request, reply) => {
    const context = await feedback.actor.requireUserScopeContext(request, reply);
    if (!context) return reply;

    const query = parseFeedbackReferenceQuery(request.query);
    const byId = await feedback.getReferences(context.scope, query.ids);
    const bySearch = query.q ? await feedback.searchReferences(context.scope, query.q, query.limit) : [];
    const byRecent = query.ids.length === 0 && !query.q ? await feedback.listReferences(context.scope, query.limit) : [];
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
    const context = await feedback.actor.requireUserScopeContext(request, reply);
    if (!context) return reply;

    return feedback.getDashboardSummary(context.scope);
  });

  app.post("/api/feedback/imports/preflight", async (request, reply) => {
    const context = await feedback.actor.requireUserScopeContext(request, reply);
    if (!context) return reply;
    const actor = requireActiveFeedbackTransferActor(reply, context);
    if (!actor) return reply;

    const file = await readFeedbackImportUpload(request, feedbackPortsUploadLimit(feedback));
    if (!file) return reply.code(400).send({ error: "Feedback import file is required" });
    if (isUnsupportedFeedbackImportArchive(file)) {
      return reply.code(400).send({ error: "Feedback import currently accepts CSV only" });
    }

    let referenceMappings: ReturnType<typeof parseFeedbackImportReferenceMappings>;
    try {
      referenceMappings = parseFeedbackImportReferenceMappings(file.fields.referenceMappings);
    } catch {
      return reply.code(400).send({ error: "Feedback import reference mappings are invalid" });
    }

    return feedback.preflightImport({
      body: file.body,
      fileName: file.fileName,
      mimeType: file.mimeType,
      referenceMappings,
    }, actor);
  });

  app.post("/api/feedback/imports/:batchId/commit", async (request, reply) => {
    const context = await feedback.actor.requireUserScopeContext(request, reply);
    if (!context) return reply;
    const actor = requireActiveFeedbackTransferActor(reply, context);
    if (!actor) return reply;

    const params = feedbackImportParamsSchema.parse(request.params);
    const result = await feedback.commitImport(params.batchId, actor);
    if (result.status === "notFound") return reply.code(404).send({ error: "Feedback import batch not found" });
    if (result.status === "invalid") return reply.code(409).send({ error: "Feedback import batch is not ready to commit" });
    return { result };
  });

  app.get("/api/feedback/report-attachments/:attachmentId/content", async (request, reply) => {
    const context = await feedback.actor.requireUserScopeContext(request, reply);
    if (!context) return reply;

    const params = feedbackReportAttachmentParamsSchema.parse(request.params);
    const query = feedbackReportAttachmentContentQuerySchema.parse(request.query);
    const outcome = await feedback.getReportAttachmentContent(params.attachmentId, applicationActor(context), query);
    if (outcome.status === "notFound") {
      return reply.code(404).send({ error: "Feedback report attachment not found" });
    }
    if (outcome.status === "forbidden") return reply.code(403).send({ error: "Forbidden" });

    reply.header("Cache-Control", "private, max-age=60");
    reply.header("Content-Disposition", contentDispositionHeader(outcome.contentDisposition, outcome.fileName));
    reply.header("Content-Type", outcome.contentType);
    reply.header("X-Content-Type-Options", "nosniff");
    if (outcome.contentLength !== undefined) reply.header("Content-Length", outcome.contentLength);
    return reply.send(outcome.body);
  });

  app.get("/api/feedback/:feedbackId/reference", async (request, reply) => {
    const params = feedbackParamsSchema.parse(request.params);
    const query = feedbackReferenceCardQuerySchema.parse(request.query);
    const context = await feedback.actor.requireUserScopeContext(request, reply);
    if (!context) return reply;

    const data = await feedback.getIssueDetail(params.feedbackId, { scope: context.scope, viewerUserId: context.user.id });
    if (!data) return reply.code(404).send({ error: "Feedback not found" });

    const reference = feedbackReferenceCardDataFromReadModel(data, {
      activityId: query.activity,
      commentMessageId: query.comment,
      feedbackId: params.feedbackId,
    });
    if (!reference) return reply.code(404).send({ error: "Feedback reference not found" });
    return { reference };
  });

  app.get("/api/feedback/:feedbackId", async (request, reply) => {
    const params = feedbackParamsSchema.parse(request.params);
    const context = await feedback.actor.requireUserScopeContext(request, reply);
    if (!context) return reply;

    const data = await feedback.getIssueDetail(params.feedbackId, { scope: context.scope, viewerUserId: context.user.id });
    if (!data) return reply.code(404).send({ error: "Feedback not found" });
    return data;
  });

  app.post("/api/feedback", async (request, reply) => {
    const context = await feedback.actor.requireUserScopeContext(request, reply);
    if (!context) return reply;

    const uploadMaxBytes = await feedback.getReportAttachmentMaxBytes();
    const parsed = await readCreateFeedbackBody(request, uploadMaxBytes);
    try {
      const outcome = await feedback.createFeedback(parsed.input, applicationActor(context));
      if (outcome.status === "notFound") return reply.code(404).send({ error: "Runtime scope not found" });
      if (outcome.status === "invalid") return reply.code(400).send({ error: "Feedback body is required" });
      if (outcome.status === "invalidAssignee") return reply.code(409).send({ error: "Feedback assignee must be an active member" });
      if (outcome.status === "invalidProject") return reply.code(409).send({ error: "Feedback project not found" });
      if (outcome.status === "tooLarge") {
        return reply.code(413).send({ error: "Feedback attachments exceed the configured total size limit" });
      }
      return { feedbackId: outcome.feedbackId };
    } finally {
      await parsed.dispose();
    }
  });

  app.post("/api/feedback/:feedbackId/transitions", async (request, reply) => {
    const params = feedbackParamsSchema.parse(request.params);
    const body = feedbackTransitionInputSchema.parse(request.body);
    const context = await feedback.actor.requireUserScopeContext(request, reply);
    if (!context) return reply;
    return sendFeedbackCommandOutcome(reply, await feedback.transitionFeedback(params.feedbackId, body, applicationActor(context)));
  });

  app.post("/api/feedback/:feedbackId/follow-ups", async (request, reply) => {
    const params = feedbackParamsSchema.parse(request.params);
    const body = feedbackFollowUpInputSchema.parse(request.body);
    const context = await feedback.actor.requireUserScopeContext(request, reply);
    if (!context) return reply;
    return sendFeedbackCommandOutcome(reply, await feedback.followUp(params.feedbackId, body, applicationActor(context)));
  });

  app.patch("/api/feedback/:feedbackId/metadata", async (request, reply) => {
    const params = feedbackParamsSchema.parse(request.params);
    const body = updateFeedbackMetadataBodySchema.parse(request.body);
    const context = await feedback.actor.requireUserScopeContext(request, reply);
    if (!context) return reply;
    return sendFeedbackCommandOutcome(reply, await feedback.updateMetadata(params.feedbackId, body, applicationActor(context)));
  });

  app.patch("/api/feedback/:feedbackId/report", async (request, reply) => {
    const params = feedbackParamsSchema.parse(request.params);
    const body = updateFeedbackReportBodySchema.parse(request.body);
    const context = await feedback.actor.requireUserScopeContext(request, reply);
    if (!context) return reply;
    return sendFeedbackCommandOutcome(reply, await feedback.updateReport(params.feedbackId, body, applicationActor(context)));
  });

  app.put("/api/feedback/:feedbackId/assignee", updateFeedbackAssigneeRoute);

  app.post("/api/feedback/:feedbackId/relations", async (request, reply) => {
    const params = feedbackParamsSchema.parse(request.params);
    const body = addFeedbackRelationBodySchema.parse(request.body);
    const context = await feedback.actor.requireUserScopeContext(request, reply);
    if (!context) return reply;
    return sendFeedbackCommandOutcome(reply, await feedback.addRelation(params.feedbackId, body, applicationActor(context)));
  });

  app.delete("/api/feedback/:feedbackId/relations/:relationId", async (request, reply) => {
    const params = feedbackRelationParamsSchema.parse(request.params);
    const body = removeFeedbackRelationBodySchema.parse(request.body);
    const context = await feedback.actor.requireUserScopeContext(request, reply);
    if (!context) return reply;
    return sendFeedbackCommandOutcome(reply, await feedback.removeRelation(params.feedbackId, params.relationId, body, applicationActor(context)));
  });

  app.put("/api/feedback/:feedbackId/view", async (request, reply) => {
    const context = await feedback.actor.requireUserScopeContext(request, reply);
    if (!context) return reply;
    const params = feedbackParamsSchema.parse(request.params);
    const body = markFeedbackViewedBodySchema.parse(request.body);
    return sendFeedbackCommandOutcome(reply, await feedback.markViewed(params.feedbackId, body, applicationActor(context)));
  });

  app.get("/api/feedback/:feedbackId/subscription", async (request, reply) => {
    const params = feedbackParamsSchema.parse(request.params);
    const context = await feedback.actor.requireUserScopeContext(request, reply);
    if (!context) return reply;

    const result = await feedback.getSubscription(params.feedbackId, applicationActor(context));
    if (result.status === "notFound") return reply.code(404).send({ error: "Feedback not found" });
    if (result.status === "invalid") return reply.code(400).send({ error: "Feedback subscription is invalid" });
    return { subscription: { mode: result.mode } };
  });

  app.put("/api/feedback/:feedbackId/subscription", async (request, reply) => {
    const params = feedbackParamsSchema.parse(request.params);
    const body = updateFeedbackSubscriptionBodySchema.parse(request.body);
    const context = await feedback.actor.requireUserScopeContext(request, reply);
    if (!context) return reply;

    const result = await feedback.setSubscription(params.feedbackId, body.mode, applicationActor(context));
    if (result.status === "notFound") return reply.code(404).send({ error: "Feedback not found" });
    if (result.status === "invalid") return reply.code(400).send({ error: "Feedback subscription is invalid" });
    return { subscription: { mode: result.mode } };
  });
}

function feedbackPortsUploadLimit(feedback: FeedbackServerApplication) {
  return feedback.uploadMaxBytes;
}

function contentDispositionHeader(disposition: "attachment" | "inline", fileName: string) {
  const fallback = (fileName || "attachment")
    .replace(/["\\\r\n]/g, "_")
    .replace(/[^\x20-\x7e]/g, "_")
    .trim() || "attachment";
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName || "attachment")}`;
}
