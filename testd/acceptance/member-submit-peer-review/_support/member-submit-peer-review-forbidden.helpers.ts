import { expect, type Page } from "@playwright/test";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../../_operators/testd-db-client";
import { objectiveContributionReviews, objectiveLoot, objectives } from "../../../../server/db/schema";
import type { ObjectiveFlowStatus, OrfStage } from "../../../../src/types/orf";
import {
  deleteTestObjectives,
  requiredTestUserIdForTeam,
  testObjectiveAbsent,
  upsertTestObjective,
} from "../../../_operators/common.helpers";
import type { PeerReviewLoot, PeerReviewTarget } from "./member-submit-peer-review.context";
import { peerReviewTargetFromObjective } from "./member-submit-peer-review.helpers";

export type PeerReviewForbiddenTargetFixture = {
  id: string;
  title: string;
  stage: OrfStage;
  flowStatus: ObjectiveFlowStatus;
  lootSubmittedAt: "present" | "absent";
};

export type PeerReviewForbiddenLootFixture = {
  body: string;
  submittedBy: string;
};

export async function upsertPeerReviewForbiddenTarget(input: {
  fixture: PeerReviewForbiddenTargetFixture;
  teamId: string;
  challengers: string[];
  createdBy?: string;
  updatedBy?: string;
}) {
  await upsertTestObjective({
    id: input.fixture.id,
    title: input.fixture.title,
    teamId: input.teamId,
    stage: input.fixture.stage,
    flowStatus: input.fixture.flowStatus,
    status: "Draft",
    challengers: uniqueMembers(input.challengers),
    createdBy: input.createdBy,
    updatedBy: input.updatedBy,
  });

  await db
    .update(objectives)
    .set({
      challengers: uniqueMembers(input.challengers),
      lootSubmittedAt: input.fixture.lootSubmittedAt === "present" ? nowIso() : null,
      acceptedResult: null,
      objectiveSettlementPoints: null,
      updatedAt: today(),
    })
    .where(eq(objectives.id, input.fixture.id));

  return peerReviewTargetFromObjective(input.fixture.id);
}

