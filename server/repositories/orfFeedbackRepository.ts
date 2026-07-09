import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { replaceOrfAttachmentMarkdownTokens } from "../../src/features/rich-text/orfRichTextTokens";
import type { Feedback, FeedbackStatus, Impact } from "../../src/types/orf";
import { localDateString } from "../../src/utils/date";
import { db } from "../db/client";
import { commentAttachments, commentMessages, commentThreads, feedback, feedbackActivityEvents, feedbackCauseCategories, projects } from "../db/schema";
import { publishOrfDataInvalidation } from "../realtime/orfReadModelInvalidations";
import { getOrfStateSnapshot } from "../readModels/orfTaskManagementReadModel";
import {
  deleteStoredCommentAttachmentObjects,
  prepareCommentAttachment,
  type PreparedCommentAttachment,
} from "./commentAttachmentRepository";
import {
  getFeedbackAssignmentNotificationRecipients,
  getFeedbackOrdinaryNotificationRecipients,
} from "./feedbackSubscriptionRepository";
import { getProjectChatNotificationChannelIds } from "./notificationRepository";
import { publishNotificationEvent } from "../notifications/publisher";
import { runtimeScope, runtimeScopeStorageId, type RuntimeScope } from "./runtimeScope";
import { getScopedUsers } from "./userRepository";

export type CreateFeedbackInput = Pick<
  Feedback,
  "phenomenon" | "causeCategories"
> & {
  attachments?: CreateFeedbackAttachmentInput[];
  impact: Impact;
  initialBody: string;
  ownerUserId: string;
  projectId?: string | null;
};
export type CreateFeedbackAttachmentInput = {
  body: Buffer;
  clientId: string;
  fileName: string;
  mimeType: string;
};
export type CreateFeedbackActor = { id: string; name: string; scope?: RuntimeScope | null };
export type CreateFeedbackOutcome =
  | { status: "ok"; feedback: Feedback }
  | { status: "notFound" }
  | { status: "invalid" }
  | { status: "invalidOwner" }
  | { status: "invalidProject" }
  | { status: "tooLarge" };
export type FeedbackStatusActor = { id: string; name: string; role: "admin" | "member"; scope?: RuntimeScope | null };
export type FeedbackStatusUpdateResult = { status: "ok" } | { status: "notFound" } | { status: "forbidden" };
export type UpdateFeedbackMetadataInput = Partial<Pick<Feedback, "phenomenon" | "causeCategories" | "impact" | "ownerUserId" | "projectId">>;
export type FeedbackMetadataUpdateResult =
  | { status: "ok" }
  | { status: "notFound" }
  | { status: "forbidden" }
  | { status: "invalid" }
  | { status: "invalidOwner" }
  | { status: "invalidProject" };
type FeedbackMetadataUpdateError = Exclude<FeedbackMetadataUpdateResult, { status: "ok" }>;
export type FeedbackReference = Pick<Feedback, "id" | "phenomenon">;

const today = () => localDateString(new Date());
let lastNowMs = 0;
let feedbackIdCounter = 0;
let commentIdCounter = 0;

function nowIso() {
  const nextNowMs = Math.max(Date.now(), lastNowMs + 1);
  lastNowMs = nextNowMs;
  return new Date(nextNowMs).toISOString();
}

function nextFeedbackIdCounter() {
  feedbackIdCounter = (feedbackIdCounter + 1) % Number.MAX_SAFE_INTEGER;
  return feedbackIdCounter.toString(36);
}

function nextCommentIdCounter() {
  commentIdCounter = (commentIdCounter + 1) % Number.MAX_SAFE_INTEGER;
  return commentIdCounter.toString(36);
}

function makeFeedbackId() {
  return `fb-${Date.now()}-${nextFeedbackIdCounter()}-${randomUUID()}`;
}

function makeCommentId(prefix: "cmsg" | "cthread") {
  return `${prefix}-${Date.now()}-${nextCommentIdCounter()}-${randomUUID()}`;
}

function makeActivityId() {
  return `fact-${Date.now()}-${nextCommentIdCounter()}-${randomUUID()}`;
}

async function resolveActiveMemberById(storageScopeId: string, userId: string) {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) {
    return null;
  }

  const scopedUsers = await getScopedUsers(runtimeScope(storageScopeId));
  const member = scopedUsers.find((user) => user.status === "active" && user.id === normalizedUserId);
  return member ? { id: member.id, name: member.name } : null;
}

