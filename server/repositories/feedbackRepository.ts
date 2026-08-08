import type { Readable } from "node:stream";
import { and, eq } from "drizzle-orm";
import {
  planFeedbackAssigneeChangedNotification,
  planFeedbackCreatedNotification,
  planFeedbackLifecycleChangedNotification,
  type FeedbackImpact,
  type FeedbackPriority,
  type FeedbackRelationType,
  type FeedbackTransitionInput,
} from "@orf/feedback-module/contracts";
import {
  addFeedbackIssueRelation,
  buildFeedbackNotificationDispatchDraft,
  createFeedbackDraft,
  createFeedbackIssue,
  feedbackReportAttachmentResponseContentType,
  feedbackNotificationRecipient,
  getFeedbackAssignmentNotificationDispatchRecipients,
  getFeedbackCommentNotificationFacts,
  getFeedbackOrdinaryNotificationDispatchRecipients,
  getFeedbackReferences as getFeedbackReferenceSummaries,
  getFeedbackReportAttachmentContentFacts,
  listFeedbackReferences as listFeedbackReferenceSummaries,
  markFeedbackViewed as markFeedbackViewedInModule,
  mergeFeedbackNotificationDispatchRecipients,
  publishFeedbackNotificationDispatch,
  removeFeedbackIssueRelation,
  searchFeedbackReferences as searchFeedbackReferenceSummaries,
  transitionFeedbackIssue,
  updateFeedbackIssueAssignee,
  updateFeedbackIssueMetadata,
  type FeedbackCommandResult,
  type FeedbackNotificationDispatchDraft,
  type FeedbackNotificationDispatchRecipient,
  type FeedbackNotificationRecipientDirectory,
  type FeedbackTargetTitleSync,
  type FeedbackTransitionNotificationDispatchFactory,
} from "@orf/feedback-module/server";
import { replaceOrfAttachmentMarkdownTokens } from "../../src/features/rich-text/orfRichTextTokens";
import type { OrfUserDisplayProfile } from "../../src/types/orf";
import { db } from "../db/client";
import {
  getActiveAdminNotificationRecipients,
  getActiveMemberNotificationRecipientsByIds,
} from "./notificationRepository";
import { feedbackNotificationPort } from "../feedback/feedbackNotificationPort";
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

export type { FeedbackCommandResult } from "@orf/feedback-module/server";

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

type ProjectRow = { id: string; name: string } | null;

const feedbackNotificationRecipientDirectory: FeedbackNotificationRecipientDirectory = {
  getActiveAdminUserIds: getActiveAdminNotificationRecipients,
  getActiveMemberUserIdsByIds: getActiveMemberNotificationRecipientsByIds,
};

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

function feedbackWriteActor(actor: FeedbackCommandActor, teamId: string) {
  return {
    id: actor.id,
    role: actor.role,
    status: actor.status === "active" ? "active" as const : "inactive" as const,
    teamId,
  };
}

const syncFeedbackTargetTitle: FeedbackTargetTitleSync = async (client, input) => {
  await client
    .update(commentThreads)
    .set({ targetTitle: input.title, updatedAt: input.updatedAt })
    .where(and(eq(commentThreads.teamId, input.teamId), eq(commentThreads.targetType, "feedback"), eq(commentThreads.targetId, input.feedbackId)));
};

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

function uniqueNotificationUserIds(userIds: Array<string | null | undefined>) {
  const normalized = userIds.map((userId) => userId?.trim()).filter((userId): userId is string => Boolean(userId));
  return Array.from(new Set(normalized));
}

async function publishFeedbackDispatch(dispatchId: string | null | undefined) {
  await publishFeedbackNotificationDispatch(db, dispatchId, feedbackNotificationPort);
}

