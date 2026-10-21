import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { isAchievementPeriod, suggestedAchievementPeriod } from "../../src/domain/achievementPeriod";
import { isValidObjectiveBasePoints } from "../../src/domain/orfSettlement";
import { localDateString } from "../../src/utils/date";
import { db } from "../db/client";
import { objectives, objectiveSettlementEvents, pointLedger, projects, teamMembers, users } from "../db/schema";

export const historicalWorkAwardSchema = z.object({
  requestId: z.string().uuid(),
  teamId: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  actorUserId: z.string().uuid(),
  reason: z.string().trim().min(1),
  mode: z.enum(["extraWork", "monthlyReview"]).default("extraWork"),
  achievementPeriod: z.object({ start: z.string(), end: z.string() }).refine(isAchievementPeriod, "Invalid achievement period"),
  allocations: z.array(z.object({ userId: z.string().uuid(), points: z.number().refine(isValidObjectiveBasePoints, "Points must be positive with at most two decimals") }).strict()).min(1),
}).strict().refine(input => new Set(input.allocations.map(a => a.userId)).size === input.allocations.length, "Duplicate recipient");

export type HistoricalWorkAwardInput = z.infer<typeof historicalWorkAwardSchema>;
export interface HistoricalWorkAwardReceipt {
  status: "preview" | "applied" | "alreadyApplied";
  eventId: string;
  objectiveId: string;
  title: string;
  achievementPeriod: HistoricalWorkAwardInput["achievementPeriod"];
  totalPoints: number;
  allocations: Array<{ userId: string; memberName: string; points: number }>;
}

function prepareHistoricalWorkAward(rawInput: unknown) {
  const input = historicalWorkAwardSchema.parse(rawInput);
  const objectiveId = `obj-work-award-${input.requestId}`;
  const eventId = `ose-work-award-${input.requestId}`;
  const today = localDateString(new Date());
  const cycle = input.achievementPeriod.start.slice(0, 7);
  const expected = suggestedAchievementPeriod(cycle);
  if (expected?.start !== input.achievementPeriod.start || expected.end !== input.achievementPeriod.end || expected.end >= today) {
    throw new Error("A completed calendar month is required");
  }
  const totalPoints = input.allocations.reduce((sum, a) => sum + Math.round(a.points * 100), 0) / 100;
  if (!isValidObjectiveBasePoints(totalPoints)) throw new Error("Award total is out of range");
  const monthlyReview = input.mode === "monthlyReview";
  const reason = `${monthlyReview ? "管理员历史月度复核积分入账" : "管理员历史额外工作定额入账"}：${input.reason}`;
  const description = monthlyReview
    ? `${reason}\n本条为已结束月份的管理员复核汇总补录；按批准的个人复核分入账，不重复计入其他条目。没有代填成员提交、客户验收或匿名互评。`
    : `${reason}\n本条为独立历史工作定额补录；并非原模块追加评分。按管理员批准金额入账，没有代填成员提交、客户验收或匿名互评。`;
  return { input, objectiveId, eventId, today, cycle, totalPoints, reason, description };
}

