import { and, eq, inArray, or, sql } from "drizzle-orm";
import { commentAttachments, commentMessages, commentThreads, feedback, feedbackCauseCategories, teamMembers, users } from "../../../../server/db/schema";
import { db } from "../../../_operators/testd-db-client";

export async function prepareFeedbackEntryFixture(input: {
  email: string;
  feedbackId: string;
  phenomenon: string;
  category: string;
}) {
  const account = await readFeedbackEntryAccount(input.email);
  await deleteFeedbackEntryFixture(input.feedbackId, input.phenomenon);

  const today = new Date().toISOString().slice(0, 10);
  await db.transaction(async (tx) => {
    await tx.insert(feedback).values({
      id: input.feedbackId,
      teamId: account.teamId,
      phenomenon: input.phenomenon,
      impact: "Medium",
      suggestedAdjustment: `${input.phenomenon} 测试建议`,
      status: "Open",
      owner: account.name,
      ownerUserId: account.userId,
      createdAt: today,
      updatedAt: today,
      createdBy: account.userId,
      updatedBy: account.userId,
    });
    await tx.insert(feedbackCauseCategories).values({
      feedbackId: input.feedbackId,
      category: input.category,
      sortOrder: 0,
    });
  });
}

export async function deleteFeedbackEntryFixture(feedbackId: string, phenomenon: string) {
  await db.transaction(async (tx) => {
    const threadRows = await tx
      .select({ id: commentThreads.id })
      .from(commentThreads)
      .where(
        and(
          sql`${commentThreads.targetType} = 'feedback'`,
          or(eq(commentThreads.targetId, feedbackId), eq(commentThreads.targetTitle, phenomenon)),
        ),
      );
    const threadIds = threadRows.map((row) => row.id);

    if (threadIds.length > 0) {
      const messageRows = await tx
        .select({ id: commentMessages.id })
        .from(commentMessages)
        .where(inArray(commentMessages.threadId, threadIds));
      const messageIds = messageRows.map((row) => row.id);

      if (messageIds.length > 0) {
        await tx.delete(commentAttachments).where(inArray(commentAttachments.messageId, messageIds));
        await tx.delete(commentMessages).where(inArray(commentMessages.id, messageIds));
      }

      await tx.delete(commentThreads).where(inArray(commentThreads.id, threadIds));
    }

    await tx.delete(feedbackCauseCategories).where(eq(feedbackCauseCategories.feedbackId, feedbackId));
    await tx.delete(feedback).where(or(eq(feedback.id, feedbackId), eq(feedback.phenomenon, phenomenon)));
  });
}

export async function feedbackEntryFixtureExists(feedbackId: string, phenomenon: string) {
  const issueRows = await db
    .select({ id: feedback.id, phenomenon: feedback.phenomenon, status: feedback.status })
    .from(feedback)
    .where(or(eq(feedback.id, feedbackId), eq(feedback.phenomenon, phenomenon)));

  const categoryRows = await db
    .select({ feedbackId: feedbackCauseCategories.feedbackId, category: feedbackCauseCategories.category })
    .from(feedbackCauseCategories)
    .where(eq(feedbackCauseCategories.feedbackId, feedbackId));

  return issueRows.some((row) => row.id === feedbackId && row.phenomenon === phenomenon && row.status === "Open") &&
    categoryRows.some((row) => row.feedbackId === feedbackId);
}

export async function feedbackEntryFixtureAbsent(feedbackId: string, phenomenon: string) {
  const issueRows = await db
    .select({ id: feedback.id })
    .from(feedback)
    .where(or(eq(feedback.id, feedbackId), eq(feedback.phenomenon, phenomenon)));

  const categoryRows = await db
    .select({ feedbackId: feedbackCauseCategories.feedbackId })
    .from(feedbackCauseCategories)
    .where(eq(feedbackCauseCategories.feedbackId, feedbackId));

  return issueRows.length === 0 && categoryRows.length === 0;
}

type FeedbackEntryAccount = {
  teamId: string;
  userId: string;
  name: string;
};

async function readFeedbackEntryAccount(email: string): Promise<FeedbackEntryAccount> {
  const [account] = await db
    .select({ teamId: teamMembers.teamId, userId: users.id, name: users.name })
    .from(users)
    .innerJoin(teamMembers, eq(teamMembers.userId, users.id))
    .where(and(eq(users.email, email), eq(users.status, "active")))
    .limit(1);

  if (!account) {
    throw new Error(`未找到反馈入口测试用户的默认团队成员关系: ${email}`);
  }

  return account;
}
