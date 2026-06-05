import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Feedback, FeedbackStatus } from "../../src/types/orf";
import { localDateString } from "../../src/utils/date";
import { db } from "../db/client";
import { commentMessages, commentThreads, feedback, feedbackCauseCategories } from "../db/schema";
import { publishOrfDataInvalidation } from "../realtime/orfReadModelInvalidations";
import { getOrfStateSnapshot } from "../readModels/orfTaskManagementReadModel";
import {
  createNotifications,
  getActiveAdminNotificationRecipients,
  getActiveMemberNotificationRecipientsByIds,
} from "./notificationRepository";
import { runtimeScope, runtimeScopeStorageId, type RuntimeScope } from "./runtimeScope";
import { getScopedUsers } from "./userRepository";

export type CreateFeedbackInput = Pick<
  Feedback,
  "phenomenon" | "causeCategories" | "impact" | "suggestedAdjustment" | "owner"
>;
export type CreateFeedbackActor = { id: string; name: string; scope?: RuntimeScope | null };
export type CreateFeedbackOutcome =
  | { status: "ok"; feedback: Feedback }
  | { status: "notFound" }
  | { status: "invalidOwner" };
export type FeedbackStatusActor = { id: string; name: string; role: "admin" | "member"; scope?: RuntimeScope | null };
export type FeedbackStatusUpdateResult = { status: "ok" } | { status: "notFound" } | { status: "forbidden" };

const today = () => localDateString(new Date());
let feedbackIdCounter = 0;

function nextFeedbackIdCounter() {
  feedbackIdCounter = (feedbackIdCounter + 1) % Number.MAX_SAFE_INTEGER;
  return feedbackIdCounter.toString(36);
}

function makeFeedbackId() {
  return `fb-${Date.now()}-${nextFeedbackIdCounter()}-${randomUUID()}`;
}

async function resolveActiveMemberByName(storageScopeId: string, memberName: string) {
  const normalizedName = memberName.trim();
  if (!normalizedName) {
    return null;
  }

  const scopedUsers = await getScopedUsers(runtimeScope(storageScopeId));
  const member = scopedUsers.find((user) => user.status === "active" && user.name === normalizedName);
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

function feedbackTargetHref(feedbackId: string) {
  return `/feedback/${encodeURIComponent(feedbackId)}`;
}

function feedbackStatusNotificationTitle(status: FeedbackStatus) {
  return status === "Closed" ? "反馈已关闭" : "反馈已重新打开";
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
  await createNotifications({
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
  await createNotifications({
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

  const owner = input.owner.trim();
  const ownerUser = await resolveActiveMemberByName(teamId, owner);
  if (!ownerUser) {
    return { status: "invalidOwner" };
  }

  const id = makeFeedbackId();
  const now = today();
  await db.transaction(async (tx) => {
    await tx.insert(feedback).values({
      id,
      teamId,
      phenomenon: input.phenomenon,
      impact: input.impact,
      suggestedAdjustment: input.suggestedAdjustment,
      status: "Open",
      owner: ownerUser.name,
      ownerUserId: ownerUser.id,
      createdAt: now,
      updatedAt: now,
      createdBy: actor.id,
      updatedBy: actor.id,
    });

    const categories = input.causeCategories.map((category, index) => ({ feedbackId: id, category, sortOrder: index }));
    if (categories.length > 0) {
      await tx.insert(feedbackCauseCategories).values(categories);
    }
  });

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