async function resolveProjectById(storageScopeId: string, projectId: string | null | undefined) {
  const normalizedProjectId = projectId?.trim();
  if (!normalizedProjectId) return null;
  const [project] = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(and(eq(projects.id, normalizedProjectId), eq(projects.teamId, storageScopeId)))
    .limit(1);
  return project ?? null;
}

function canManageFeedbackStatus(
  item: { ownerUserId: string | null; createdBy: string | null },
  actor: FeedbackStatusActor,
) {
  return actor.role === "admin" || item.createdBy === actor.id || item.ownerUserId === actor.id;
}

function canManageFeedbackMetadata(
  item: { ownerUserId: string | null; createdBy: string | null; status: FeedbackStatus },
  actor: FeedbackStatusActor,
) {
  if (actor.role === "admin") return true;
  if (item.status === "Closed") return false;
  return item.createdBy === actor.id || item.ownerUserId === actor.id;
}

function uniqueUserIds(userIds: Array<string | null | undefined>) {
  const normalized = userIds.map((userId) => userId?.trim()).filter((userId): userId is string => Boolean(userId));
  return Array.from(new Set(normalized));
}

function uniqueFeedbackIds(feedbackIds: readonly string[]) {
  return Array.from(new Set(feedbackIds.map((feedbackId) => feedbackId.trim()).filter(Boolean))).slice(0, 100);
}

function normalizeCauseCategories(categories: readonly string[] | undefined) {
  if (!categories) return undefined;
  return Array.from(new Set(categories.map((category) => category.trim()).filter(Boolean)));
}

function sameStringList(left: readonly string[], right: readonly string[]) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function metadataActivityAction(changedFields: readonly string[]) {
  const labels: Record<string, string> = {
    causeCategories: "标签",
    impact: "影响",
    ownerUserId: "处理人",
    phenomenon: "标题",
    projectId: "项目",
  };
  const changedLabels = changedFields.map((field) => labels[field]).filter(Boolean);
  return changedLabels.length > 0 ? `更新了反馈${changedLabels.join("、")}` : "更新了反馈属性";
}

function feedbackTargetHref(feedbackId: string) {
  return `/feedback/${encodeURIComponent(feedbackId)}`;
}

function feedbackStatusNotificationTitle(status: FeedbackStatus) {
  return status === "Closed" ? "反馈已关闭" : "反馈已重新打开";
}

function feedbackProjectMetadata(project: { id: string; name: string } | null | undefined): Record<string, string> {
  return project ? { projectId: project.id, projectName: project.name } : {};
}

