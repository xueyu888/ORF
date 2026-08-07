import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import { and, eq, inArray, or } from "drizzle-orm";
import {
  planFeedbackAssigneeChangedNotification,
  planFeedbackCreatedNotification,
  planFeedbackLifecycleChangedNotification,
  type FeedbackActivityType,
  type FeedbackImpact,
  type FeedbackPriority,
  type FeedbackRelationType,
  type FeedbackTransitionInput,
} from "@orf/feedback-module/contracts";
import {
  feedbackReportAttachmentResponseContentType,
  getFeedbackAssignmentNotificationRecipients,
  getFeedbackOrdinaryNotificationRecipients,
  getFeedbackReferences as getFeedbackReferenceSummaries,
  getFeedbackReportAttachmentContentFacts,
  listFeedbackReferences as listFeedbackReferenceSummaries,
  markFeedbackViewed as markFeedbackViewedInModule,
  recordFeedbackCommentCreatedActivity,
  searchFeedbackReferences as searchFeedbackReferenceSummaries,
  type FeedbackActivityDatabase,
  type FeedbackNotificationRecipientDirectory,
} from "@orf/feedback-module/server";
import {
  applyFeedbackTransition,
  canonicalizeFeedbackRelation,
  deriveFeedbackCapabilities,
  type FeedbackDomainErrorCode,
} from "../../modules/feedback/src/domain";
import {
  feedback,
  feedbackActivityEvents,
  feedbackCauseCategories,
  feedbackParticipants,
  feedbackRelations,
  feedbackReportAttachments,
} from "../../modules/feedback/src/infrastructure/database/schema";
import { replaceOrfAttachmentMarkdownTokens } from "../../src/features/rich-text/orfRichTextTokens";
import type { OrfUserDisplayProfile } from "../../src/types/orf";
import { db } from "../db/client";
import { publishNotificationEvent } from "../notifications/publisher";
import {
  getActiveAdminNotificationRecipients,
  getActiveMemberNotificationRecipientsByIds,
} from "./notificationRepository";
import { publishOrfDataInvalidation } from "../realtime/orfReadModelInvalidations";
import { getFeedbackIssueDetailReadModelData } from "../readModels/feedbackIssueReadModel";
import { commentThreads, projects } from "../db/schema";
import { objectStorage } from "../storage/objectStorage";
import {
  deleteStoredCommentAttachmentObjects,
  prepareCommentAttachment,
  type PreparedCommentAttachment,
} from "./commentAttachmentRepository";
import { runtimeScope, runtimeScopeStorageId, type RuntimeScope } from "./runtimeScope";
import { getScopedUsers } from "./userRepository";

export type CreateFeedbackAttachmentInput = {
  body: Buffer;
  clientId: string;
  fileName: string;
  mimeType: string;
};

export type CreateFeedbackInput = {
  assigneeUserId?: string | null;
  attachments?: CreateFeedbackAttachmentInput[];
  causeCategories: string[];
  description: string;
  impact: FeedbackImpact;
  priority?: FeedbackPriority | null;
  projectId?: string | null;
  title: string;
};

export type FeedbackCommandActor = {
  id: string;
  name: string;
  role: "admin" | "member";
  status: "active" | "inactive" | "disabled" | "pending" | "rejected";
  scope?: RuntimeScope | null;
};

export type CreateFeedbackOutcome =
  | { status: "ok"; feedback: NonNullable<Awaited<ReturnType<typeof getFeedbackFromReadModel>>> }
  | { status: "notFound" }
  | { status: "invalid" }
  | { status: "invalidAssignee" }
  | { status: "invalidProject" }
  | { status: "tooLarge" };

export type FeedbackCommandResult =
  | { status: "ok"; changed: boolean }
  | { status: "notFound" }
  | { status: "invalid" }
  | { status: "invalidAssignee" }
  | { status: "invalidProject" }
  | { status: "conflict" }
  | { status: "forbidden" };

export type UpdateFeedbackMetadataInput = {
  causeCategories?: string[];
  description?: string;
  expectedVersion: number;
  impact?: FeedbackImpact;
  priority?: FeedbackPriority | null;
  projectId?: string | null;
  title?: string;
};

export type UpdateFeedbackAssigneeInput = {
  assigneeUserId: string | null;
  expectedVersion: number;
};
export type AddFeedbackRelationInput = {
  expectedVersion: number;
  targetFeedbackId: string;
  type: FeedbackRelationType;
};
export type RemoveFeedbackRelationInput = {
  expectedVersion: number;
};
export type MarkFeedbackViewedInput = {
  seenThroughSequence: number;
};

export type FeedbackAssigneeOption = Pick<OrfUserDisplayProfile, "avatarUrl" | "id" | "name">;
export type FeedbackReference = {
  id: string;
  title: string;
};

export type FeedbackReportAttachmentContentOutcome =
  | { status: "ok"; body: Readable; contentDisposition: "attachment" | "inline"; contentLength?: number; contentType: string; fileName: string }
  | { status: "notFound" }
  | { status: "forbidden" };