async function prepareFeedbackCreatedNotificationDispatch(input: {
  actorName: string;
  actorUserId: string;
  assigneeName?: string | null;
  assigneeUserId?: string | null;
  feedbackId: string;
  project: ProjectRow;
  teamId: string;
  title: string;
}): Promise<FeedbackNotificationDispatchDraft | null> {
  const recipients = await getFeedbackOrdinaryNotificationDispatchRecipients(db, feedbackNotificationRecipientDirectory, {
    assigneeUserId: input.assigneeUserId,
    createdBy: input.actorUserId,
    feedbackId: input.feedbackId,
    includeCommentParticipants: false,
    teamId: input.teamId,
  });

  return buildFeedbackNotificationDispatchDraft(planFeedbackCreatedNotification({
    actorName: input.actorName,
    actorUserId: input.actorUserId,
    assigneeName: input.assigneeName,
    feedbackId: input.feedbackId,
    project: input.project,
    recipientUserIds: [],
    teamId: input.teamId,
    title: input.title,
  }), recipients);
}

function feedbackLifecycleActionRequiredUserId(
  command: FeedbackTransitionInput,
  input: { assigneeUserId?: string | null; createdBy?: string | null },
) {
  if (command.type === "submit_verification") return input.createdBy ?? null;
  if (command.type === "reject_verification" || command.type === "reopen") return input.assigneeUserId ?? null;
  return null;
}

async function prepareFeedbackLifecycleNotificationDispatchFactory(input: {
  actorName: string;
  actorUserId: string;
  assigneeUserId?: string | null;
  command: FeedbackTransitionInput;
  createdBy?: string | null;
  feedbackId: string;
  project: ProjectRow;
  teamId: string;
  title: string;
}): Promise<FeedbackTransitionNotificationDispatchFactory | null> {
  const ordinaryRecipients = await getFeedbackOrdinaryNotificationDispatchRecipients(db, feedbackNotificationRecipientDirectory, {
    assigneeUserId: input.assigneeUserId,
    createdBy: input.createdBy,
    feedbackId: input.feedbackId,
    includeCommentParticipants: true,
    teamId: input.teamId,
  });
  const actionRequiredUserIds = await getActiveMemberNotificationRecipientsByIds(input.teamId, uniqueNotificationUserIds([
    feedbackLifecycleActionRequiredUserId(input.command, {
      assigneeUserId: input.assigneeUserId,
      createdBy: input.createdBy,
    }),
  ]));
  const recipients = mergeFeedbackNotificationDispatchRecipients([
    ...ordinaryRecipients,
    ...actionRequiredUserIds.map((userId) => feedbackNotificationRecipient({
      attentionLevel: "action_required",
      deliveryClass: "direct",
      reasons: ["action_required"],
      userId,
    })),
  ].filter((recipient): recipient is FeedbackNotificationDispatchRecipient => Boolean(recipient)));

  return (context) => buildFeedbackNotificationDispatchDraft(planFeedbackLifecycleChangedNotification({
    actorName: input.actorName,
    actorUserId: input.actorUserId,
    feedbackId: input.feedbackId,
    project: input.project,
    recipientUserIds: [],
    resolution: context.resolution,
    stage: context.stage,
    teamId: input.teamId,
    title: input.title,
  }), recipients);
}

