import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { FeedbackSubscriptionMode } from "../contracts";
import { feedback, feedbackParticipants, feedbackSubscriptions } from "../infrastructure/database/schema";
import {
  feedbackNotificationRecipient,
  mergeFeedbackNotificationDispatchRecipients,
  type FeedbackNotificationDispatchRecipient,
} from "./notificationDispatch";

export type ExplicitFeedbackSubscriptionMode = "subscribed" | "muted";
export type FeedbackSubscriptionMutationMode = ExplicitFeedbackSubscriptionMode | "none";
export type FeedbackSubscriptionActor = { id: string; teamId?: string | null };
export type FeedbackSubscriptionResult =
  | { status: "ok"; mode: FeedbackSubscriptionMode }
  | { status: "notFound" }
  | { status: "invalid" };

export type FeedbackSubscriptionDatabase = Pick<NodePgDatabase<any>, "delete" | "insert" | "select">;

export type FeedbackNotificationRecipientDirectory = {
  getActiveAdminUserIds(teamId: string): Promise<string[]>;
  getActiveMemberUserIdsByIds(teamId: string, userIds: string[]): Promise<string[]>;
};

function nowIso() {
  return new Date().toISOString();
}

function uniqueUserIds(userIds: Array<string | null | undefined>) {
  const normalized = userIds.map((userId) => userId?.trim()).filter((userId): userId is string => Boolean(userId));
  return Array.from(new Set(normalized));
}

async function feedbackExistsInScope(
  database: FeedbackSubscriptionDatabase,
  feedbackId: string,
  storageScopeId: string,
) {
  const [target] = await database
    .select({ id: feedback.id, teamId: feedback.teamId })
    .from(feedback)
    .where(eq(feedback.id, feedbackId))
    .limit(1);
  return target && target.teamId === storageScopeId ? target : null;
}

async function getFeedbackParticipantUserIds(
  database: FeedbackSubscriptionDatabase,
  teamId: string,
  feedbackId: string,
) {
  const rows = await database
    .select({ userId: feedbackParticipants.userId })
    .from(feedbackParticipants)
    .where(and(eq(feedbackParticipants.teamId, teamId), eq(feedbackParticipants.feedbackId, feedbackId)));
  return uniqueUserIds(rows.map((row) => row.userId));
}

async function getFeedbackSubscriptionRows(
  database: FeedbackSubscriptionDatabase,
  teamId: string,
  feedbackId: string,
) {
  return database
    .select({
      mode: feedbackSubscriptions.mode,
      userId: feedbackSubscriptions.userId,
    })
    .from(feedbackSubscriptions)
    .where(and(eq(feedbackSubscriptions.teamId, teamId), eq(feedbackSubscriptions.feedbackId, feedbackId)));
}

function presentRecipients(
  recipients: Array<FeedbackNotificationDispatchRecipient | null>,
) {
  return mergeFeedbackNotificationDispatchRecipients(
    recipients.filter((recipient): recipient is FeedbackNotificationDispatchRecipient => Boolean(recipient)),
  );
}

export async function getFeedbackOrdinaryNotificationDispatchRecipients(
  database: FeedbackSubscriptionDatabase,
  directory: FeedbackNotificationRecipientDirectory,
  input: {
    createdBy?: string | null;
    feedbackId: string;
    includeCommentParticipants: boolean;
    assigneeUserId?: string | null;
    teamId: string;
  },
) {
  const [commentParticipantUserIds, subscriptionRows] = await Promise.all([
    input.includeCommentParticipants
      ? getFeedbackParticipantUserIds(database, input.teamId, input.feedbackId)
      : Promise.resolve([]),
    getFeedbackSubscriptionRows(database, input.teamId, input.feedbackId),
  ]);
  const mutedUserIds = new Set(
    subscriptionRows
      .filter((row) => row.mode === "muted")
      .map((row) => row.userId),
  );
  const subscribedUserIds = subscriptionRows
    .filter((row) => row.mode === "subscribed")
    .map((row) => row.userId);

  const relatedCandidates = [
    ...uniqueUserIds([input.createdBy]).map((userId) => ({ userId, reason: "creator" as const })),
    ...uniqueUserIds([input.assigneeUserId]).map((userId) => ({ userId, reason: "assignee" as const })),
    ...commentParticipantUserIds.map((userId) => ({ userId, reason: "participant" as const })),
    ...subscribedUserIds.map((userId) => ({ userId, reason: "follower" as const })),
  ];
  const [adminUserIds, activeRelatedUserIds] = await Promise.all([
    directory.getActiveAdminUserIds(input.teamId),
    directory.getActiveMemberUserIdsByIds(input.teamId, relatedCandidates.map((candidate) => candidate.userId)),
  ]);
  const activeRelatedUserIdSet = new Set(activeRelatedUserIds);

  return presentRecipients([
    ...adminUserIds.map((userId) => feedbackNotificationRecipient({
      deliveryClass: "mandatory",
      reasons: ["administrator"],
      userId,
    })),
    ...relatedCandidates
      .filter((candidate) => activeRelatedUserIdSet.has(candidate.userId))
      .map((candidate) => feedbackNotificationRecipient({
        deliveryClass: "ordinary",
        muted: mutedUserIds.has(candidate.userId),
        reasons: [candidate.reason],
        userId: candidate.userId,
      })),
  ]);
}