type FeedbackRow = typeof feedback.$inferSelect;
type ProjectRow = { id: string; name: string } | null;

const feedbackNotificationRecipientDirectory: FeedbackNotificationRecipientDirectory = {
  getActiveAdminUserIds: getActiveAdminNotificationRecipients,
  getActiveMemberUserIdsByIds: getActiveMemberNotificationRecipientsByIds,
};

let idCounter = 0;

function nextCounter() {
  idCounter = (idCounter + 1) % Number.MAX_SAFE_INTEGER;
  return idCounter.toString(36);
}

function makeFeedbackId() {
  return `fb-${Date.now()}-${nextCounter()}-${randomUUID()}`;
}

function makeActivityId() {
  return `fact-${Date.now()}-${nextCounter()}-${randomUUID()}`;
}

function makeRelationId() {
  return `frel-${Date.now()}-${nextCounter()}-${randomUUID()}`;
}

function nowIso() {
  return new Date().toISOString();
}

function uniqueStrings(values: readonly string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function normalizeCauseCategories(categories: readonly string[] | undefined) {
  if (!categories) return undefined;
  return uniqueStrings(categories);
}

function sameStringList(left: readonly string[], right: readonly string[]) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function storageScopeId(scope: RuntimeScope | null | undefined) {
  return scope ? runtimeScopeStorageId(scope).trim() : "";
}

async function resolveActiveMemberById(teamId: string, userId: string | null | undefined) {
  const normalizedUserId = userId?.trim();
  if (!normalizedUserId) {
    return null;
  }

  const scopedUsers = await getScopedUsers(runtimeScope(teamId));
  const member = scopedUsers.find((user) => user.status === "active" && user.id === normalizedUserId);
  return member ? { id: member.id, name: member.name } : null;
}

export async function listFeedbackAssigneeOptions(scope: RuntimeScope): Promise<FeedbackAssigneeOption[]> {
  const scopedUsers = await getScopedUsers(scope);
  return scopedUsers
    .filter((user) => user.status === "active")
    .map((user) => ({
      avatarUrl: user.avatarUrl ?? null,
      id: user.id,
      name: user.name,
    }));
}

async function resolveProjectById(teamId: string, projectId: string | null | undefined): Promise<ProjectRow> {
  const normalizedProjectId = projectId?.trim();
  if (!normalizedProjectId) return null;
  const [project] = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(and(eq(projects.id, normalizedProjectId), eq(projects.teamId, teamId)))
    .limit(1);
  return project ?? null;
}

function actorSnapshot(actor: FeedbackCommandActor, teamId: string) {
  return {
    id: actor.id,
    role: actor.role,
    status: actor.status === "active" ? "active" as const : "inactive" as const,
    teamId,
  };
}

function entitySnapshot(row: FeedbackRow) {
  return {
    id: row.id,
    assigneeUserId: row.assigneeUserId,
    closedAt: row.closedAt,
    closedByUserId: row.closedByUserId,
    createdByUserId: row.createdBy,
    impact: row.impact,
    priority: row.priority,
    projectId: row.projectId,
    resolution: row.resolution,
    stage: row.stage,
    teamId: row.teamId,
    version: row.version,
  };
}

function domainErrorToCommandStatus(code: FeedbackDomainErrorCode): FeedbackCommandResult["status"] {
  if (code === "expected_version_mismatch") return "conflict";
  if (code === "forbidden" || code === "actor_inactive" || code === "actor_out_of_scope" || code === "administrative_takeover_reason_required") return "forbidden";
  return "invalid";
}

function buildReportDescription(input: { description: string; uploads: Array<{ clientId: string; prepared: PreparedCommentAttachment }> }) {
  const uploadsByClientId = new Map(input.uploads.map((upload) => [upload.clientId, upload.prepared]));
  const usedClientIds = new Set<string>();
  const missingClientIds = new Set<string>();
  const replaced = replaceOrfAttachmentMarkdownTokens(input.description, (reference, token) => {
    if (reference.kind !== "pending") return token;
    const upload = uploadsByClientId.get(reference.pendingAttachmentId);
    if (!upload) {
      missingClientIds.add(reference.pendingAttachmentId);
      return "";
    }

    usedClientIds.add(reference.pendingAttachmentId);
    return upload.markdown;
  });
  if (missingClientIds.size > 0) {
    return { status: "invalid" as const };
  }

  const unreferencedMarkdown = input.uploads
    .filter((upload) => !usedClientIds.has(upload.clientId))
    .map((upload) => upload.prepared.markdown);
  const description = [replaced.trim(), ...unreferencedMarkdown].filter(Boolean).join("\n\n").trim();
  return description ? { status: "ok" as const, description } : { status: "invalid" as const };
}

async function notifyFeedbackCreated(input: {
  actorName: string;
  actorUserId: string;
  assigneeName?: string | null;
  assigneeUserId?: string | null;
  feedbackId: string;
  project: ProjectRow;
  teamId: string;
  title: string;
}) {
  await publishNotificationEvent(planFeedbackCreatedNotification({
    actorName: input.actorName,
    actorUserId: input.actorUserId,
    assigneeName: input.assigneeName,
    feedbackId: input.feedbackId,
    project: input.project,
    recipientUserIds: await getFeedbackOrdinaryNotificationRecipients(db, feedbackNotificationRecipientDirectory, {
      assigneeUserId: input.assigneeUserId,
      createdBy: input.actorUserId,
      feedbackId: input.feedbackId,
      includeCommentParticipants: false,
      teamId: input.teamId,
    }),
    teamId: input.teamId,
    title: input.title,
  }));
}

async function notifyFeedbackLifecycleChanged(input: {
  actorName: string;
  actorUserId: string;
  assigneeUserId?: string | null;
  createdBy?: string | null;
  feedbackId: string;
  project: ProjectRow;
  stage: string;
  resolution?: string | null;
  teamId: string;
  title: string;
}) {
  await publishNotificationEvent(planFeedbackLifecycleChangedNotification({
    actorName: input.actorName,
    actorUserId: input.actorUserId,
    feedbackId: input.feedbackId,
    project: input.project,
    recipientUserIds: await getFeedbackOrdinaryNotificationRecipients(db, feedbackNotificationRecipientDirectory, {
      assigneeUserId: input.assigneeUserId,
      createdBy: input.createdBy,
      feedbackId: input.feedbackId,
      includeCommentParticipants: true,
      teamId: input.teamId,
    }),
    resolution: input.resolution,
    stage: input.stage,
    teamId: input.teamId,
    title: input.title,
  }));
}

async function notifyFeedbackAssigned(input: {
  actorName: string;
  actorUserId: string;
  feedbackId: string;
  nextAssigneeName?: string | null;
  nextAssigneeUserId?: string | null;
  previousAssigneeName?: string | null;
  previousAssigneeUserId?: string | null;
  teamId: string;
  title: string;
}) {
  await publishNotificationEvent(planFeedbackAssigneeChangedNotification({
    actorName: input.actorName,
    actorUserId: input.actorUserId,
    feedbackId: input.feedbackId,
    nextAssigneeName: input.nextAssigneeName,
    previousAssigneeName: input.previousAssigneeName,
    recipientUserIds: await getFeedbackAssignmentNotificationRecipients(feedbackNotificationRecipientDirectory, {
      nextAssigneeUserId: input.nextAssigneeUserId,
      previousAssigneeUserId: input.previousAssigneeUserId,
      teamId: input.teamId,
    }),
    teamId: input.teamId,
    title: input.title,
  }));
}

async function getFeedbackFromReadModel(feedbackId: string, scope: RuntimeScope, viewerUserId?: string | null) {
  const data = await getFeedbackIssueDetailReadModelData(feedbackId, { scope, viewerUserId });
  if (!data) return null;
  return data.feedback.find((entry) => entry.id === feedbackId) ?? null;
}

function publishFeedbackReadModelInvalidation(input: {
  actorUserId?: string | null;
  feedbackId: string;
  teamId: string;
}) {
  publishOrfDataInvalidation({
    actorUserId: input.actorUserId,
    models: ["feedback"],
    reason: "feedback.changed",
    target: { id: input.feedbackId, type: "feedback" },
    teamId: input.teamId,
  });
}

export async function createFeedback(input: CreateFeedbackInput, actor: FeedbackCommandActor): Promise<CreateFeedbackOutcome> {
  const teamId = storageScopeId(actor.scope);
  if (!teamId) {
    return { status: "notFound" };
  }

  const title = input.title.trim();
  const descriptionInput = input.description.trim();
  const causeCategories = normalizeCauseCategories(input.causeCategories);
  if (!title || !descriptionInput || !causeCategories?.length) {
    return { status: "invalid" };
  }

  const assigneeUser = input.assigneeUserId ? await resolveActiveMemberById(teamId, input.assigneeUserId) : null;
  if (input.assigneeUserId && !assigneeUser) {
    return { status: "invalidAssignee" };
  }
  const projectId = input.projectId?.trim() || null;
  const project = projectId ? await resolveProjectById(teamId, projectId) : null;
  if (projectId && !project) {
    return { status: "invalidProject" };
  }

  const id = makeFeedbackId();
  const createdAt = nowIso();
  const preparedUploads: Array<{ clientId: string; prepared: PreparedCommentAttachment }> = [];
  try {
    for (const attachment of input.attachments ?? []) {
      const prepared = await prepareCommentAttachment({
        body: attachment.body,
        createdAt,
        createdBy: actor.id,
        fileName: attachment.fileName,
        messageId: null,
        mimeType: attachment.mimeType,
        storageScopeId: teamId,
        targetId: id,
        targetType: "feedback",
      });
      if (prepared.status !== "ok") {
        await deleteStoredCommentAttachmentObjects(preparedUploads.map((upload) => upload.prepared.row));
        return { status: prepared.status };
      }
      preparedUploads.push({ clientId: attachment.clientId, prepared: prepared.prepared });
    }

    const report = buildReportDescription({ description: descriptionInput, uploads: preparedUploads });
    if (report.status !== "ok") {
      await deleteStoredCommentAttachmentObjects(preparedUploads.map((upload) => upload.prepared.row));
      return { status: "invalid" };
    }

    await db.transaction(async (tx) => {
      await tx.insert(feedback).values({
        id,
        teamId,
        projectId,
        title,
        description: report.description,
        stage: "open",
        resolution: null,
        impact: input.impact,
        priority: input.priority ?? null,
        assigneeUserId: assigneeUser?.id ?? null,
        createdBy: actor.id,
        updatedBy: actor.id,
        version: 0,
        createdAt,
        updatedAt: createdAt,
        closedAt: null,
        closedByUserId: null,
      });

      await tx.insert(feedbackCauseCategories).values(
        causeCategories.map((category, index) => ({
          teamId,
          feedbackId: id,
          category,
          sortOrder: index,
        })),
      );

      if (preparedUploads.length > 0) {
        await tx.insert(feedbackReportAttachments).values(
          preparedUploads.map((upload, index) => ({
            id: upload.prepared.row.id,
            teamId,
            feedbackId: id,
            objectKey: upload.prepared.row.objectKey,
            fileName: upload.prepared.row.fileName,
            mimeType: upload.prepared.row.mimeType,
            fileSize: upload.prepared.row.fileSize,
            width: upload.prepared.row.width ?? null,
            height: upload.prepared.row.height ?? null,
            sortOrder: index,
            createdBy: actor.id,
            createdAt,
            sourceCommentAttachmentId: null,
          })),
        );
      }

      await tx.insert(feedbackParticipants).values({
        teamId,
        feedbackId: id,
        userId: actor.id,
        firstParticipatedAt: createdAt,
        lastParticipatedAt: createdAt,
      });

      await tx.insert(feedbackActivityEvents).values({
        id: makeActivityId(),
        teamId,
        feedbackId: id,
        actorUserId: actor.id,
        activityType: "feedback.created",
        payload: { title, assigneeUserId: assigneeUser?.id ?? null, projectId, priority: input.priority ?? null },
        createdAt,
      });
    });
  } catch (error) {
    await deleteStoredCommentAttachmentObjects(preparedUploads.map((upload) => upload.prepared.row));
    throw error;
  }

  await notifyFeedbackCreated({
    actorName: actor.name,
    actorUserId: actor.id,
    assigneeName: assigneeUser?.name ?? null,
    assigneeUserId: assigneeUser?.id ?? null,
    feedbackId: id,
    project,
    teamId,
    title,
  });

  publishFeedbackReadModelInvalidation({ actorUserId: actor.id, feedbackId: id, teamId });

  const item = await getFeedbackFromReadModel(id, runtimeScope(teamId), actor.id);
  return item ? { status: "ok", feedback: item } : { status: "notFound" };
}

export async function updateFeedbackMetadata(
  feedbackId: string,
  input: UpdateFeedbackMetadataInput,
  actor: FeedbackCommandActor,
): Promise<FeedbackCommandResult> {
  const teamId = storageScopeId(actor.scope);
  if (!teamId) return { status: "notFound" };

  const nextTitle = input.title === undefined ? undefined : input.title.trim();
  const nextDescription = input.description === undefined ? undefined : input.description.trim();
  const nextCauseCategories = normalizeCauseCategories(input.causeCategories);
  if (nextTitle === "" || nextDescription === "" || (nextCauseCategories && nextCauseCategories.length === 0)) {
    return { status: "invalid" };
  }
  const nextProjectId = input.projectId === undefined ? undefined : input.projectId?.trim() || null;
  if (nextProjectId && !(await resolveProjectById(teamId, nextProjectId))) {
    return { status: "invalidProject" };
  }

  const result = await db.transaction(async (tx): Promise<FeedbackCommandResult> => {
    const [target] = await tx.select().from(feedback).where(eq(feedback.id, feedbackId)).limit(1).for("update");
    if (!target || target.teamId !== teamId) return { status: "notFound" };
    if (target.version !== input.expectedVersion) return { status: "conflict" };

    const capabilities = deriveFeedbackCapabilities({
      actor: actorSnapshot(actor, teamId),
      feedback: entitySnapshot(target),
    });
    if (!capabilities.canEditReport) return { status: "forbidden" };

    const causeRows = await tx
      .select({ category: feedbackCauseCategories.category, sortOrder: feedbackCauseCategories.sortOrder })
      .from(feedbackCauseCategories)
      .where(eq(feedbackCauseCategories.feedbackId, feedbackId));
    const currentCauseCategories = causeRows
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((row) => row.category);
    const changedFields: string[] = [];
    const patch: Partial<typeof feedback.$inferInsert> = {};
    const payload: Record<string, unknown> = {};

    if (nextTitle !== undefined && nextTitle !== target.title) {
      patch.title = nextTitle;
      changedFields.push("title");
      payload.previousTitle = target.title;
      payload.nextTitle = nextTitle;
    }
    if (nextDescription !== undefined && nextDescription !== target.description) {
      patch.description = nextDescription;
      changedFields.push("description");
    }
    if (input.impact !== undefined && input.impact !== target.impact) {
      patch.impact = input.impact;
      changedFields.push("impact");
      payload.previousImpact = target.impact;
      payload.nextImpact = input.impact;
    }
    if (input.priority !== undefined && input.priority !== target.priority) {
      patch.priority = input.priority;
      changedFields.push("priority");
      payload.previousPriority = target.priority;
      payload.nextPriority = input.priority;
    }
    if (nextProjectId !== undefined && nextProjectId !== (target.projectId ?? null)) {
      patch.projectId = nextProjectId;
      changedFields.push("projectId");
      payload.previousProjectId = target.projectId ?? null;
      payload.nextProjectId = nextProjectId;
    }

    const causeCategoriesChanged = Boolean(nextCauseCategories && !sameStringList(currentCauseCategories, nextCauseCategories));
    if (causeCategoriesChanged && nextCauseCategories) {
      changedFields.push("causeCategories");
      payload.previousCauseCategories = currentCauseCategories;
      payload.nextCauseCategories = nextCauseCategories;
      await tx.delete(feedbackCauseCategories).where(eq(feedbackCauseCategories.feedbackId, feedbackId));
      await tx.insert(feedbackCauseCategories).values(
        nextCauseCategories.map((category, index) => ({
          teamId,
          feedbackId,
          category,
          sortOrder: index,
        })),
      );
    }

    if (changedFields.length === 0) {
      return { status: "ok", changed: false };
    }

    const updatedAt = nowIso();
    await tx
      .update(feedback)
      .set({
        ...patch,
        updatedAt,
        updatedBy: actor.id,
        version: target.version + 1,
      })
      .where(and(eq(feedback.id, feedbackId), eq(feedback.teamId, teamId), eq(feedback.version, input.expectedVersion)));
    if (nextTitle !== undefined) {
      await tx
        .update(commentThreads)
        .set({ targetTitle: nextTitle, updatedAt })
        .where(and(eq(commentThreads.teamId, teamId), eq(commentThreads.targetType, "feedback"), eq(commentThreads.targetId, feedbackId)));
    }

    const activityType: FeedbackActivityType = changedFields.some((field) => field === "title" || field === "description")
      ? "feedback.report.changed"
      : "feedback.metadata.changed";
    await tx.insert(feedbackActivityEvents).values({
      id: makeActivityId(),
      teamId,
      feedbackId,
      actorUserId: actor.id,
      activityType,
      payload: { ...payload, changedFields },
      createdAt: updatedAt,
    });
    return { status: "ok", changed: true };
  });

  if (result.status === "ok" && result.changed) {
    publishFeedbackReadModelInvalidation({ actorUserId: actor.id, feedbackId, teamId });
  }
  return result;
}

export async function updateFeedbackAssignee(
  feedbackId: string,
  input: UpdateFeedbackAssigneeInput,
  actor: FeedbackCommandActor,
): Promise<FeedbackCommandResult> {
  const teamId = storageScopeId(actor.scope);
  if (!teamId) return { status: "notFound" };

  const nextAssignee = input.assigneeUserId ? await resolveActiveMemberById(teamId, input.assigneeUserId) : null;
  if (input.assigneeUserId && !nextAssignee) {
    return { status: "invalidAssignee" };
  }

  const result = await db.transaction(async (tx): Promise<FeedbackCommandResult & {
    nextAssigneeName?: string | null;
    nextAssigneeUserId?: string | null;
    previousAssigneeName?: string | null;
    previousAssigneeUserId?: string | null;
    title?: string;
  }> => {
    const [target] = await tx.select().from(feedback).where(eq(feedback.id, feedbackId)).limit(1).for("update");
    if (!target || target.teamId !== teamId) return { status: "notFound" };
    if (target.version !== input.expectedVersion) return { status: "conflict" };

    const capabilities = deriveFeedbackCapabilities({
      actor: actorSnapshot(actor, teamId),
      feedback: entitySnapshot(target),
    });
    if (!capabilities.canChangeAssignee) return { status: "forbidden" };
    if ((target.assigneeUserId ?? null) === (nextAssignee?.id ?? null)) return { status: "ok", changed: false };

    const previousAssignee = target.assigneeUserId ? await resolveActiveMemberById(teamId, target.assigneeUserId) : null;
    const updatedAt = nowIso();
    await tx
      .update(feedback)
      .set({
        assigneeUserId: nextAssignee?.id ?? null,
        updatedAt,
        updatedBy: actor.id,
        version: target.version + 1,
      })
      .where(and(eq(feedback.id, feedbackId), eq(feedback.teamId, teamId), eq(feedback.version, input.expectedVersion)));
    await tx.insert(feedbackActivityEvents).values({
      id: makeActivityId(),
      teamId,
      feedbackId,
      actorUserId: actor.id,
      activityType: "feedback.assignee.changed",
      payload: {
        previousAssigneeUserId: target.assigneeUserId,
        nextAssigneeUserId: nextAssignee?.id ?? null,
      },
      createdAt: updatedAt,
    });

    return {
      status: "ok",
      changed: true,
      nextAssigneeName: nextAssignee?.name ?? null,
      nextAssigneeUserId: nextAssignee?.id ?? null,
      previousAssigneeName: previousAssignee?.name ?? null,
      previousAssigneeUserId: target.assigneeUserId,
      title: target.title,
    };
  });

  if (result.status !== "ok") return result;

  if (result.changed) {
    await notifyFeedbackAssigned({
      actorName: actor.name,
      actorUserId: actor.id,
      feedbackId,
      nextAssigneeName: result.nextAssigneeName ?? null,
      nextAssigneeUserId: result.nextAssigneeUserId ?? null,
      previousAssigneeName: result.previousAssigneeName ?? null,
      previousAssigneeUserId: result.previousAssigneeUserId ?? null,
      teamId,
      title: result.title ?? "",
    });
    publishFeedbackReadModelInvalidation({ actorUserId: actor.id, feedbackId, teamId });
  }
  return { status: "ok", changed: result.changed };
}

async function duplicateTargetFeedbackIds(teamId: string, feedbackId: string) {
  const rows = await db
    .select({ targetFeedbackId: feedbackRelations.targetFeedbackId })
    .from(feedbackRelations)
    .where(
      and(
        eq(feedbackRelations.teamId, teamId),
        eq(feedbackRelations.sourceFeedbackId, feedbackId),
        eq(feedbackRelations.type, "duplicates"),
      ),
    );
  return rows.map((row) => row.targetFeedbackId);
}

export async function transitionFeedback(
  feedbackId: string,
  command: FeedbackTransitionInput,
  actor: FeedbackCommandActor,
): Promise<FeedbackCommandResult> {
  const teamId = storageScopeId(actor.scope);
  if (!teamId) return { status: "notFound" };

  const result = await db.transaction(async (tx): Promise<FeedbackCommandResult & {
    assigneeUserId?: string | null;
    createdBy?: string | null;
    project?: ProjectRow;
    stage?: string;
    resolution?: string | null;
    title?: string;
  }> => {
    const [target] = await tx
      .select({
        feedback,
        projectId: projects.id,
        projectName: projects.name,
      })
      .from(feedback)
      .leftJoin(projects, eq(projects.id, feedback.projectId))
      .where(eq(feedback.id, feedbackId))
      .limit(1)
      .for("update");
    if (!target || target.feedback.teamId !== teamId) return { status: "notFound" };

    const duplicateIds = await duplicateTargetFeedbackIds(teamId, feedbackId);
    const outcome = applyFeedbackTransition({
      actor: actorSnapshot(actor, teamId),
      command,
      duplicateRelations: { duplicateTargetFeedbackIds: duplicateIds },
      feedback: entitySnapshot(target.feedback),
      occurredAt: nowIso(),
    });
    if (!outcome.ok) {
      const status = domainErrorToCommandStatus(outcome.error.code);
      if (status === "conflict") return { status: "conflict" };
      if (status === "forbidden") return { status: "forbidden" };
      return { status: "invalid" };
    }

    const updatedAt = nowIso();
    await tx
      .update(feedback)
      .set({
        stage: outcome.value.feedback.stage,
        resolution: outcome.value.feedback.resolution,
        closedAt: outcome.value.feedback.closedAt ?? null,
        closedByUserId: outcome.value.feedback.closedByUserId ?? null,
        updatedAt,
        updatedBy: actor.id,
        version: outcome.value.feedback.version,
      })
      .where(and(eq(feedback.id, feedbackId), eq(feedback.teamId, teamId), eq(feedback.version, command.expectedVersion)));
    await tx.insert(feedbackActivityEvents).values({
      id: makeActivityId(),
      teamId,
      feedbackId,
      actorUserId: actor.id,
      activityType: outcome.value.activityType,
      payload: {
        command,
        previousStage: target.feedback.stage,
        previousResolution: target.feedback.resolution,
        nextStage: outcome.value.feedback.stage,
        nextResolution: outcome.value.feedback.resolution,
      },
      createdAt: updatedAt,
    });

    return {
      status: "ok",
      changed: true,
      assigneeUserId: target.feedback.assigneeUserId,
      createdBy: target.feedback.createdBy,
      project: target.projectId && target.projectName ? { id: target.projectId, name: target.projectName } : null,
      stage: outcome.value.feedback.stage,
      resolution: outcome.value.feedback.resolution,
      title: target.feedback.title,
    };
  });

  if (result.status !== "ok") return result;
  if (result.changed) {
    await notifyFeedbackLifecycleChanged({
      actorName: actor.name,
      actorUserId: actor.id,
      assigneeUserId: result.assigneeUserId ?? null,
      createdBy: result.createdBy ?? null,
      feedbackId,
      project: result.project ?? null,
      resolution: result.resolution ?? null,
      stage: result.stage ?? "",
      teamId,
      title: result.title ?? "",
    });
    publishFeedbackReadModelInvalidation({ actorUserId: actor.id, feedbackId, teamId });
  }
  return { status: "ok", changed: result.changed };
}

export async function addFeedbackRelation(
  feedbackId: string,
  input: AddFeedbackRelationInput,
  actor: FeedbackCommandActor,
): Promise<FeedbackCommandResult> {
  const teamId = storageScopeId(actor.scope);
  if (!teamId) return { status: "notFound" };

  const targetFeedbackId = input.targetFeedbackId.trim();
  if (!targetFeedbackId || targetFeedbackId === feedbackId) {
    return { status: "invalid" };
  }

  const result = await db.transaction(async (tx): Promise<FeedbackCommandResult> => {
    const [source] = await tx.select().from(feedback).where(eq(feedback.id, feedbackId)).limit(1).for("update");
    if (!source || source.teamId !== teamId) return { status: "notFound" };
    if (source.version !== input.expectedVersion) return { status: "conflict" };

    const capabilities = deriveFeedbackCapabilities({
      actor: actorSnapshot(actor, teamId),
      feedback: entitySnapshot(source),
    });
    if (!capabilities.canEditReport) return { status: "forbidden" };

    const [target] = await tx
      .select({ id: feedback.id, teamId: feedback.teamId })
      .from(feedback)
      .where(eq(feedback.id, targetFeedbackId))
      .limit(1);
    if (!target || target.teamId !== teamId) return { status: "notFound" };

    const canonical = canonicalizeFeedbackRelation({
      sourceFeedbackId: feedbackId,
      targetFeedbackId,
      type: input.type,
    });
    if (!canonical.ok) return { status: "invalid" };

    const relationId = makeRelationId();
    const occurredAt = nowIso();
    const inserted = await tx
      .insert(feedbackRelations)
      .values({
        id: relationId,
        teamId,
        sourceFeedbackId: canonical.value.sourceFeedbackId,
        targetFeedbackId: canonical.value.targetFeedbackId,
        type: canonical.value.type,
        createdBy: actor.id,
        createdAt: occurredAt,
      })
      .onConflictDoNothing({
        target: [
          feedbackRelations.teamId,
          feedbackRelations.type,
          feedbackRelations.sourceFeedbackId,
          feedbackRelations.targetFeedbackId,
        ],
      })
      .returning({ id: feedbackRelations.id });

    if (inserted.length === 0) {
      return { status: "ok", changed: false };
    }

    await tx
      .update(feedback)
      .set({
        updatedAt: occurredAt,
        updatedBy: actor.id,
        version: source.version + 1,
      })
      .where(and(eq(feedback.id, feedbackId), eq(feedback.teamId, teamId), eq(feedback.version, input.expectedVersion)));

    await tx.insert(feedbackActivityEvents).values({
      id: makeActivityId(),
      teamId,
      feedbackId,
      actorUserId: actor.id,
      activityType: "feedback.relation.added",
      payload: {
        relationId,
        type: canonical.value.type,
        sourceFeedbackId: canonical.value.sourceFeedbackId,
        targetFeedbackId: canonical.value.targetFeedbackId,
      },
      createdAt: occurredAt,
    });

    return { status: "ok", changed: true };
  });

  if (result.status === "ok" && result.changed) {
    publishFeedbackReadModelInvalidation({ actorUserId: actor.id, feedbackId, teamId });
  }
  return result;
}

export async function removeFeedbackRelation(
  feedbackId: string,
  relationId: string,
  input: RemoveFeedbackRelationInput,
  actor: FeedbackCommandActor,
): Promise<FeedbackCommandResult> {
  const teamId = storageScopeId(actor.scope);
  if (!teamId) return { status: "notFound" };

  const normalizedRelationId = relationId.trim();
  if (!normalizedRelationId) return { status: "invalid" };

  const result = await db.transaction(async (tx): Promise<FeedbackCommandResult> => {
    const [targetFeedback] = await tx.select().from(feedback).where(eq(feedback.id, feedbackId)).limit(1).for("update");
    if (!targetFeedback || targetFeedback.teamId !== teamId) return { status: "notFound" };
    if (targetFeedback.version !== input.expectedVersion) return { status: "conflict" };

    const capabilities = deriveFeedbackCapabilities({
      actor: actorSnapshot(actor, teamId),
      feedback: entitySnapshot(targetFeedback),
    });
    if (!capabilities.canEditReport) return { status: "forbidden" };

    const [relation] = await tx
      .select()
      .from(feedbackRelations)
      .where(
        and(
          eq(feedbackRelations.id, normalizedRelationId),
          eq(feedbackRelations.teamId, teamId),
          or(eq(feedbackRelations.sourceFeedbackId, feedbackId), eq(feedbackRelations.targetFeedbackId, feedbackId)),
        ),
      )
      .limit(1);
    if (!relation) return { status: "notFound" };

    if (relation.type === "duplicates") {
      const [duplicateSource] = await tx
        .select({
          id: feedback.id,
          resolution: feedback.resolution,
          stage: feedback.stage,
          teamId: feedback.teamId,
        })
        .from(feedback)
        .where(eq(feedback.id, relation.sourceFeedbackId))
        .limit(1)
        .for("update");
      if (
        duplicateSource?.teamId === teamId &&
        duplicateSource.resolution === "duplicate" &&
        (duplicateSource.stage === "pending_verification" || duplicateSource.stage === "closed")
      ) {
        return { status: "invalid" };
      }
    }

    const occurredAt = nowIso();
    await tx.delete(feedbackRelations).where(and(eq(feedbackRelations.id, normalizedRelationId), eq(feedbackRelations.teamId, teamId)));
    await tx
      .update(feedback)
      .set({
        updatedAt: occurredAt,
        updatedBy: actor.id,
        version: targetFeedback.version + 1,
      })
      .where(and(eq(feedback.id, feedbackId), eq(feedback.teamId, teamId), eq(feedback.version, input.expectedVersion)));
    await tx.insert(feedbackActivityEvents).values({
      id: makeActivityId(),
      teamId,
      feedbackId,
      actorUserId: actor.id,
      activityType: "feedback.relation.removed",
      payload: {
        relationId: relation.id,
        type: relation.type,
        sourceFeedbackId: relation.sourceFeedbackId,
        targetFeedbackId: relation.targetFeedbackId,
      },
      createdAt: occurredAt,
    });

    return { status: "ok", changed: true };
  });

  if (result.status === "ok" && result.changed) {
    publishFeedbackReadModelInvalidation({ actorUserId: actor.id, feedbackId, teamId });
  }
  return result;
}

export async function markFeedbackViewed(
  feedbackId: string,
  input: MarkFeedbackViewedInput,
  actor: FeedbackCommandActor,
): Promise<FeedbackCommandResult> {
  const teamId = storageScopeId(actor.scope);
  if (!teamId) return { status: "notFound" };
  const result = await markFeedbackViewedInModule(db, {
    actorStatus: actor.status === "active" ? "active" : "inactive",
    actorUserId: actor.id,
    feedbackId,
    seenThroughSequence: input.seenThroughSequence,
    teamId,
  });
  if (result.status === "ok" && result.changed) {
    publishFeedbackReadModelInvalidation({ actorUserId: actor.id, feedbackId, teamId });
  }
  return result;
}

export async function getFeedbackReferences(feedbackIds: readonly string[], scope: RuntimeScope): Promise<FeedbackReference[]> {
  const teamId = runtimeScopeStorageId(scope);
  return getFeedbackReferenceSummaries(db, { feedbackIds, teamId });
}

export async function listFeedbackReferences(scope: RuntimeScope, limit = 20): Promise<FeedbackReference[]> {
  const teamId = runtimeScopeStorageId(scope);
  return listFeedbackReferenceSummaries(db, { limit, teamId });
}

export async function searchFeedbackReferences(query: string, scope: RuntimeScope, limit = 20): Promise<FeedbackReference[]> {
  const teamId = runtimeScopeStorageId(scope);
  return searchFeedbackReferenceSummaries(db, { limit, query, teamId });
}

export async function getFeedbackReportAttachmentContent(
  attachmentId: string,
  actor: FeedbackCommandActor,
  options: { disposition?: "attachment" | "inline" } = {},
): Promise<FeedbackReportAttachmentContentOutcome> {
  const teamId = storageScopeId(actor.scope);
  if (!teamId) return { status: "notFound" };

  const outcome = await getFeedbackReportAttachmentContentFacts(db, {
    actorStatus: actor.status === "active" ? "active" : "inactive",
    attachmentId,
    disposition: options.disposition,
    teamId,
  });
  if (outcome.status !== "ok") return outcome;

  const stored = await objectStorage.getObject(outcome.facts.objectKey);
  if (!stored) {
    return { status: "notFound" };
  }

  return {
    status: "ok",
    body: stored.body,
    contentDisposition: outcome.facts.contentDisposition,
    contentLength: stored.contentLength,
    contentType: feedbackReportAttachmentResponseContentType(outcome.facts, { storedContentType: stored.contentType }),
    fileName: outcome.facts.fileName,
  };
}

export async function recordFeedbackCommentCreated(input: {
  actorUserId: string;
  commentMessageId: string;
  feedbackId: string;
  teamId: string;
}, client: FeedbackActivityDatabase = db) {
  await recordFeedbackCommentCreatedActivity(client, input);
}