async function prepareFeedbackAssignedNotificationDispatch(input: {
  actorName: string;
  actorUserId: string;
  createdBy?: string | null;
  feedbackId: string;
  nextAssigneeName?: string | null;
  nextAssigneeUserId?: string | null;
  previousAssigneeName?: string | null;
  previousAssigneeUserId?: string | null;
  teamId: string;
  title: string;
}): Promise<FeedbackNotificationDispatchDraft | null> {
  const recipients = await getFeedbackAssignmentNotificationDispatchRecipients(db, feedbackNotificationRecipientDirectory, {
    createdBy: input.createdBy,
    feedbackId: input.feedbackId,
    nextAssigneeUserId: input.nextAssigneeUserId,
    previousAssigneeUserId: input.previousAssigneeUserId,
    teamId: input.teamId,
  });

  return buildFeedbackNotificationDispatchDraft(planFeedbackAssigneeChangedNotification({
    actorName: input.actorName,
    actorUserId: input.actorUserId,
    feedbackId: input.feedbackId,
    nextAssigneeName: input.nextAssigneeName,
    previousAssigneeName: input.previousAssigneeName,
    recipientUserIds: [],
    teamId: input.teamId,
    title: input.title,
  }), recipients);
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

  const assigneeUser = input.assigneeUserId ? await resolveActiveMemberById(teamId, input.assigneeUserId) : null;
  if (input.assigneeUserId && !assigneeUser) {
    return { status: "invalidAssignee" };
  }
  const projectId = input.projectId?.trim() || null;
  const project = projectId ? await resolveProjectById(teamId, projectId) : null;
  if (projectId && !project) {
    return { status: "invalidProject" };
  }

  const draft = createFeedbackDraft();
  const preparedUploads: Array<{ clientId: string; prepared: PreparedCommentAttachment }> = [];
  let createdFeedbackId = "";
  try {
    for (const attachment of input.attachments ?? []) {
      const prepared = await prepareCommentAttachment({
        body: attachment.body,
        createdAt: draft.createdAt,
        createdBy: actor.id,
        fileName: attachment.fileName,
        messageId: null,
        mimeType: attachment.mimeType,
        storageScopeId: teamId,
        targetId: draft.id,
        targetType: "feedback",
      });
      if (prepared.status !== "ok") {
        await deleteStoredCommentAttachmentObjects(preparedUploads.map((upload) => upload.prepared.row));
        return { status: prepared.status };
      }
      preparedUploads.push({ clientId: attachment.clientId, prepared: prepared.prepared });
    }

    const report = buildReportDescription({ description: input.description.trim(), uploads: preparedUploads });
    if (report.status !== "ok") {
      await deleteStoredCommentAttachmentObjects(preparedUploads.map((upload) => upload.prepared.row));
      return { status: "invalid" };
    }

    const notificationDispatch = await prepareFeedbackCreatedNotificationDispatch({
      actorName: actor.name,
      actorUserId: actor.id,
      assigneeName: assigneeUser?.name ?? null,
      assigneeUserId: assigneeUser?.id ?? null,
      feedbackId: draft.id,
      project,
      teamId,
      title: input.title.trim(),
    });

    const created = await createFeedbackIssue(db, {
      assigneeUserId: assigneeUser?.id ?? null,
      causeCategories: input.causeCategories,
      description: report.description,
      draft,
      impact: input.impact,
      notificationDispatch,
      priority: input.priority ?? null,
      projectId,
      reportAttachments: preparedUploads.map((upload) => ({
        id: upload.prepared.row.id,
        objectKey: upload.prepared.row.objectKey,
        fileName: upload.prepared.row.fileName,
        mimeType: upload.prepared.row.mimeType,
        fileSize: upload.prepared.row.fileSize,
        width: upload.prepared.row.width ?? null,
        height: upload.prepared.row.height ?? null,
        sourceCommentAttachmentId: null,
      })),
      title: input.title,
    }, feedbackWriteActor(actor, teamId));
    if (created.status !== "ok") {
      await deleteStoredCommentAttachmentObjects(preparedUploads.map((upload) => upload.prepared.row));
      return created;
    }

    createdFeedbackId = created.feedbackId;
    await publishFeedbackDispatch(created.notificationDispatchId);
  } catch (error) {
    await deleteStoredCommentAttachmentObjects(preparedUploads.map((upload) => upload.prepared.row));
    throw error;
  }

  publishFeedbackReadModelInvalidation({ actorUserId: actor.id, feedbackId: createdFeedbackId, teamId });

  const item = await getFeedbackFromReadModel(createdFeedbackId, runtimeScope(teamId), actor.id);
  return item ? { status: "ok", feedback: item } : { status: "notFound" };
}

