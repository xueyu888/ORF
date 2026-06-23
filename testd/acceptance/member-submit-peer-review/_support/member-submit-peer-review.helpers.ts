import { and, eq } from "drizzle-orm";
import { db } from "../../../_operators/testd-db-client";
import { objectiveContributionReviews, objectiveLoot, objectives } from "../../../../server/db/schema";
import { requiredTestUserIdByNameInTeam } from "../../../_operators/common.helpers";
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

export async function addPeerReviewTargetChallenger(target: PeerReviewTarget, memberName: string, memberUserId: string) {
  const objective = await readObjective(target.objective.id);
  if (!objective) {
    throw new Error("目标不存在，无法设置成员提交匿名互评挑战者");
  }

  await db
    .update(objectives)
    .set({
      challengers: uniqueMembers([...objective.challengers, memberName]),
      challengerUserIds: uniqueMembers([...objective.challengerUserIds, memberUserId]),
      updatedAt: today(),
    })
    .where(eq(objectives.id, target.objective.id));
}

export async function preparePeerReviewTargetForReview(target: PeerReviewTarget) {
  const objective = await readObjective(target.objective.id);
  if (!objective) {
    throw new Error("目标不存在，无法准备成员提交匿名互评状态");
  }

  await db
    .update(objectives)
    .set({
      stage: "goalFrozen",
      flowStatus: "accepted",
      lootSubmittedAt: new Date().toISOString(),
      acceptedResult: "completed",
      completionMultiplier: 1,
      objectiveBasePoints: 0,
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

  const id = `loot-${objective.id}`;
  const submittedByUserId = await requiredTestUserIdByNameInTeam({
    teamId: objective.teamId,
    name: memberName,
  });

  await db.insert(objectiveLoot).values({
    id,
    teamId: objective.teamId,
    objectiveId: objective.id,
    submittedBy: memberName,
    submittedByUserId,
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

export async function deletePeerReview(target: PeerReviewTarget | null, reviewer: string, _review?: SubmittedPeerReview | null) {
  if (target) {
    await db
      .delete(objectiveContributionReviews)
      .where(and(eq(objectiveContributionReviews.objectiveId, target.objective.id), eq(objectiveContributionReviews.reviewer, reviewer)));
    return;
  }

  await db.delete(objectiveContributionReviews).where(eq(objectiveContributionReviews.reviewer, reviewer));
}

export async function targetAccepted(target: PeerReviewTarget) {
  const objective = await readObjective(target.objective.id);
  return (
    !!objective &&
    objective.flowStatus === "accepted" &&
    objective.acceptedResult === "completed" &&
    !!objective.lootSubmittedAt
  );
}

export async function targetChallengerPresent(target: PeerReviewTarget, memberName: string, memberUserId: string) {
  const objective = await readObjective(target.objective.id);
  return (
    !!objective &&
    objective.challengers.includes(memberName) &&
    objective.challengerUserIds.includes(memberUserId)
  );
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

export async function targetLootPresent(target: PeerReviewTarget, loot: PeerReviewLoot) {
  const row = await readLootByBody(loot.body);
  return !!row && row.id === loot.id && row.objectiveId === target.objective.id;
}

export function lootPagePath(target: PeerReviewTarget) {
  return `/tasks/objectives/${encodeURIComponent(target.objective.id)}/loot`;
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
      challengerUserIds: objectives.challengerUserIds,
      lootSubmittedAt: objectives.lootSubmittedAt,
      acceptedResult: objectives.acceptedResult,
    })
    .from(objectives)
    .where(eq(objectives.id, objectiveId))
    .limit(1);

  return row ?? null;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function uniqueMembers(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
