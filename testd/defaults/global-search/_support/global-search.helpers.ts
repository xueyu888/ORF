import { sql } from "drizzle-orm";
import { feedback, feedbackCauseCategories, objectives, results, tasks, teamMembers, users } from "../../../../server/db/schema";
import { saveUserPreferences } from "../../../../server/settings/personalSettings";
import { db } from "../../../_operators/testd-db-client";

type SearchFixtureInput = {
  email: string;
  keyword: string;
  objectiveId: string;
  objectiveTitle: string;
  resultId: string;
  resultTitle: string;
  taskId: string;
  taskTitle: string;
  feedbackId: string;
  feedbackPhenomenon: string;
};

type SearchFixtureEntity = "objective" | "result" | "task" | "feedback";

export async function setDefaultLandingPathByEmail(email: string, path: string | null) {
  const rows = await readUserIdsByEmail(email);
  for (const row of rows) {
    await saveUserPreferences(row.id, { defaultLandingPath: path });
  }
}

export async function prepareSearchObjective(input: SearchFixtureInput) {
  const account = await readSearchFixtureAccount(input.email);
  await deleteSearchFixtures(input.keyword);
  const today = todayString();
  await db.insert(objectives).values({
    id: input.objectiveId,
    teamId: account.teamId,
    title: input.objectiveTitle,
    description: `${input.keyword} 目标描述`,
    whyItMatters: `${input.keyword} 目标价值`,
    cycle: "2026-Q2",
    stage: "orfExecute",
    flowStatus: "accepted",
    status: "On Track",
    confidence: 80,
    progress: 20,
    boundary: `${input.keyword} 目标边界`,
    successDefinition: `${input.keyword} 成功定义`,
    finalDueAt: "2026-06-30",
    challengers: [account.name],
    challengerUserIds: [account.userId],
    assignedChallengers: [account.name],
    assignedChallengerUserIds: [account.userId],
    challengeApplications: [],
    objectiveBasePoints: 10,
    createdAt: today,
    updatedAt: today,
    createdBy: account.userId,
    updatedBy: account.userId,
  });
}

export async function prepareSearchResult(input: SearchFixtureInput) {
  const account = await readSearchFixtureAccount(input.email);
  const today = todayString();
  await db.insert(results).values({
    id: input.resultId,
    teamId: account.teamId,
    objectiveId: input.objectiveId,
    title: input.resultTitle,
    detail: `${input.keyword} 指标说明`,
    baseline: 0,
    current: 10,
    target: 100,
    unit: "items",
    direction: "increase",
    status: "On Track",
    confidence: 70,
    source: "managerDefined",
    definer: account.name,
    definerUserId: account.userId,
    uncertaintyScore: 1,
    acceptedResult: "unreviewed",
    reviewCadence: `${input.keyword} 每周复盘`,
    sortOrder: 1,
    createdAt: today,
    updatedAt: today,
    createdBy: account.userId,
    updatedBy: account.userId,
  });
}

export async function prepareSearchTask(input: SearchFixtureInput) {
  const account = await readSearchFixtureAccount(input.email);
  const today = todayString();
  await db.insert(tasks).values({
    id: input.taskId,
    teamId: account.teamId,
    title: input.taskTitle,
    description: `${input.keyword} 行动项说明`,
    status: "In Progress",
    priority: "Medium",
    assignee: account.name,
    assigneeUserId: account.userId,
    linkedObjectiveId: input.objectiveId,
    dueDate: "2026-06-25",
    tags: [input.keyword],
    createdAt: today,
    updatedAt: today,
    sortOrder: 1,
    createdBy: account.userId,
    updatedBy: account.userId,
  });
}

export async function prepareSearchFeedback(input: SearchFixtureInput) {
  const account = await readSearchFixtureAccount(input.email);
  const today = todayString();
  await db.insert(feedback).values({
    id: input.feedbackId,
    teamId: account.teamId,
    phenomenon: input.feedbackPhenomenon,
    impact: "Medium",
    suggestedAdjustment: `${input.keyword} 反馈建议`,
    status: "Open",
    owner: account.name,
    ownerUserId: account.userId,
    createdAt: today,
    updatedAt: today,
    createdBy: account.userId,
    updatedBy: account.userId,
  });
  await db.insert(feedbackCauseCategories).values({
    feedbackId: input.feedbackId,
    category: input.keyword,
    sortOrder: 1,
  });
}

export async function deleteSearchFixtures(keyword: string) {
  await db.delete(feedbackCauseCategories).where(sql`${feedbackCauseCategories.feedbackId} in (select id from feedback where phenomenon ilike ${`%${keyword}%`})`);
  await db.delete(feedback).where(sql`${feedback.phenomenon} ilike ${`%${keyword}%`}`);
  await db.delete(tasks).where(sql`${tasks.title} ilike ${`%${keyword}%`} or ${tasks.description} ilike ${`%${keyword}%`}`);
  await db.delete(results).where(sql`${results.title} ilike ${`%${keyword}%`} or ${results.detail} ilike ${`%${keyword}%`}`);
  await db.delete(objectives).where(sql`${objectives.title} ilike ${`%${keyword}%`} or ${objectives.description} ilike ${`%${keyword}%`}`);
}

export async function searchFixtureExists(entity: SearchFixtureEntity, keyword: string) {
  return (await countSearchFixtures(entity, keyword)) > 0;
}

export async function searchFixtureAbsent(entity: SearchFixtureEntity, keyword: string) {
  return (await countSearchFixtures(entity, keyword)) === 0;
}

async function countSearchFixtures(entity: SearchFixtureEntity, keyword: string) {
  if (entity === "objective") {
    const rows = await db.select({ count: sql<number>`count(*)::int` }).from(objectives).where(sql`${objectives.title} ilike ${`%${keyword}%`}`);
    return rows[0]?.count ?? 0;
  }
  if (entity === "result") {
    const rows = await db.select({ count: sql<number>`count(*)::int` }).from(results).where(sql`${results.title} ilike ${`%${keyword}%`}`);
    return rows[0]?.count ?? 0;
  }
  if (entity === "task") {
    const rows = await db.select({ count: sql<number>`count(*)::int` }).from(tasks).where(sql`${tasks.title} ilike ${`%${keyword}%`}`);
    return rows[0]?.count ?? 0;
  }

  const rows = await db.select({ count: sql<number>`count(*)::int` }).from(feedback).where(sql`${feedback.phenomenon} ilike ${`%${keyword}%`}`);
  return rows[0]?.count ?? 0;
}

async function readUserIdsByEmail(email: string) {
  return db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email.toLowerCase()}`);
}

async function readSearchFixtureAccount(email: string) {
  const rows = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      teamId: teamMembers.teamId,
    })
    .from(users)
    .innerJoin(teamMembers, sql`${teamMembers.userId} = ${users.id}`)
    .where(sql`lower(${users.email}) = ${email.toLowerCase()}`)
    .limit(1);

  const account = rows[0];
  if (!account?.teamId) {
    throw new Error(`未找到邮箱 ${email} 对应的测试用户默认团队关系`);
  }
  return account;
}

function todayString() {
  return new Date().toISOString().slice(0, 10);
}