export async function updateFeedbackMetadata(
  feedbackId: string,
  input: UpdateFeedbackMetadataInput,
  actor: FeedbackCommandActor,
): Promise<FeedbackCommandResult> {
  const teamId = storageScopeId(actor.scope);
  if (!teamId) return { status: "notFound" };

  const nextProjectId = input.projectId === undefined ? undefined : input.projectId?.trim() || null;
  if (nextProjectId && !(await resolveProjectById(teamId, nextProjectId))) {
    return { status: "invalidProject" };
  }

  const result = await updateFeedbackIssueMetadata(db, {
    causeCategories: input.causeCategories,
    description: input.description,
    expectedVersion: input.expectedVersion,
    feedbackId,
    impact: input.impact,
    priority: input.priority,
    projectId: nextProjectId,
    title: input.title,
  }, feedbackWriteActor(actor, teamId), { syncFeedbackTargetTitle });

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
  const currentFacts = await getFeedbackCommentNotificationFacts(db, feedbackId);
  const previousAssignee = currentFacts?.assigneeUserId ? await resolveActiveMemberById(teamId, currentFacts.assigneeUserId) : null;
  const notificationDispatch = currentFacts && currentFacts.teamId === teamId
    ? await prepareFeedbackAssignedNotificationDispatch({
        actorName: actor.name,
        actorUserId: actor.id,
        createdBy: currentFacts.createdBy,
        feedbackId,
        nextAssigneeName: nextAssignee?.name ?? null,
        nextAssigneeUserId: nextAssignee?.id ?? null,
        previousAssigneeName: previousAssignee?.name ?? null,
        previousAssigneeUserId: currentFacts.assigneeUserId ?? null,
        teamId,
        title: currentFacts.title,
      })
    : null;

  const result = await updateFeedbackIssueAssignee(db, {
    assigneeUserId: nextAssignee?.id ?? null,
    expectedVersion: input.expectedVersion,
    feedbackId,
    notificationDispatch,
  }, feedbackWriteActor(actor, teamId));

  if (result.status !== "ok") return result;

  if (result.changed) {
    await publishFeedbackDispatch(result.notificationDispatchId);
    publishFeedbackReadModelInvalidation({ actorUserId: actor.id, feedbackId, teamId });
  }
  return { status: "ok", changed: result.changed };
}

export async function transitionFeedback(
  feedbackId: string,
  command: FeedbackTransitionInput,
  actor: FeedbackCommandActor,
): Promise<FeedbackCommandResult> {
  const teamId = storageScopeId(actor.scope);
  if (!teamId) return { status: "notFound" };

  const currentFacts = await getFeedbackCommentNotificationFacts(db, feedbackId);
  const project = currentFacts?.projectId ? await resolveProjectById(teamId, currentFacts.projectId) : null;
  const notificationDispatch = currentFacts && currentFacts.teamId === teamId
    ? await prepareFeedbackLifecycleNotificationDispatchFactory({
        actorName: actor.name,
        actorUserId: actor.id,
        assigneeUserId: currentFacts.assigneeUserId ?? null,
        command,
        createdBy: currentFacts.createdBy ?? null,
        feedbackId,
        project,
        teamId,
        title: currentFacts.title,
      })
    : null;

  const result = await transitionFeedbackIssue(db, {
    command,
    feedbackId,
    notificationDispatch,
  }, feedbackWriteActor(actor, teamId));

  if (result.status !== "ok") return result;
  if (result.changed) {
    await publishFeedbackDispatch(result.notificationDispatchId);
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

  const result = await addFeedbackIssueRelation(db, {
    expectedVersion: input.expectedVersion,
    feedbackId,
    targetFeedbackId: input.targetFeedbackId,
    type: input.type,
  }, feedbackWriteActor(actor, teamId));

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

  const result = await removeFeedbackIssueRelation(db, {
    expectedVersion: input.expectedVersion,
    feedbackId,
    relationId,
  }, feedbackWriteActor(actor, teamId));

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