function buildInitialCommentBody(input: { body: string; uploads: Array<{ clientId: string; prepared: PreparedCommentAttachment }> }) {
  const uploadsByClientId = new Map(input.uploads.map((upload) => [upload.clientId, upload.prepared]));
  const usedClientIds = new Set<string>();
  const missingClientIds = new Set<string>();
  const replaced = replaceOrfAttachmentMarkdownTokens(input.body, (reference, token) => {
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
  const body = [replaced.trim(), ...unreferencedMarkdown].filter(Boolean).join("\n\n").trim();
  return body ? { status: "ok" as const, body } : { status: "invalid" as const };
}

async function notifyFeedbackCreated(input: {
  actorName: string;
  actorUserId: string;
  feedbackId: string;
  ownerName: string;
  ownerUserId: string;
  project?: { id: string; name: string } | null;
  teamId: string;
  title: string;
}) {
  await publishNotificationEvent({
    actorName: input.actorName,
    actorUserId: input.actorUserId,
    body: `${input.actorName} 创建了反馈「${input.title}」，处理人：${input.ownerName}。`,
    destinationChannelIds: await getProjectChatNotificationChannelIds(input.teamId, input.project?.id),
    kind: "feedback.created",
    metadata: { feedbackTitle: input.title, owner: input.ownerName, ...feedbackProjectMetadata(input.project) },
    recipientUserIds: await getFeedbackOrdinaryNotificationRecipients({
      createdBy: input.actorUserId,
      feedbackId: input.feedbackId,
      includeCommentParticipants: false,
      ownerUserId: input.ownerUserId,
      teamId: input.teamId,
    }),
    targetHref: feedbackTargetHref(input.feedbackId),
    targetId: input.feedbackId,
    targetType: "feedback",
    teamId: input.teamId,
    title: "新的反馈 issue",
  });
}

async function notifyFeedbackStatusChanged(input: {
  actorName: string;
  actorUserId: string;
  createdBy?: string | null;
  feedbackId: string;
  ownerUserId?: string | null;
  project?: { id: string; name: string } | null;
  status: FeedbackStatus;
  teamId: string;
  title: string;
}) {
  const action = input.status === "Closed" ? "关闭" : "重新打开";
  await publishNotificationEvent({
    actorName: input.actorName,
    actorUserId: input.actorUserId,
    body: `${input.actorName} ${action}了反馈「${input.title}」。`,
    destinationChannelIds: await getProjectChatNotificationChannelIds(input.teamId, input.project?.id),
    kind: "feedback.status.changed",
    metadata: { feedbackStatus: input.status, feedbackTitle: input.title, ...feedbackProjectMetadata(input.project) },
    recipientUserIds: await getFeedbackOrdinaryNotificationRecipients({
      createdBy: input.createdBy,
      feedbackId: input.feedbackId,
      includeCommentParticipants: true,
      ownerUserId: input.ownerUserId,
      teamId: input.teamId,
    }),
    targetHref: feedbackTargetHref(input.feedbackId),
    targetId: input.feedbackId,
    targetType: "feedback",
    teamId: input.teamId,
    title: feedbackStatusNotificationTitle(input.status),
  });
}

async function notifyFeedbackAssigned(input: {
  actorName: string;
  actorUserId: string;
  feedbackId: string;
  nextOwnerName: string;
  nextOwnerUserId: string;
  previousOwnerName: string;
  previousOwnerUserId: string;
  teamId: string;
  title: string;
}) {
  await publishNotificationEvent({
    actorName: input.actorName,
    actorUserId: input.actorUserId,
    body: `${input.actorName} 将反馈「${input.title}」的处理人从 ${input.previousOwnerName} 调整为 ${input.nextOwnerName}。`,
    kind: "feedback.assigned",
    metadata: {
      feedbackTitle: input.title,
      nextOwner: input.nextOwnerName,
      previousOwner: input.previousOwnerName,
    },
    recipientUserIds: await getFeedbackAssignmentNotificationRecipients({
      nextOwnerUserId: input.nextOwnerUserId,
      previousOwnerUserId: input.previousOwnerUserId,
      teamId: input.teamId,
    }),
    targetHref: feedbackTargetHref(input.feedbackId),
    targetId: input.feedbackId,
    targetType: "feedback",
    teamId: input.teamId,
    title: "反馈处理人已更新",
  });
}

export async function createFeedback(input: CreateFeedbackInput, actor: CreateFeedbackActor): Promise<CreateFeedbackOutcome> {
  const teamId = actor.scope ? runtimeScopeStorageId(actor.scope) : "";
  if (!teamId) {
    return { status: "notFound" };
  }
  const initialBody = input.initialBody.trim();
  if (!initialBody) {
    return { status: "invalid" };
  }

  const ownerUser = await resolveActiveMemberById(teamId, input.ownerUserId);
  if (!ownerUser) {
    return { status: "invalidOwner" };
  }
  const projectId = input.projectId?.trim() || null;
  const project = projectId ? await resolveProjectById(teamId, projectId) : null;
  if (projectId && !project) {
    return { status: "invalidProject" };
  }

  const id = makeFeedbackId();
  const commentThreadId = makeCommentId("cthread");
  const commentMessageId = makeCommentId("cmsg");
  const date = today();
  const createdAt = nowIso();
  const preparedUploads: Array<{ clientId: string; prepared: PreparedCommentAttachment }> = [];
  try {
    for (const attachment of input.attachments ?? []) {
      const prepared = await prepareCommentAttachment({
        body: attachment.body,
        createdAt,
        createdBy: actor.id,
        fileName: attachment.fileName,
        messageId: commentMessageId,
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

    const initialComment = buildInitialCommentBody({ body: initialBody, uploads: preparedUploads });
    if (initialComment.status !== "ok") {
      await deleteStoredCommentAttachmentObjects(preparedUploads.map((upload) => upload.prepared.row));
      return { status: "invalid" };
    }

    await db.transaction(async (tx) => {
      await tx.insert(feedback).values({
        id,
        teamId,
        projectId,
        phenomenon: input.phenomenon,
        impact: input.impact,
        suggestedAdjustment: "",
        status: "Open",
        owner: ownerUser.name,
        ownerUserId: ownerUser.id,
        createdAt: date,
        updatedAt: date,
        createdBy: actor.id,
        updatedBy: actor.id,
      });

      await tx.insert(feedbackActivityEvents).values({
        id: makeActivityId(),
        teamId,
        feedbackId: id,
        actorUserId: actor.id,
        actorName: actor.name,
        action: "创建了反馈",
        metadata: {},
        createdAt,
      });

      const categories = input.causeCategories.map((category, index) => ({ feedbackId: id, category, sortOrder: index }));
      if (categories.length > 0) {
        await tx.insert(feedbackCauseCategories).values(categories);
      }

      await tx.insert(commentThreads).values({
        id: commentThreadId,
        teamId,
        targetType: "feedback",
        targetId: id,
        targetTitle: input.phenomenon,
        status: "open",
        createdBy: actor.id,
        createdAt,
        updatedAt: createdAt,
      });

      await tx.insert(commentMessages).values({
        id: commentMessageId,
        threadId: commentThreadId,
        authorUserId: actor.id,
        author: actor.name,
        body: initialComment.body,
        createdAt,
        parentMessageId: null,
        replyToMessageId: null,
        replyToAuthor: null,
        sortOrder: 0,
      });

      if (preparedUploads.length > 0) {
        await tx.insert(commentAttachments).values(preparedUploads.map((upload) => upload.prepared.row));
      }
    });
  } catch (error) {
    await deleteStoredCommentAttachmentObjects(preparedUploads.map((upload) => upload.prepared.row));
    throw error;
  }

  await notifyFeedbackCreated({
    actorName: actor.name,
    actorUserId: actor.id,
    feedbackId: id,
    ownerName: ownerUser.name,
    ownerUserId: ownerUser.id,
    project,
    teamId,
    title: input.phenomenon,
  });

  publishOrfDataInvalidation({
    actorUserId: actor.id,
    models: ["taskManagement"],
    reason: "feedback.changed",
    target: { id, type: "feedback" },
    teamId,
  });

  const data = await getOrfStateSnapshot({ scope: runtimeScope(teamId) });
  const item = data.feedback.find((entry) => entry.id === id);
  return item ? { status: "ok", feedback: item } : { status: "notFound" };
}

export async function updateFeedbackMetadata(
  feedbackId: string,
  input: UpdateFeedbackMetadataInput,
  actor: FeedbackStatusActor,
): Promise<FeedbackMetadataUpdateResult> {
  const storageScopeId = actor.scope ? runtimeScopeStorageId(actor.scope) : "";
  if (!storageScopeId) {
    return { status: "notFound" };
  }

  const nextPhenomenon = input.phenomenon === undefined ? undefined : input.phenomenon.trim();
  if (nextPhenomenon !== undefined && !nextPhenomenon) {
    return { status: "invalid" };
  }

  const nextCauseCategories = normalizeCauseCategories(input.causeCategories);
  if (nextCauseCategories && nextCauseCategories.length === 0) {
    return { status: "invalid" };
  }

  const nextOwnerUser = input.ownerUserId === undefined
    ? undefined
    : await resolveActiveMemberById(storageScopeId, input.ownerUserId);
  if (input.ownerUserId !== undefined && !nextOwnerUser) {
    return { status: "invalidOwner" };
  }

  const nextProjectId = input.projectId === undefined ? undefined : input.projectId?.trim() || null;
  if (nextProjectId && !(await resolveProjectById(storageScopeId, nextProjectId))) {
    return { status: "invalidProject" };
  }

  const updateResult = await db.transaction(async (tx): Promise<
    | FeedbackMetadataUpdateError
    | {
        status: "ok";
        assigned: null | {
          nextOwnerName: string;
          nextOwnerUserId: string;
          previousOwnerName: string;
          previousOwnerUserId: string;
          title: string;
        };
        changed: boolean;
        teamId: string;
      }
  > => {
    const [target] = await tx
      .select({
        createdBy: feedback.createdBy,
        id: feedback.id,
        impact: feedback.impact,
        owner: feedback.owner,
        ownerUserId: feedback.ownerUserId,
        phenomenon: feedback.phenomenon,
        projectId: feedback.projectId,
        status: feedback.status,
        teamId: feedback.teamId,
      })
      .from(feedback)
      .where(eq(feedback.id, feedbackId))
      .limit(1)
      .for("update");

    if (!target || target.teamId !== storageScopeId) {
      return { status: "notFound" };
    }
    if (!canManageFeedbackMetadata(target, actor)) {
      return { status: "forbidden" };
    }

    const causeRows = await tx
      .select({
        category: feedbackCauseCategories.category,
        sortOrder: feedbackCauseCategories.sortOrder,
      })
      .from(feedbackCauseCategories)
      .where(eq(feedbackCauseCategories.feedbackId, feedbackId));
    const currentCauseCategories = causeRows
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((row) => row.category);
    const changedFields: string[] = [];
    const feedbackPatch: Partial<typeof feedback.$inferInsert> = {};
    const metadata: Record<string, unknown> = {};

    if (nextPhenomenon !== undefined && nextPhenomenon !== target.phenomenon) {
      feedbackPatch.phenomenon = nextPhenomenon;
      changedFields.push("phenomenon");
      metadata.previousPhenomenon = target.phenomenon;
      metadata.nextPhenomenon = nextPhenomenon;
    }
    if (input.impact !== undefined && input.impact !== target.impact) {
      feedbackPatch.impact = input.impact;
      changedFields.push("impact");
      metadata.previousImpact = target.impact;
      metadata.nextImpact = input.impact;
    }
    if (nextOwnerUser && nextOwnerUser.id !== target.ownerUserId) {
      feedbackPatch.owner = nextOwnerUser.name;
      feedbackPatch.ownerUserId = nextOwnerUser.id;
      changedFields.push("ownerUserId");
      metadata.previousOwnerUserId = target.ownerUserId;
      metadata.previousOwner = target.owner;
      metadata.nextOwnerUserId = nextOwnerUser.id;
      metadata.nextOwner = nextOwnerUser.name;
    }
    if (nextProjectId !== undefined && nextProjectId !== (target.projectId ?? null)) {
      feedbackPatch.projectId = nextProjectId;
      changedFields.push("projectId");
      metadata.previousProjectId = target.projectId ?? null;
      metadata.nextProjectId = nextProjectId;
    }

    const causeCategoriesChanged = Boolean(nextCauseCategories && !sameStringList(currentCauseCategories, nextCauseCategories));
    if (causeCategoriesChanged && nextCauseCategories) {
      changedFields.push("causeCategories");
      metadata.previousCauseCategories = currentCauseCategories;
      metadata.nextCauseCategories = nextCauseCategories;
      await tx.delete(feedbackCauseCategories).where(eq(feedbackCauseCategories.feedbackId, feedbackId));
      await tx.insert(feedbackCauseCategories).values(
        nextCauseCategories.map((category, index) => ({ feedbackId, category, sortOrder: index })),
      );
    }

    if (changedFields.length === 0) {
      return { status: "ok", assigned: null, changed: false, teamId: target.teamId };
    }

    const titleAfterUpdate = nextPhenomenon ?? target.phenomenon;
    await tx
      .update(feedback)
      .set({
        ...feedbackPatch,
        updatedAt: today(),
        updatedBy: actor.id,
      })
      .where(and(eq(feedback.id, feedbackId), eq(feedback.teamId, storageScopeId)));
    if (nextPhenomenon !== undefined) {
      await tx
        .update(commentThreads)
        .set({ targetTitle: nextPhenomenon, updatedAt: nowIso() })
        .where(and(eq(commentThreads.teamId, storageScopeId), eq(commentThreads.targetType, "feedback"), eq(commentThreads.targetId, feedbackId)));
    }
    await tx.insert(feedbackActivityEvents).values({
      id: makeActivityId(),
      teamId: target.teamId,
      feedbackId,
      actorUserId: actor.id,
      actorName: actor.name,
      action: metadataActivityAction(changedFields),
      metadata,
      createdAt: nowIso(),
    });

    return {
      status: "ok",
      assigned: nextOwnerUser && nextOwnerUser.id !== target.ownerUserId
        ? {
            nextOwnerName: nextOwnerUser.name,
            nextOwnerUserId: nextOwnerUser.id,
            previousOwnerName: target.owner,
            previousOwnerUserId: target.ownerUserId,
            title: titleAfterUpdate,
          }
        : null,
      changed: true,
      teamId: target.teamId,
    };
  });

  if (updateResult.status !== "ok") {
    return updateResult;
  }

  if (updateResult.assigned) {
    await notifyFeedbackAssigned({
      actorName: actor.name,
      actorUserId: actor.id,
      feedbackId,
      nextOwnerName: updateResult.assigned.nextOwnerName,
      nextOwnerUserId: updateResult.assigned.nextOwnerUserId,
      previousOwnerName: updateResult.assigned.previousOwnerName,
      previousOwnerUserId: updateResult.assigned.previousOwnerUserId,
      teamId: updateResult.teamId,
      title: updateResult.assigned.title,
    });
  }

  if (updateResult.changed) {
    publishOrfDataInvalidation({
      actorUserId: actor.id,
      models: ["taskManagement"],
      reason: "feedback.changed",
      target: { id: feedbackId, type: "feedback" },
      teamId: updateResult.teamId,
    });
  }
  return { status: "ok" };
}

export async function getFeedbackReferences(feedbackIds: readonly string[], scope: RuntimeScope): Promise<FeedbackReference[]> {
  const teamId = runtimeScopeStorageId(scope);
  const ids = uniqueFeedbackIds(feedbackIds);
  if (!teamId || ids.length === 0) return [];

  const rows = await db
    .select({
      id: feedback.id,
      phenomenon: feedback.phenomenon,
    })
    .from(feedback)
    .where(and(eq(feedback.teamId, teamId), inArray(feedback.id, ids)));

  const sortOrder = new Map(ids.map((id, index) => [id, index]));
  return rows.sort((left, right) => (sortOrder.get(left.id) ?? 0) - (sortOrder.get(right.id) ?? 0));
}

export async function updateFeedbackStatus(
  feedbackId: string,
  status: FeedbackStatus,
  actor: FeedbackStatusActor,
): Promise<FeedbackStatusUpdateResult> {
  const storageScopeId = actor.scope ? runtimeScopeStorageId(actor.scope) : "";
  const [target] = await db
    .select({
      createdBy: feedback.createdBy,
      id: feedback.id,
      ownerUserId: feedback.ownerUserId,
      projectId: feedback.projectId,
      projectName: projects.name,
      status: feedback.status,
      teamId: feedback.teamId,
      title: feedback.phenomenon,
    })
    .from(feedback)
    .leftJoin(projects, eq(projects.id, feedback.projectId))
    .where(eq(feedback.id, feedbackId))
    .limit(1);

  if (!target) {
    return { status: "notFound" };
  }

  if (storageScopeId && target.teamId !== storageScopeId) {
    return { status: "notFound" };
  }

  if (!canManageFeedbackStatus(target, actor)) {
    return { status: "forbidden" };
  }

  const updated = await db.transaction(async (tx) => {
    const rows = await tx
      .update(feedback)
      .set({ status, updatedAt: today(), updatedBy: actor.id })
      .where(eq(feedback.id, feedbackId))
      .returning({ id: feedback.id });
    if (rows.length > 0 && target.status !== status) {
      await tx.insert(feedbackActivityEvents).values({
        id: makeActivityId(),
        teamId: target.teamId,
        feedbackId,
        actorUserId: actor.id,
        actorName: actor.name,
        action: status === "Closed" ? "关闭了反馈" : "重新打开了反馈",
        metadata: { status },
        createdAt: nowIso(),
      });
    }
    return rows;
  });
  if (updated.length === 0) {
    return { status: "notFound" };
  }

  if (target.status !== status) {
    await notifyFeedbackStatusChanged({
      actorName: actor.name,
      actorUserId: actor.id,
      createdBy: target.createdBy,
      feedbackId,
      ownerUserId: target.ownerUserId,
      project: target.projectId && target.projectName ? { id: target.projectId, name: target.projectName } : null,
      status,
      teamId: target.teamId,
      title: target.title,
    });
  }

  publishOrfDataInvalidation({
    actorUserId: actor.id,
    models: ["taskManagement"],
    reason: "feedback.changed",
    target: { id: feedbackId, type: "feedback" },
    teamId: target.teamId,
  });
  return { status: "ok" };
}
