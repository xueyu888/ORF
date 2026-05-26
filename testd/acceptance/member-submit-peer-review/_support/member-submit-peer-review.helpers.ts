import type { Page } from "@playwright/test";
import { and, eq, sql } from "drizzle-orm";
import { closeDb, db } from "../../../../server/db/client";
import { objectiveContributionReviews, objectiveLoot, objectives, teamMembers, users } from "../../../../server/db/schema";
import type {
  MemberSubmitPeerReviewCaseData,
  PeerReviewLoot,
  PeerReviewTarget,
  SubmittedPeerReview,
} from "./member-submit-peer-review.context";

export async function closeMemberSubmitPeerReviewTestDb() {
  await closeDb();
}

export async function memberAccountActive(email: string) {
  const account = await readMemberAccount(email);
  return !!account && account.role === "member" && account.status === "active";
}

export async function peerReviewTargetAvailable(data: Pick<MemberSubmitPeerReviewCaseData, "email" | "name">) {
  return (await selectPeerReviewTarget(data)) !== null;
}

export async function selectPeerReviewTarget(data: Pick<MemberSubmitPeerReviewCaseData, "email" | "name">): Promise<PeerReviewTarget | null> {
  const member = await readMemberAccount(data.email);
  if (!member) {
    return null;
  }

  const objectiveRows = await db
    .select({
      id: objectives.id,
      title: objectives.title,
      stage: objectives.stage,
      flowStatus: objectives.flowStatus,
      status: objectives.status,
      challengers: objectives.challengers,
      assignedChallengers: objectives.assignedChallengers,
      challengeApplications: objectives.challengeApplications,
      acceptedAt: objectives.acceptedAt,
      confirmationDueAt: objectives.confirmationDueAt,
      confirmedAt: objectives.confirmedAt,
      lootSubmittedAt: objectives.lootSubmittedAt,
      acceptedResult: objectives.acceptedResult,
      objectiveSettlementPoints: objectives.objectiveSettlementPoints,
      updatedAt: objectives.updatedAt,
      updatedBy: objectives.updatedBy,
    })
    .from(objectives)
    .where(eq(objectives.teamId, member.teamId));

  const lootRows = await db.select({ objectiveId: objectiveLoot.objectiveId }).from(objectiveLoot);
  const lootCountByObjective = new Map<string, number>();
  for (const row of lootRows) {
    lootCountByObjective.set(row.objectiveId, (lootCountByObjective.get(row.objectiveId) ?? 0) + 1);
  }

  const titleCounts = new Map<string, number>();
  for (const row of objectiveRows) {
    titleCounts.set(row.title, (titleCounts.get(row.title) ?? 0) + 1);
  }

  const selected = objectiveRows.find((row) => {
    if (titleCounts.get(row.title) !== 1) return false;
    if ((lootCountByObjective.get(row.id) ?? 0) !== 0) return false;
    if (row.acceptedResult || row.objectiveSettlementPoints != null) return false;
    if (row.flowStatus === "settled" || row.flowStatus === "closed") return false;
    return true;
  });

  if (!selected) {
    return null;
  }

  return {
    objective: {
      id: selected.id,
      title: selected.title,
    },
    previous: {
      id: selected.id,
      title: selected.title,
      stage: selected.stage,
      flowStatus: selected.flowStatus,
      status: selected.status,
      challengers: selected.challengers,
      assignedChallengers: selected.assignedChallengers,
      challengeApplications: selected.challengeApplications,
      acceptedAt: selected.acceptedAt,
      confirmationDueAt: selected.confirmationDueAt,
      confirmedAt: selected.confirmedAt,
      lootSubmittedAt: selected.lootSubmittedAt,
      acceptedResult: selected.acceptedResult,
      objectiveSettlementPoints: selected.objectiveSettlementPoints,
      updatedAt: selected.updatedAt,
      updatedBy: selected.updatedBy,
    },
  };
}

export async function preparePeerReviewTarget(target: PeerReviewTarget, memberName: string) {
  const objective = await readObjective(target.objective.id);
  if (!objective) {
    throw new Error("目标不存在，无法准备成员提交匿名互评状态");
  }

  await db
    .update(objectives)
    .set({
      stage: "goalFrozen",
      flowStatus: "submitted",
      challengers: [memberName],
      lootSubmittedAt: new Date().toISOString(),
      acceptedResult: null,
      objectiveSettlementPoints: null,
      updatedAt: today(),
    })
    .where(eq(objectives.id, target.objective.id));
}

export async function createPeerReviewLoot(target: PeerReviewTarget, body: string, memberName: string): Promise<PeerReviewLoot> {
  const objective = await readObjective(target.objective.id);
  if (!objective) {
    throw new Error("目标不存在，无法创建匿名互评前置战利品");
  }

  const id = `loot-testd-peer-${Date.now()}`;
  await db.insert(objectiveLoot).values({
    id,
    teamId: objective.teamId,
    objectiveId: objective.id,
    submittedBy: memberName,
    body,
    resultClaims: [],
    selfTestReportUrl: null,
    selfTestReportBody: null,
    submittedAt: new Date().toISOString(),
  });

  return { id, objectiveId: objective.id, body };
}

