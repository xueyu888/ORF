import { and, eq } from "drizzle-orm";
import { db } from "../../../../server/db/client";
import { objectiveContributionReviews, objectiveLoot, objectives } from "../../../../server/db/schema";
import type {
  PeerReviewLoot,
  PeerReviewTarget,
  SubmittedPeerReview,
} from "./member-submit-peer-review.context";

export async function peerReviewTargetFromObjective(objectiveId: string): Promise<PeerReviewTarget> {
  const selected = await readObjective(objectiveId);
  if (!selected) {
    throw new Error(`成员提交匿名互评目标不存在: ${objectiveId}`);
  }

  return {
    objective: {
      id: selected.id,
      teamId: selected.teamId,
      title: selected.title,
      stage: selected.stage,
      flowStatus: selected.flowStatus,
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

  const id = "loot-testd-member-submit-peer-review";
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
    return;
  }

  await db.delete(objectiveContributionReviews).where(eq(objectiveContributionReviews.reviewer, reviewer));
}

export async function targetSubmittedForMember(target: PeerReviewTarget, memberName: string) {
  const objective = await readObjective(target.objective.id);
  return !!objective && objective.flowStatus === "submitted" && !!objective.lootSubmittedAt && objective.challengers.includes(memberName);
}

export async function testLootAbsent(body: string) {
  return (await readLootByBody(body)) === null;
}

export async function peerReviewAbsent(target: PeerReviewTarget | null, reviewer: string) {
  if (!target) {
    return (await readPeerReviewsByReviewer(reviewer)).length === 0;
  }
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

async function readPeerReviewsByReviewer(reviewer: string) {
  return db
    .select({ id: objectiveContributionReviews.id })
    .from(objectiveContributionReviews)
    .where(eq(objectiveContributionReviews.reviewer, reviewer));
}

async function readObjective(objectiveId: string) {
  const [row] = await db
    .select({
      id: objectives.id,
      teamId: objectives.teamId,
      title: objectives.title,
      stage: objectives.stage,
      flowStatus: objectives.flowStatus,
      challengers: objectives.challengers,
      lootSubmittedAt: objectives.lootSubmittedAt,
    })
    .from(objectives)
    .where(eq(objectives.id, objectiveId))
    .limit(1);

  return row ?? null;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
