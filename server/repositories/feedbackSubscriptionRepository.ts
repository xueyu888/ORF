import { and, eq } from "drizzle-orm";
import type { FeedbackSubscriptionMode } from "../../src/types/orf";
import { feedback, feedbackParticipants, feedbackSubscriptions } from "../../modules/feedback/src/infrastructure/database/schema";
import { db } from "../db/client";
import {
  getActiveAdminNotificationRecipients,
  getActiveMemberNotificationRecipientsByIds,
} from "./notificationRepository";
import { runtimeScopeStorageId, type RuntimeScope } from "./runtimeScope";

export type ExplicitFeedbackSubscriptionMode = "subscribed" | "muted";
export type FeedbackSubscriptionMutationMode = ExplicitFeedbackSubscriptionMode | "none";
export type FeedbackSubscriptionActor = { id: string; scope?: RuntimeScope | null };
export type FeedbackSubscriptionResult =
  | { status: "ok"; mode: FeedbackSubscriptionMode }
  | { status: "notFound" }
  | { status: "invalid" };

function nowIso() {
  return new Date().toISOString();
}

function uniqueUserIds(userIds: Array<string | null | undefined>) {
  const normalized = userIds.map((userId) => userId?.trim()).filter((userId): userId is string => Boolean(userId));
  return Array.from(new Set(normalized));
}

async function feedbackExistsInScope(feedbackId: string, storageScopeId: string) {
  const [target] = await db
    .select({ id: feedback.id, teamId: feedback.teamId })
    .from(feedback)
    .where(eq(feedback.id, feedbackId))
    .limit(1);
  return target && target.teamId === storageScopeId ? target : null;
}

async function getFeedbackParticipantUserIds(teamId: string, feedbackId: string) {
  const rows = await db
    .select({ userId: feedbackParticipants.userId })
    .from(feedbackParticipants)
    .where(and(eq(feedbackParticipants.teamId, teamId), eq(feedbackParticipants.feedbackId, feedbackId)));
  return uniqueUserIds(rows.map((row) => row.userId));
}

async function getFeedbackSubscriptionRows(teamId: string, feedbackId: string) {
  return db
    .select({
      mode: feedbackSubscriptions.mode,
      userId: feedbackSubscriptions.userId,
    })
    .from(feedbackSubscriptions)
    .where(and(eq(feedbackSubscriptions.teamId, teamId), eq(feedbackSubscriptions.feedbackId, feedbackId)));
}

export async function getFeedbackOrdinaryNotificationRecipients(input: {
  createdBy?: string | null;
  feedbackId: string;
  includeCommentParticipants: boolean;
  assigneeUserId?: string | null;
  teamId: string;
}) {
  const [commentParticipantUserIds, subscriptionRows] = await Promise.all([
    input.includeCommentParticipants
      ? getFeedbackParticipantUserIds(input.teamId, input.feedbackId)
      : Promise.resolve([]),
    getFeedbackSubscriptionRows(input.teamId, input.feedbackId),
  ]);
  const mutedUserIds = new Set(
    subscriptionRows
      .filter((row) => row.mode === "muted")
      .map((row) => row.userId),
  );
  const subscribedUserIds = subscriptionRows
    .filter((row) => row.mode === "subscribed")
    .map((row) => row.userId);
  const relatedUserIds = uniqueUserIds([input.createdBy, input.assigneeUserId, ...commentParticipantUserIds]);
  const [adminUserIds, activeRelatedUserIds, activeSubscribedUserIds] = await Promise.all([
    getActiveAdminNotificationRecipients(input.teamId),
    getActiveMemberNotificationRecipientsByIds(input.teamId, relatedUserIds),
    getActiveMemberNotificationRecipientsByIds(input.teamId, subscribedUserIds),
  ]);

  return uniqueUserIds([...adminUserIds, ...activeRelatedUserIds, ...activeSubscribedUserIds]).filter(
    (userId) => !mutedUserIds.has(userId),
  );
}

export async function getFeedbackAssignmentNotificationRecipients(input: {
  nextAssigneeUserId?: string | null;
  previousAssigneeUserId?: string | null;
  teamId: string;
}) {
  const [adminUserIds, assigneeUserIds] = await Promise.all([
    getActiveAdminNotificationRecipients(input.teamId),
    getActiveMemberNotificationRecipientsByIds(
      input.teamId,
      uniqueUserIds([input.previousAssigneeUserId, input.nextAssigneeUserId]),
    ),
  ]);
  return uniqueUserIds([...adminUserIds, ...assigneeUserIds]);
}

export async function getFeedbackSubscriptionMode(
  feedbackId: string,
  actor: FeedbackSubscriptionActor,
): Promise<FeedbackSubscriptionResult> {
  const storageScopeId = actor.scope ? runtimeScopeStorageId(actor.scope) : "";
  if (!storageScopeId) return { status: "notFound" };
  const target = await feedbackExistsInScope(feedbackId, storageScopeId);
  if (!target) return { status: "notFound" };

  const [subscription] = await db
    .select({ mode: feedbackSubscriptions.mode })
    .from(feedbackSubscriptions)
    .where(
      and(
        eq(feedbackSubscriptions.teamId, storageScopeId),
        eq(feedbackSubscriptions.feedbackId, feedbackId),
        eq(feedbackSubscriptions.userId, actor.id),
      ),
    )
    .limit(1);
  if (subscription?.mode === "subscribed" || subscription?.mode === "muted") {
    return { status: "ok", mode: subscription.mode };
  }

  const [item] = await db
    .select({
      createdBy: feedback.createdBy,
      assigneeUserId: feedback.assigneeUserId,
    })
    .from(feedback)
    .where(and(eq(feedback.teamId, storageScopeId), eq(feedback.id, feedbackId)))
    .limit(1);
  const participantUserIds = new Set([
    ...uniqueUserIds([item?.createdBy, item?.assigneeUserId]),
    ...(await getFeedbackParticipantUserIds(storageScopeId, feedbackId)),
  ]);
  return { status: "ok", mode: participantUserIds.has(actor.id) ? "participating" : "none" };
}

export async function setFeedbackSubscriptionMode(
  feedbackId: string,
  mode: FeedbackSubscriptionMutationMode,
  actor: FeedbackSubscriptionActor,
): Promise<FeedbackSubscriptionResult> {
  const storageScopeId = actor.scope ? runtimeScopeStorageId(actor.scope) : "";
  if (!storageScopeId) return { status: "notFound" };
  if (!["none", "subscribed", "muted"].includes(mode)) return { status: "invalid" };

  const target = await feedbackExistsInScope(feedbackId, storageScopeId);
  if (!target) return { status: "notFound" };

  if (mode === "none") {
    await db
      .delete(feedbackSubscriptions)
      .where(
        and(
          eq(feedbackSubscriptions.teamId, storageScopeId),
          eq(feedbackSubscriptions.feedbackId, feedbackId),
          eq(feedbackSubscriptions.userId, actor.id),
        ),
      );
    return getFeedbackSubscriptionMode(feedbackId, actor);
  }

  const updatedAt = nowIso();
  await db
    .insert(feedbackSubscriptions)
    .values({
      teamId: storageScopeId,
      feedbackId,
      userId: actor.id,
      mode,
      createdAt: updatedAt,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: [feedbackSubscriptions.teamId, feedbackSubscriptions.feedbackId, feedbackSubscriptions.userId],
      set: {
        mode,
        updatedAt,
      },
    });
  return getFeedbackSubscriptionMode(feedbackId, actor);
}