export async function getFeedbackAssignmentNotificationDispatchRecipients(
  database: FeedbackSubscriptionDatabase,
  directory: FeedbackNotificationRecipientDirectory,
  input: {
    createdBy?: string | null;
    feedbackId: string;
    nextAssigneeUserId?: string | null;
    previousAssigneeUserId?: string | null;
    teamId: string;
  },
) {
  const [ordinaryRecipients, activePreviousAssigneeUserIds, activeNextAssigneeUserIds] = await Promise.all([
    getFeedbackOrdinaryNotificationDispatchRecipients(database, directory, {
      assigneeUserId: input.nextAssigneeUserId,
      createdBy: input.createdBy,
      feedbackId: input.feedbackId,
      includeCommentParticipants: true,
      teamId: input.teamId,
    }),
    directory.getActiveMemberUserIdsByIds(input.teamId, uniqueUserIds([input.previousAssigneeUserId])),
    directory.getActiveMemberUserIdsByIds(input.teamId, uniqueUserIds([input.nextAssigneeUserId])),
  ]);

  return presentRecipients([
    ...ordinaryRecipients,
    ...activePreviousAssigneeUserIds.map((userId) => feedbackNotificationRecipient({
      deliveryClass: "ordinary",
      reasons: ["previous_assignee"],
      userId,
    })),
    ...activeNextAssigneeUserIds.map((userId) => feedbackNotificationRecipient({
      attentionLevel: "action_required",
      deliveryClass: "direct",
      reasons: ["assignee", "action_required"],
      userId,
    })),
  ]);
}

export async function getFeedbackSubscriptionMode(
  database: FeedbackSubscriptionDatabase,
  feedbackId: string,
  actor: FeedbackSubscriptionActor,
): Promise<FeedbackSubscriptionResult> {
  const storageScopeId = actor.teamId?.trim() ?? "";
  if (!storageScopeId) return { status: "notFound" };
  const target = await feedbackExistsInScope(database, feedbackId, storageScopeId);
  if (!target) return { status: "notFound" };

  const [subscription] = await database
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

  const [item] = await database
    .select({
      createdBy: feedback.createdBy,
      assigneeUserId: feedback.assigneeUserId,
    })
    .from(feedback)
    .where(and(eq(feedback.teamId, storageScopeId), eq(feedback.id, feedbackId)))
    .limit(1);
  const participantUserIds = new Set([
    ...uniqueUserIds([item?.createdBy, item?.assigneeUserId]),
    ...(await getFeedbackParticipantUserIds(database, storageScopeId, feedbackId)),
  ]);
  return { status: "ok", mode: participantUserIds.has(actor.id) ? "participating" : "none" };
}

export async function setFeedbackSubscriptionMode(
  database: FeedbackSubscriptionDatabase,
  feedbackId: string,
  mode: FeedbackSubscriptionMutationMode,
  actor: FeedbackSubscriptionActor,
): Promise<FeedbackSubscriptionResult> {
  const storageScopeId = actor.teamId?.trim() ?? "";
  if (!storageScopeId) return { status: "notFound" };
  if (!["none", "subscribed", "muted"].includes(mode)) return { status: "invalid" };

  const target = await feedbackExistsInScope(database, feedbackId, storageScopeId);
  if (!target) return { status: "notFound" };

  if (mode === "none") {
    await database
      .delete(feedbackSubscriptions)
      .where(
        and(
          eq(feedbackSubscriptions.teamId, storageScopeId),
          eq(feedbackSubscriptions.feedbackId, feedbackId),
          eq(feedbackSubscriptions.userId, actor.id),
        ),
      );
    return getFeedbackSubscriptionMode(database, feedbackId, actor);
  }

  const updatedAt = nowIso();
  await database
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
  return getFeedbackSubscriptionMode(database, feedbackId, actor);
}