/** Trusted administrator entry; a batch is committed atomically, including retries. */
export async function recordHistoricalWorkAwards(rawInputs: readonly unknown[], apply = false): Promise<HistoricalWorkAwardReceipt[]> {
  if (rawInputs.length === 0) throw new Error("At least one historical work entry is required");
  const entries = rawInputs.map(prepareHistoricalWorkAward);
  if (new Set(entries.map(e => e.input.requestId)).size !== entries.length) throw new Error("Duplicate request id in batch");
  const titleKeys = entries.map(e => JSON.stringify([e.input.teamId, e.input.projectId, e.cycle, e.input.title]));
  if (new Set(titleKeys).size !== entries.length) throw new Error("Duplicate project, month and title in batch");
  return db.transaction(async tx => {
    for (const teamId of [...new Set(entries.map(e => e.input.teamId))].sort()) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${teamId}), hashtext('historicalWorkAward'))`);
    }
    const receipts: HistoricalWorkAwardReceipt[] = [];
    for (const { input, objectiveId, eventId, today, cycle, totalPoints, reason, description } of entries) {
      const [project] = await tx.select({ id: projects.id }).from(projects)
        .where(and(eq(projects.id, input.projectId), eq(projects.teamId, input.teamId)));
      if (!project) throw new Error("Project is not in the requested team");
      const memberRows = await tx.select({ id: users.id, name: users.name, status: users.status, role: teamMembers.role })
        .from(teamMembers).innerJoin(users, eq(users.id, teamMembers.userId))
        .where(and(eq(teamMembers.teamId, input.teamId), inArray(users.id, [input.actorUserId, ...input.allocations.map(a => a.userId)])));
      const actor = memberRows.find(m => m.id === input.actorUserId);
      if (actor?.role !== "admin" || actor.status !== "active") throw new Error("An active team administrator must approve the award");
      const allocations = input.allocations.map(a => {
        const member = memberRows.find(m => m.id === a.userId);
        const isReviewingAdmin = input.mode === "monthlyReview" && member?.role === "admin" && member.id === input.actorUserId;
        if (!member || member.status !== "active" || (member.role !== "member" && !isReviewingAdmin)) throw new Error("Every recipient must be an active team member; a monthly review may include the approving administrator");
        return { userId: a.userId, memberName: member.name, points: a.points };
      });
      const receipt = { eventId, objectiveId, title: input.title, achievementPeriod: input.achievementPeriod, totalPoints, allocations };
      const [existing] = await tx.select().from(objectives).where(eq(objectives.id, objectiveId));
      if (existing) {
        const [event] = await tx.select().from(objectiveSettlementEvents).where(eq(objectiveSettlementEvents.id, eventId));
        const ledger = await tx.select().from(pointLedger).where(eq(pointLedger.objectiveId, objectiveId));
        const same = existing.teamId === input.teamId && existing.projectId === input.projectId && existing.title === input.title
          && existing.flowStatus === "settled" && existing.cycle === cycle && existing.objectiveBasePoints === totalPoints
          && existing.objectiveSettlementPoints === totalPoints
          && event?.kind === "historicalWorkAward" && event.objectiveId === objectiveId && event.teamId === input.teamId
          && event.createdByUserId === input.actorUserId && event.reason === reason && event.settlementPoints === totalPoints
          && event.achievementStart === input.achievementPeriod.start && event.achievementEnd === input.achievementPeriod.end
          && ledger.length === allocations.length && allocations.every(a => ledger.some(l => l.userId === a.userId
            && l.points === a.points && l.teamId === input.teamId && l.settlementEventId === eventId));
        if (!same) throw new Error("Request already exists with different content; no changes were made");
        receipts.push({ ...receipt, status: "alreadyApplied" });
        continue;
      }
      const duplicates = await tx.select({ id: objectives.id }).from(objectives).where(and(
        eq(objectives.teamId, input.teamId), eq(objectives.projectId, input.projectId), eq(objectives.cycle, cycle), eq(objectives.title, input.title),
      ));
      if (duplicates.length) throw new Error("A work item with this title already exists in this project and month");
      if (!apply) {
        receipts.push({ ...receipt, status: "preview" });
        continue;
      }
      const createdAt = new Date().toISOString();
      await tx.insert(objectives).values({
        id: objectiveId, teamId: input.teamId, projectId: input.projectId, title: input.title,
        description, whyItMatters: reason, cycle, stage: "goalFrozen", flowStatus: "settled", status: "On Track",
        confidence: 100, progress: 100, boundary: description, successDefinition: input.mode === "monthlyReview" ? "按管理员采纳的个人月度复核分入账。" : "按管理员明确批准的历史额外工作定额入账。",
        finalDueAt: input.achievementPeriod.end, challengerUserIds: allocations.map(a => a.userId),
        objectiveBasePoints: totalPoints, objectiveSettlementPoints: totalPoints, completionMultiplier: 1,
        createdAt: today, updatedAt: today, createdBy: input.actorUserId, updatedBy: input.actorUserId,
      });
      await tx.insert(objectiveSettlementEvents).values({
        id: eventId, teamId: input.teamId, objectiveId, kind: "historicalWorkAward",
        basePoints: totalPoints, multiplier: 1, settlementPoints: totalPoints, reason, createdByUserId: input.actorUserId,
        achievementStart: input.achievementPeriod.start, achievementEnd: input.achievementPeriod.end, createdAt,
      });
      await tx.insert(pointLedger).values(allocations.map(a => ({
        id: `points-work-award-${input.requestId}-${a.userId}`, teamId: input.teamId, objectiveId,
        settlementEventId: eventId, userId: a.userId, memberName: a.memberName, points: a.points, reason, createdAt,
      })));
      receipts.push({ ...receipt, status: "applied" });
    }
    return receipts;
  });
}

/** Single-entry interface retained for existing approved historical awards. */
export async function recordHistoricalWorkAward(rawInput: unknown, apply = false): Promise<HistoricalWorkAwardReceipt> {
  return (await recordHistoricalWorkAwards([rawInput], apply))[0]!;
}
