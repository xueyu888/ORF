import { and, inArray, or, sql } from "drizzle-orm";
import { commentAttachments, commentMessages, commentThreads, feedback, feedbackCauseCategories, users } from "../../../../server/db/schema";
import { saveUserPreferences } from "../../../../server/settings/personalSettings";
import { db } from "../../../_operators/testd-db-client";

export async function setDefaultLandingPathByEmail(email: string, path: string | null) {
  const rows = await readUserIdsByEmail(email);
  for (const row of rows) {
    await saveUserPreferences(row.id, { defaultLandingPath: path });
  }
}

export async function deleteFeedbackByPhenomenon(phenomenon: string) {
  const feedbackIds = await readFeedbackIdsByPhenomenon(phenomenon);
  const threadIds = await readFeedbackThreadIds(feedbackIds, phenomenon);
  if (feedbackIds.length > 0) {
    await db
      .delete(commentAttachments)
      .where(and(sql`${commentAttachments.targetType} = 'feedback'`, inArray(commentAttachments.targetId, feedbackIds)));
  }
  if (threadIds.length > 0) {
    await db.delete(commentMessages).where(inArray(commentMessages.threadId, threadIds));
    await db.delete(commentThreads).where(inArray(commentThreads.id, threadIds));
  }
  if (feedbackIds.length === 0) {
    return;
  }
  await db
    .delete(feedbackCauseCategories)
    .where(inArray(feedbackCauseCategories.feedbackId, feedbackIds));
  await db.delete(feedback).where(inArray(feedback.id, feedbackIds));
}

export async function feedbackExistsByPhenomenon(phenomenon: string) {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(feedback)
    .where(sql`${feedback.phenomenon} = ${phenomenon}`);
  return (rows[0]?.count ?? 0) > 0;
}

async function readUserIdsByEmail(email: string) {
  return db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email.toLowerCase()}`);
}

async function readFeedbackIdsByPhenomenon(phenomenon: string) {
  const rows = await db
    .select({ id: feedback.id })
    .from(feedback)
    .where(sql`${feedback.phenomenon} = ${phenomenon}`);
  return rows.map((row) => row.id);
}

async function readFeedbackThreadIds(feedbackIds: string[], phenomenon: string) {
  if (feedbackIds.length === 0) {
    const rows = await db
      .select({ id: commentThreads.id })
      .from(commentThreads)
      .where(and(sql`${commentThreads.targetType} = 'feedback'`, sql`${commentThreads.targetTitle} = ${phenomenon}`));
    return rows.map((row) => row.id);
  }
  const rows = await db
    .select({ id: commentThreads.id })
    .from(commentThreads)
    .where(and(sql`${commentThreads.targetType} = 'feedback'`, or(inArray(commentThreads.targetId, feedbackIds), sql`${commentThreads.targetTitle} = ${phenomenon}`)));
  return rows.map((row) => row.id);
}