export async function createPeerReviewForbiddenLoot(
  target: PeerReviewTarget,
  fixture: PeerReviewForbiddenLootFixture,
): Promise<PeerReviewLoot> {
  const objective = await readObjective(target.objective.id);
  if (!objective) {
    throw new Error("目标不存在，无法创建匿名互评反向用例前置战利品");
  }

  const id = `loot-testd-peer-review-forbidden-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const submittedByUserId = await requiredTestUserIdForTeam({
    teamId: objective.teamId,
    preferredName: fixture.submittedBy,
    preferredUserId: objective.createdBy ?? objective.updatedBy,
    purpose: "成员提交匿名互评反向用例前置战利品",
  });

  await db.insert(objectiveLoot).values({
    id,
    teamId: objective.teamId,
    objectiveId: objective.id,
    submittedBy: fixture.submittedBy,
    submittedByUserId,
    body: fixture.body,
    resultClaims: [],
    selfTestReportUrl: null,
    selfTestReportBody: null,
    submittedAt: nowIso(),
  });

  return { id, objectiveId: objective.id, body: fixture.body };
}

export async function deletePeerReviewForbiddenTargets(fixtures: readonly PeerReviewForbiddenTargetFixture[]) {
  for (const fixture of fixtures) {
    await deleteTestObjectives({ id: fixture.id, title: fixture.title });
  }
}

export async function deletePeerReviewForbiddenLoots(fixtures: readonly PeerReviewForbiddenLootFixture[]) {
  for (const fixture of fixtures) {
    await db.delete(objectiveLoot).where(eq(objectiveLoot.body, fixture.body));
  }
}

export async function deletePeerReviewForbiddenReviews(input: {
  targets: readonly PeerReviewForbiddenTargetFixture[];
  reviewers: readonly string[];
}) {
  const targetIds = input.targets.map((target) => target.id);
  const reviewers = uniqueMembers(input.reviewers);
  if (targetIds.length === 0 || reviewers.length === 0) return;

  await db
    .delete(objectiveContributionReviews)
    .where(and(inArray(objectiveContributionReviews.objectiveId, targetIds), inArray(objectiveContributionReviews.reviewer, reviewers)));
}

export async function peerReviewForbiddenTargetsAbsent(fixtures: readonly PeerReviewForbiddenTargetFixture[]) {
  for (const fixture of fixtures) {
    if (!(await testObjectiveAbsent({ id: fixture.id, title: fixture.title }))) {
      return false;
    }
  }
  return true;
}

export async function peerReviewForbiddenLootsAbsent(fixtures: readonly PeerReviewForbiddenLootFixture[]) {
  for (const fixture of fixtures) {
    if ((await readLootByBody(fixture.body)) !== null) {
      return false;
    }
  }
  return true;
}

export async function peerReviewForbiddenReviewsAbsent(input: {
  targets: readonly PeerReviewForbiddenTargetFixture[];
  reviewers: readonly string[];
}) {
  const targetIds = input.targets.map((target) => target.id);
  const reviewers = uniqueMembers(input.reviewers);
  if (targetIds.length === 0 || reviewers.length === 0) return true;

  const rows = await db
    .select({ id: objectiveContributionReviews.id })
    .from(objectiveContributionReviews)
    .where(and(inArray(objectiveContributionReviews.objectiveId, targetIds), inArray(objectiveContributionReviews.reviewer, reviewers)));
  return rows.length === 0;
}

export async function peerReviewForbiddenTargetMatchesFixture(
  fixture: PeerReviewForbiddenTargetFixture,
  challengers?: readonly string[],
) {
  const objective = await readObjective(fixture.id);
  if (!objective) {
    return false;
  }

  const lootSubmittedAtMatches = fixture.lootSubmittedAt === "present" ? Boolean(objective.lootSubmittedAt) : !objective.lootSubmittedAt;
  const challengersMatch = challengers ? sameMembers(objective.challengers, challengers) : true;
  return (
    objective.stage === fixture.stage &&
    objective.flowStatus === fixture.flowStatus &&
    lootSubmittedAtMatches &&
    challengersMatch
  );
}

export async function peerReviewForbiddenTargetsMatchFixtures(
  fixtures: readonly PeerReviewForbiddenTargetFixture[],
  challengersByTargetId: ReadonlyMap<string, readonly string[]>,
) {
  for (const fixture of fixtures) {
    if (!(await peerReviewForbiddenTargetMatchesFixture(fixture, challengersByTargetId.get(fixture.id)))) {
      return false;
    }
  }
  return true;
}

export async function peerReviewForbiddenLootPresent(target: PeerReviewTarget, loot: PeerReviewLoot) {
  const row = await readLootByBody(loot.body);
  return !!row && row.id === loot.id && row.objectiveId === target.objective.id;
}

export async function peerReviewForbiddenLootsPresent(items: ReadonlyArray<{
  target: PeerReviewTarget;
  loot: PeerReviewLoot;
}>) {
  for (const item of items) {
    if (!(await peerReviewForbiddenLootPresent(item.target, item.loot))) {
      return false;
    }
  }
  return true;
}

export async function expectPeerReviewForbiddenTargetPanelsVisible(
  page: Page,
  fixtures: readonly PeerReviewForbiddenTargetFixture[],
) {
  for (const fixture of fixtures) {
    await expect(objectivePanel(page, fixture)).toBeVisible();
  }
}

export async function expectPeerReviewForbiddenTargetPanelsAbsent(
  page: Page,
  fixtures: readonly PeerReviewForbiddenTargetFixture[],
) {
  for (const fixture of fixtures) {
    await expect(objectivePanel(page, fixture)).toHaveCount(0);
  }
}

export async function expectSubmitPeerReviewActionsAbsent(
  page: Page,
  fixtures: readonly PeerReviewForbiddenTargetFixture[],
) {
  for (const fixture of fixtures) {
    await expect(submitPeerReviewAction(page, fixture)).toHaveCount(0);
  }
}

export async function workbenchContainsPeerReviewForbiddenTargets(
  page: Page,
  input: {
    fixtures: readonly PeerReviewForbiddenTargetFixture[];
    scope: "mine" | "all";
  },
) {
  const response = await page.evaluate(async (scope) => {
    const result = await fetch(`/api/my-challenges?scope=${encodeURIComponent(scope)}`, {
      credentials: "include",
    });
    return {
      status: result.status,
      body: await result.json().catch(() => ({})),
    };
  }, input.scope);

  if (response.status !== 200) {
    return false;
  }

  const objectivesValue = typeof response.body === "object" && response.body !== null
    ? (response.body as { objectives?: unknown }).objectives
    : undefined;
  const rows = Array.isArray(objectivesValue) ? objectivesValue : [];
  return input.fixtures.every((fixture) =>
    rows.some((item) => {
      if (typeof item !== "object" || item === null) {
        return false;
      }
      const objective = item as { id?: unknown; title?: unknown };
      return objective.id === fixture.id || objective.title === fixture.title;
    }),
  );
}

export async function workbenchExcludesPeerReviewForbiddenTargets(
  page: Page,
  input: {
    fixtures: readonly PeerReviewForbiddenTargetFixture[];
    scope: "mine" | "all";
  },
) {
  return !(await workbenchContainsPeerReviewForbiddenTargets(page, input));
}

function objectivePanel(page: Page, fixture: PeerReviewForbiddenTargetFixture) {
  return page.locator("section.orf-objective-panel").filter({ hasText: fixture.title }).first();
}

function submitPeerReviewAction(page: Page, fixture: PeerReviewForbiddenTargetFixture) {
  return objectivePanel(page, fixture).getByRole("link", { name: "提交匿名互评" }).first();
}

async function readLootByBody(body: string) {
  const [row] = await db.select({ id: objectiveLoot.id, objectiveId: objectiveLoot.objectiveId }).from(objectiveLoot).where(eq(objectiveLoot.body, body)).limit(1);
  return row ?? null;
}

async function readObjective(objectiveId: string) {
  const [row] = await db
    .select({
      id: objectives.id,
      teamId: objectives.teamId,
      stage: objectives.stage,
      flowStatus: objectives.flowStatus,
      challengers: objectives.challengers,
      lootSubmittedAt: objectives.lootSubmittedAt,
      createdBy: objectives.createdBy,
      updatedBy: objectives.updatedBy,
    })
    .from(objectives)
    .where(eq(objectives.id, objectiveId))
    .limit(1);

  return row ?? null;
}

function sameMembers(left: readonly string[], right: readonly string[]) {
  const normalize = (items: readonly string[]) => [...new Set(items.map((item) => item.trim()).filter(Boolean))].sort();
  const leftItems = normalize(left);
  const rightItems = normalize(right);
  return leftItems.length === rightItems.length && leftItems.every((item, index) => item === rightItems[index]);
}

function uniqueMembers(members: readonly string[]) {
  return Array.from(new Set(members.map((member) => member.trim()).filter(Boolean)));
}

function nowIso() {
  return new Date().toISOString();
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
