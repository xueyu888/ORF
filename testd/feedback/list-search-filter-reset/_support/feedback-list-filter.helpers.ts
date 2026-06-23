import { and, eq, inArray } from "drizzle-orm";
import { feedback, feedbackCauseCategories, teamMembers, users } from "../../../../server/db/schema";
import { db } from "../../../_operators/testd-db-client";
import type { FeedbackFixture, FeedbackListFilterCaseData } from "./feedback-list-filter.context";

type FeedbackFixtureAccount = {
  teamId: string;
  userId: string;
  name: string;
};

export async function prepareFeedbackListFixtures(data: FeedbackListFilterCaseData) {
  const account = await readFeedbackFixtureAccount(data.email);
  await deleteFeedbackListFixtures(data.fixtureRows);
  const today = new Date().toISOString().slice(0, 10);

  await db.transaction(async (tx) => {
    for (const item of data.fixtureRows) {
      await tx.insert(feedback).values({
        id: item.id,
        teamId: account.teamId,
        phenomenon: item.phenomenon,
        impact: "Medium",
        suggestedAdjustment: `${item.phenomenon} 测试建议`,
        status: item.status,
        owner: account.name,
        ownerUserId: account.userId,
        createdAt: today,
        updatedAt: today,
        createdBy: account.userId,
        updatedBy: account.userId,
      });
      await tx.insert(feedbackCauseCategories).values({
        feedbackId: item.id,
        category: item.category,
        sortOrder: 1,
      });
    }
  });
}

export async function deleteFeedbackListFixtures(fixtures: readonly FeedbackFixture[]) {
  const ids = fixtures.map((item) => item.id);
  if (ids.length === 0) return;

  await db.transaction(async (tx) => {
    await tx.delete(feedbackCauseCategories).where(inArray(feedbackCauseCategories.feedbackId, ids));
    await tx.delete(feedback).where(inArray(feedback.id, ids));
  });
}

export async function feedbackListFixturesExist(fixtures: readonly FeedbackFixture[]) {
  const ids = fixtures.map((item) => item.id);
  if (ids.length === 0) return false;

  const issues = await db.select({ id: feedback.id, phenomenon: feedback.phenomenon, status: feedback.status }).from(feedback).where(inArray(feedback.id, ids));
  const categories = await db.select({ feedbackId: feedbackCauseCategories.feedbackId, category: feedbackCauseCategories.category }).from(feedbackCauseCategories).where(inArray(feedbackCauseCategories.feedbackId, ids));
  if (issues.length !== fixtures.length || categories.length !== fixtures.length) return false;

  return fixtures.every((fixture) =>
    issues.some((issue) => issue.id === fixture.id && issue.phenomenon === fixture.phenomenon && issue.status === fixture.status) &&
    categories.some((category) => category.feedbackId === fixture.id && category.category === fixture.category),
  );
}

export async function feedbackListFixturesAbsent(fixtures: readonly FeedbackFixture[]) {
  const ids = fixtures.map((item) => item.id);
  if (ids.length === 0) return true;

  const issues = await db.select({ id: feedback.id }).from(feedback).where(inArray(feedback.id, ids));
  const categories = await db.select({ feedbackId: feedbackCauseCategories.feedbackId }).from(feedbackCauseCategories).where(inArray(feedbackCauseCategories.feedbackId, ids));
  return issues.length === 0 && categories.length === 0;
}

async function readFeedbackFixtureAccount(email: string): Promise<FeedbackFixtureAccount> {
  const [account] = await db
    .select({ teamId: teamMembers.teamId, userId: users.id, name: users.name })
    .from(users)
    .innerJoin(teamMembers, eq(teamMembers.userId, users.id))
    .where(and(eq(users.email, email), eq(users.status, "active")))
    .limit(1);

  if (!account) throw new Error(`未找到反馈列表筛选测试用户的默认团队成员关系: ${email}`);
  return account;
}
