import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  feedback,
  feedbackActivityEvents,
  feedbackUserViews,
} from "../infrastructure/database/schema";
import { feedbackNowIso, makeFeedbackActivityId } from "./ids";
import { upsertFeedbackParticipants } from "./participants";

export type FeedbackActivityDatabase = Pick<NodePgDatabase<any>, "insert" | "select">;

export type FeedbackViewedInput = {
  readonly actorStatus: "active" | "inactive";
  readonly actorUserId: string;
  readonly feedbackId: string;
  readonly seenThroughSequence: number;
  readonly teamId: string;
};

export type FeedbackViewedResult =
  | { status: "ok"; changed: boolean }
  | { status: "notFound" }
  | { status: "invalid" }
  | { status: "forbidden" };

export type FeedbackCommentCreatedActivityInput = {
  readonly actorUserId: string;
  readonly commentMessageId: string;
  readonly feedbackId: string;
  readonly teamId: string;
};

export async function recordFeedbackCommentCreatedActivity(
  database: FeedbackActivityDatabase,
  input: FeedbackCommentCreatedActivityInput,
) {
  const occurredAt = feedbackNowIso();
  await upsertFeedbackParticipants(database, {
    feedbackId: input.feedbackId,
    participatedAt: occurredAt,
    teamId: input.teamId,
    userIds: [input.actorUserId],
  });
  await database.insert(feedbackActivityEvents).values({
    id: makeFeedbackActivityId(),
    teamId: input.teamId,
    feedbackId: input.feedbackId,
    actorUserId: input.actorUserId,
    activityType: "feedback.comment.created",
    payload: { commentMessageId: input.commentMessageId },
    createdAt: occurredAt,
  });
}

export async function markFeedbackViewed(
  database: FeedbackActivityDatabase,
  input: FeedbackViewedInput,
): Promise<FeedbackViewedResult> {
  const teamId = input.teamId.trim();
  const actorUserId = input.actorUserId.trim();
  if (!teamId || !actorUserId) return { status: "notFound" };
  if (input.actorStatus !== "active") return { status: "forbidden" };
  if (!Number.isInteger(input.seenThroughSequence) || input.seenThroughSequence < 0) return { status: "invalid" };

  const [target] = await database
    .select({ id: feedback.id, teamId: feedback.teamId })
    .from(feedback)
    .where(eq(feedback.id, input.feedbackId))
    .limit(1);
  if (!target || target.teamId !== teamId) return { status: "notFound" };

  const [activityCursor] = await database
    .select({ lastSequence: sql<number>`coalesce(max(${feedbackActivityEvents.sequence}), 0)` })
    .from(feedbackActivityEvents)
    .where(and(eq(feedbackActivityEvents.teamId, teamId), eq(feedbackActivityEvents.feedbackId, input.feedbackId)))
    .limit(1);
  const lastActivitySequence = Number(activityCursor?.lastSequence ?? 0);
  if (input.seenThroughSequence > lastActivitySequence) return { status: "invalid" };

  const [current] = await database
    .select({ lastSeenSequence: feedbackUserViews.lastSeenSequence })
    .from(feedbackUserViews)
    .where(
      and(
        eq(feedbackUserViews.teamId, teamId),
        eq(feedbackUserViews.feedbackId, input.feedbackId),
        eq(feedbackUserViews.userId, actorUserId),
      ),
    )
    .limit(1);
  if ((current?.lastSeenSequence ?? 0) >= input.seenThroughSequence) {
    return { status: "ok", changed: false };
  }

  const updatedAt = feedbackNowIso();
  await database
    .insert(feedbackUserViews)
    .values({
      teamId,
      feedbackId: input.feedbackId,
      userId: actorUserId,
      lastSeenSequence: input.seenThroughSequence,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: [feedbackUserViews.teamId, feedbackUserViews.feedbackId, feedbackUserViews.userId],
      set: {
        lastSeenSequence: sql`greatest(${feedbackUserViews.lastSeenSequence}, excluded.last_seen_sequence)`,
        updatedAt,
      },
    });

  return { status: "ok", changed: true };
}
