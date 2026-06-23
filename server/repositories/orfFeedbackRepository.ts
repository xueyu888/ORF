import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { replaceOrfAttachmentMarkdownTokens } from "../../src/features/rich-text/orfRichTextTokens";
import type { Feedback, FeedbackStatus, Impact } from "../../src/types/orf";
import { localDateString } from "../../src/utils/date";
import { db } from "../db/client";
import { commentAttachments, commentMessages, commentThreads, feedback, feedbackCauseCategories } from "../db/schema";
import { publishOrfDataInvalidation } from "../realtime/orfReadModelInvalidations";
import { getOrfStateSnapshot } from "../readModels/orfTaskManagementReadModel";
import {
  deleteStoredCommentAttachmentObjects,
  prepareCommentAttachment,
  type PreparedCommentAttachment,
} from "./commentAttachmentRepository";
import {
  getActiveAdminNotificationRecipients,
  getActiveMemberNotificationRecipientsByIds,
} from "./notificationRepository";
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
  | { status: "tooLarge" };
export type FeedbackStatusActor = { id: string; name: string; role: "admin" | "member"; scope?: RuntimeScope | null };
export type FeedbackStatusUpdateResult = { status: "ok" } | { status: "notFound" } | { status: "forbidden" };
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

async function resolveActiveMemberById(storageScopeId: string, userId: string) {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) {
    return null;
  }

  const scopedUsers = await getScopedUsers(runtimeScope(storageScopeId));
  const member = scopedUsers.find((user) => user.status === "active" && user.id === normalizedUserId);
  return member ? { id: member.id, name: member.name } : null;
}

function canManageFeedbackStatus(
  item: { ownerUserId: string | null; createdBy: string | null },
  actor: FeedbackStatusActor,
) {
  return actor.role === "admin" || item.createdBy === actor.id || item.ownerUserId === actor.id;
}

function uniqueUserIds(userIds: Array<string | null | undefined>) {
  const normalized = userIds.map((userId) => userId?.trim()).filter((userId): userId is string => Boolean(userId));
  return Array.from(new Set(normalized));
}

function uniqueFeedbackIds(feedbackIds: readonly string[]) {
  return Array.from(new Set(feedbackIds.map((feedbackId) => feedbackId.trim()).filter(Boolean))).slice(0, 100);
}

function feedbackTargetHref(feedbackId: string) {
  return `/feedback/${encodeURIComponent(feedbackId)}`;
}

function feedbackStatusNotificationTitle(status: FeedbackStatus) {
  return status === "Closed" ? "反馈已关闭" : "反馈已重新打开";
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

async function getFeedbackCommentParticipantUserIds(teamId: string, feedbackId: string) {
  const rows = await db
    .select({ authorUserId: commentMessages.authorUserId })
    .from(commentThreads)
    .innerJoin(commentMessages, eq(commentMessages.threadId, commentThreads.id))
    .where(
      and(
        eq(commentThreads.teamId, teamId),
        eq(commentThreads.targetType, "feedback"),
        eq(commentThreads.targetId, feedbackId),
      ),
    );
  return uniqueUserIds(rows.map((row) => row.authorUserId));
}

async function getFeedbackNotificationRecipients(input: {
  createdBy?: string | null;
  feedbackId: string;
  includeCommentParticipants: boolean;
  ownerUserId?: string | null;
  teamId: string;
}) {
  const commentParticipantUserIds = input.includeCommentParticipants
    ? await getFeedbackCommentParticipantUserIds(input.teamId, input.feedbackId)
    : [];
  const relevantMemberUserIds = uniqueUserIds([input.createdBy, input.ownerUserId, ...commentParticipantUserIds]);
  const [adminUserIds, activeRelevantUserIds] = await Promise.all([
    getActiveAdminNotificationRecipients(input.teamId),
    getActiveMemberNotificationRecipientsByIds(input.teamId, relevantMemberUserIds),
  ]);
  return uniqueUserIds([...adminUserIds, ...activeRelevantUserIds]);
}

async function notifyFeedbackCreated(input: {
  actorName: string;
  actorUserId: string;
  feedbackId: string;
  ownerName: string;
  ownerUserId: string;
  teamId: string;
  title: string;
}) {
  await publishNotificationEvent({
    actorName: input.actorName,
    actorUserId: input.actorUserId,
    body: `${input.actorName} 创建了反馈「${input.title}」，处理人：${input.ownerName}。`,
    kind: "feedback.created",
    metadata: { feedbackTitle: input.title, owner: input.ownerName },
    recipientUserIds: await getFeedbackNotificationRecipients({
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
  status: FeedbackStatus;
  teamId: string;
  title: string;
}) {
  const action = input.status === "Closed" ? "关闭" : "重新打开";
  await publishNotificationEvent({
    actorName: input.actorName,
    actorUserId: input.actorUserId,
    body: `${input.actorName} ${action}了反馈「${input.title}」。`,
    kind: "feedback.status.changed",
    metadata: { feedbackStatus: input.status, feedbackTitle: input.title },
    recipientUserIds: await getFeedbackNotificationRecipients({
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
      status: feedback.status,
      teamId: feedback.teamId,
      title: feedback.phenomenon,
    })
    .from(feedback)
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

  const updated = await db
    .update(feedback)
    .set({ status, updatedAt: today(), updatedBy: actor.id })
    .where(eq(feedback.id, feedbackId))
    .returning({ id: feedback.id });
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
