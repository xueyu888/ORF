import { and, eq, or } from "drizzle-orm";
import { feedback } from "../../modules/feedback/src/infrastructure/database/schema";
import { db } from "../db/client";
import { runtimeScope, type RuntimeScope } from "./runtimeScope";

type FeedbackReferenceSelectClient = Pick<typeof db, "select">;

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

function storageScope(id: string | null | undefined): RuntimeScope | null {
  const storageId = id?.trim();
  return storageId ? runtimeScope(storageId) : null;
}

export async function resolveRuntimeScopeForFeedback(feedbackId: string): Promise<RuntimeScope | null> {
  const [target] = await db.select({ teamId: feedback.teamId }).from(feedback).where(eq(feedback.id, feedbackId)).limit(1);
  return storageScope(target?.teamId);
}

export async function hasFeedbackLinkedToProject(
  input: { readonly projectId: string; readonly storageScopeId: string },
  client: FeedbackReferenceSelectClient = db,
) {
  const [target] = await client
    .select({ id: feedback.id })
    .from(feedback)
    .where(and(eq(feedback.teamId, input.storageScopeId), eq(feedback.projectId, input.projectId)))
    .limit(1);
  return Boolean(target);
}

export async function hasFeedbackUserReference(input: {
  readonly storageScopeId: string;
  readonly userId: string;
}) {
  const [target] = await db
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
  feedbackId: string,
  client: FeedbackReferenceSelectClient = db,
): Promise<FeedbackCommentTargetReference | null> {
  const [target] = await client
    .select({ feedbackId: feedback.id, teamId: feedback.teamId, title: feedback.title })
    .from(feedback)
    .where(eq(feedback.id, feedbackId))
    .limit(1);
  return target ? { feedbackId: target.feedbackId, storageScopeId: target.teamId, title: target.title } : null;
}

export async function lockFeedbackCommentTarget(
  feedbackId: string,
  client: FeedbackReferenceSelectClient,
) {
  const [target] = await client
    .select({ id: feedback.id })
    .from(feedback)
    .where(eq(feedback.id, feedbackId))
    .limit(1)
    .for("update");
  return Boolean(target);
}

export async function getFeedbackCommentNotificationFacts(
  feedbackId: string,
): Promise<FeedbackCommentNotificationFacts | null> {
  const [target] = await db
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
