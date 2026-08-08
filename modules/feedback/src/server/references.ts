import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
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
  readonly title: string;
};

export type FeedbackReferenceSummary = {
  readonly id: string;
  readonly title: string;
};

function uniqueFeedbackIds(feedbackIds: readonly string[]) {
  return Array.from(new Set(feedbackIds.map((value) => value.trim()).filter(Boolean))).slice(0, 100);
}

function likePatternForSearch(value: string) {
  return `%${value.trim().replace(/[\\%_]/g, "\\$&")}%`;
}

export async function findFeedbackTeamId(
  database: FeedbackReferenceDatabase,
  feedbackId: string,
): Promise<string | null> {
  const [target] = await database.select({ teamId: feedback.teamId }).from(feedback).where(eq(feedback.id, feedbackId)).limit(1);
  return target?.teamId ?? null;
}

export async function getFeedbackReferences(
  database: FeedbackReferenceDatabase,
  input: { readonly feedbackIds: readonly string[]; readonly teamId: string },
): Promise<FeedbackReferenceSummary[]> {
  const teamId = input.teamId.trim();
  const ids = uniqueFeedbackIds(input.feedbackIds);
  if (!teamId || ids.length === 0) return [];

  const rows = await database
    .select({
      id: feedback.id,
      title: feedback.title,
    })
    .from(feedback)
    .where(and(eq(feedback.teamId, teamId), inArray(feedback.id, ids)));

  const sortOrder = new Map(ids.map((id, index) => [id, index]));
  return rows.sort((left, right) => (sortOrder.get(left.id) ?? 0) - (sortOrder.get(right.id) ?? 0));
}

export async function listFeedbackReferences(
  database: FeedbackReferenceDatabase,
  input: { readonly limit?: number; readonly teamId: string },
): Promise<FeedbackReferenceSummary[]> {
  const teamId = input.teamId.trim();
  if (!teamId) return [];

  return database
    .select({
      id: feedback.id,
      title: feedback.title,
    })
    .from(feedback)
    .where(eq(feedback.teamId, teamId))
    .orderBy(desc(feedback.updatedAt), desc(feedback.createdAt), feedback.id)
    .limit(Math.max(1, Math.min(120, input.limit ?? 20)));
}

export async function searchFeedbackReferences(
  database: FeedbackReferenceDatabase,
  input: { readonly limit?: number; readonly query: string; readonly teamId: string },
): Promise<FeedbackReferenceSummary[]> {
  const teamId = input.teamId.trim();
  const normalizedQuery = input.query.trim();
  if (!teamId || !normalizedQuery) return [];

  const pattern = likePatternForSearch(normalizedQuery);
  return database
    .select({
      id: feedback.id,
      title: feedback.title,
    })
    .from(feedback)
    .where(and(
      eq(feedback.teamId, teamId),
      or(
        sql`${feedback.id} ILIKE ${pattern} ESCAPE '\\'`,
        sql`${feedback.title} ILIKE ${pattern} ESCAPE '\\'`,
        sql`${feedback.description} ILIKE ${pattern} ESCAPE '\\'`,
      ),
    ))
    .orderBy(desc(feedback.updatedAt), desc(feedback.createdAt), feedback.id)
    .limit(Math.max(1, Math.min(120, input.limit ?? 20)));
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
      title: feedback.title,
    })
    .from(feedback)
    .where(eq(feedback.id, feedbackId))
    .limit(1);
  return target ?? null;
}

export function createFeedbackReferenceProvider() {
  return {
    protocolVersion: 1 as const,
    findTeamId: findFeedbackTeamId,
    hasProjectReference: hasFeedbackLinkedToProject,
    hasUserReference: hasFeedbackUserReference,
  };
}