export async function restorePeerReviewTarget(target: PeerReviewTarget | null) {
  if (!target) {
    return;
  }

  await db
    .update(objectives)
    .set({
      stage: target.previous.stage,
      flowStatus: target.previous.flowStatus,
      status: target.previous.status,
      challengers: target.previous.challengers,
      assignedChallengers: target.previous.assignedChallengers,
      challengeApplications: target.previous.challengeApplications,
      acceptedAt: target.previous.acceptedAt,
      confirmationDueAt: target.previous.confirmationDueAt,
      confirmedAt: target.previous.confirmedAt,
      lootSubmittedAt: target.previous.lootSubmittedAt,
      acceptedResult: target.previous.acceptedResult,
      objectiveSettlementPoints: target.previous.objectiveSettlementPoints,
      updatedAt: target.previous.updatedAt,
      updatedBy: target.previous.updatedBy,
    })
    .where(eq(objectives.id, target.objective.id));
}

export async function deletePeerReviewLoot(body: string, loot?: PeerReviewLoot | null) {
  if (loot?.id) {
    await db.delete(objectiveLoot).where(eq(objectiveLoot.id, loot.id));
  }
  await db.delete(objectiveLoot).where(eq(objectiveLoot.body, body));
}

export async function deletePeerReview(target: PeerReviewTarget | null, reviewer: string, review?: SubmittedPeerReview | null) {
  if (review?.id) {
    await db.delete(objectiveContributionReviews).where(eq(objectiveContributionReviews.id, review.id));
  }
  if (target) {
    await db
      .delete(objectiveContributionReviews)
      .where(and(eq(objectiveContributionReviews.objectiveId, target.objective.id), eq(objectiveContributionReviews.reviewer, reviewer)));
  }
}

export async function targetSubmittedForMember(target: PeerReviewTarget, memberName: string) {
  const objective = await readObjective(target.objective.id);
  return !!objective && objective.flowStatus === "submitted" && objective.challengers.includes(memberName);
}

export async function testLootAbsent(body: string) {
  return (await readLootByBody(body)) === null;
}

export async function peerReviewAbsent(target: PeerReviewTarget | null, reviewer: string) {
  if (!target) return true;
  return (await readPeerReview(target.objective.id, reviewer)) === null;
}

export async function peerReviewPresent(target: PeerReviewTarget, reviewer: string, ratio: number) {
  const row = await readPeerReview(target.objective.id, reviewer);
  return !!row && row.allocations.some((allocation) => allocation.member === reviewer && allocation.ratio === ratio);
}

export async function targetLootPresent(target: PeerReviewTarget, loot: PeerReviewLoot) {
  const row = await readLootByBody(loot.body);
  return !!row && row.id === loot.id && row.objectiveId === target.objective.id;
}

export function peerReviewFromResponse(body: unknown): SubmittedPeerReview {
  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as { review?: unknown }).review !== "object" ||
    (body as { review?: unknown }).review === null
  ) {
    throw new Error("提交匿名互评接口响应缺少 review");
  }

  const review = (body as { review: Record<string, unknown> }).review;
  if (
    typeof review.id !== "string" ||
    typeof review.objectiveId !== "string" ||
    typeof review.reviewer !== "string" ||
    !Array.isArray(review.allocations)
  ) {
    throw new Error("提交匿名互评接口响应 review 结构不完整");
  }

  return {
    id: review.id,
    objectiveId: review.objectiveId,
    reviewer: review.reviewer,
    allocations: review.allocations as SubmittedPeerReview["allocations"],
  };
}

export function lootPagePath(target: PeerReviewTarget) {
  return `/objectives/${encodeURIComponent(target.objective.id)}/loot`;
}

async function readLootByBody(body: string) {
  const [row] = await db.select({ id: objectiveLoot.id, objectiveId: objectiveLoot.objectiveId }).from(objectiveLoot).where(eq(objectiveLoot.body, body)).limit(1);
  return row ?? null;
}

async function readPeerReview(objectiveId: string, reviewer: string) {
  const [row] = await db
    .select({
      id: objectiveContributionReviews.id,
      objectiveId: objectiveContributionReviews.objectiveId,
      reviewer: objectiveContributionReviews.reviewer,
      allocations: objectiveContributionReviews.allocations,
    })
    .from(objectiveContributionReviews)
    .where(and(eq(objectiveContributionReviews.objectiveId, objectiveId), eq(objectiveContributionReviews.reviewer, reviewer)))
    .limit(1);

  return row ?? null;
}

async function readObjective(objectiveId: string) {
  const [row] = await db
    .select({
      id: objectives.id,
      teamId: objectives.teamId,
      flowStatus: objectives.flowStatus,
      challengers: objectives.challengers,
    })
    .from(objectives)
    .where(eq(objectives.id, objectiveId))
    .limit(1);

  return row ?? null;
}

async function readMemberAccount(email: string): Promise<{
  userId: string;
  teamId: string;
  role: string;
  status: string;
} | null> {
  const [row] = await db
    .select({
      userId: users.id,
      teamId: teamMembers.teamId,
      role: teamMembers.role,
      status: users.status,
    })
    .from(users)
    .innerJoin(teamMembers, eq(teamMembers.userId, users.id))
    .where(sql`lower(${users.email}) = ${email.toLowerCase()}`)
    .limit(1);

  return row ?? null;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
