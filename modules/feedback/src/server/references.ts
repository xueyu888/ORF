import { and, eq, or } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { feedback } from "../infrastructure/database/schema";

export type FeedbackReferenceDatabase = Pick<NodePgDatabase<any>, "select">;

export type FeedbackCommentTargetReference = {
  readonly feedbackId: string;
  readonly storageScopeId: string;
  readonly title: string;
};

export type FeedbackCommentNotificationFacts = {
  readonly assigneeUserId: string | null;
  readonly createdBy: string;
  readonly projectId: string | null;
  readonly teamId: string;
};

export async function findFeedbackTeamId(
  database: FeedbackReferenceDatabase,
  feedbackId: string,
): Promise<string | null> {
  const [target] = await database.select({ teamId: feedback.teamId }).from(feedback).where(eq(feedback.id, feedbackId)).limit(1);
  return target?.teamId ?? null;
}

export async function hasFeedbackLinkedToProject(
  database: FeedbackReferenceDatabase,
  input: { readonly projectId: string; readonly storageScopeId: string },
) {
  const [target] = await database
    .select({ id: feedback.id })
    .from(feedback)
    .where(and(eq(feedback.teamId, input.storageScopeId), eq(feedback.projectId, input.projectId)))
    .limit(1);
  return Boolean(target);
}

export async function hasFeedbackUserReference(
  database: FeedbackReferenceDatabase,
  input: {
    readonly storageScopeId: string;
    readonly userId: string;
  },
) {
  const [target] = await database
    .select({ id: feedback.id })
    .from(feedback)
    .where(and(
      eq(feedback.teamId, input.storageScopeId),
      or(
        eq(feedback.createdBy, input.userId),
        eq(feedback.updatedBy, input.userId),
        eq(feedback.assigneeUserId, input.userId),
      ),
    ))
    .limit(1);
  return Boolean(target);
}

export async function resolveFeedbackCommentTarget(
  database: FeedbackReferenceDatabase,
  feedbackId: string,
): Promise<FeedbackCommentTargetReference | null> {
  const [target] = await database
    .select({ feedbackId: feedback.id, teamId: feedback.teamId, title: feedback.title })
    .from(feedback)
    .where(eq(feedback.id, feedbackId))
    .limit(1);
  return target ? { feedbackId: target.feedbackId, storageScopeId: target.teamId, title: target.title } : null;
}

export async function lockFeedbackCommentTarget(
  database: FeedbackReferenceDatabase,
  feedbackId: string,
) {
  const [target] = await database
    .select({ id: feedback.id })
    .from(feedback)
    .where(eq(feedback.id, feedbackId))
    .limit(1)
    .for("update");
  return Boolean(target);
}

export async function getFeedbackCommentNotificationFacts(
  database: FeedbackReferenceDatabase,
  feedbackId: string,
): Promise<FeedbackCommentNotificationFacts | null> {
  const [target] = await database
    .select({
      assigneeUserId: feedback.assigneeUserId,
      createdBy: feedback.createdBy,
      projectId: feedback.projectId,
      teamId: feedback.teamId,
    })
    .from(feedback)
    .where(eq(feedback.id, feedbackId))
    .limit(1);
  return target ?? null;
}
