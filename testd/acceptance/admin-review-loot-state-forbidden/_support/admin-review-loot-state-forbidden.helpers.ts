import type { Page } from "@playwright/test";
import type {
  ReviewLootForbiddenLoot,
  ReviewLootForbiddenResult,
  ReviewLootForbiddenTarget,
} from "../../admin-review-loot/_support/admin-review-loot-forbidden.helpers";
import {
  asReviewLootForbiddenLoot,
  asReviewLootForbiddenLootFixture,
  asReviewLootForbiddenResult,
  asReviewLootForbiddenResultFixture,
  asReviewLootForbiddenTarget,
  asReviewLootForbiddenTargetFixture,
  createReviewLootForbiddenLoot,
  createReviewLootForbiddenResult,
  deleteReviewLootForbiddenLedger,
  deleteReviewLootForbiddenLoots,
  deleteReviewLootForbiddenResults,
  deleteReviewLootForbiddenTargets,
  expectReviewLootActionsAbsent,
  expectReviewLootForbiddenTargetPanelsVisible,
  reviewLootForbiddenLedgerAbsent,
  reviewLootForbiddenLootPresent,
  reviewLootForbiddenLootsAbsent,
  reviewLootForbiddenResultPresent,
  reviewLootForbiddenResultsAbsent,
  reviewLootForbiddenTargetsAbsent,
  reviewLootForbiddenTargetsMatchFixtures,
  upsertReviewLootForbiddenTarget,
  workbenchContainsReviewLootForbiddenTargets,
} from "../../admin-review-loot/_support/admin-review-loot-forbidden.helpers";
import type { AdminReviewLootStateForbiddenCaseData } from "./admin-review-loot-state-forbidden.context";

export {
  asReviewLootForbiddenLoot,
  asReviewLootForbiddenLootFixture,
  asReviewLootForbiddenResult,
  asReviewLootForbiddenResultFixture,
  asReviewLootForbiddenTarget,
  asReviewLootForbiddenTargetFixture,
  createReviewLootForbiddenLoot,
  createReviewLootForbiddenResult,
  deleteReviewLootForbiddenLedger,
  deleteReviewLootForbiddenLoots,
  deleteReviewLootForbiddenResults,
  deleteReviewLootForbiddenTargets,
  expectReviewLootActionsAbsent,
  expectReviewLootForbiddenTargetPanelsVisible,
  reviewLootForbiddenLedgerAbsent,
  reviewLootForbiddenLootPresent,
  reviewLootForbiddenLootsAbsent,
  reviewLootForbiddenResultPresent,
  reviewLootForbiddenResultsAbsent,
  reviewLootForbiddenTargetsAbsent,
  reviewLootForbiddenTargetsMatchFixtures,
  upsertReviewLootForbiddenTarget,
  workbenchContainsReviewLootForbiddenTargets,
};

export function stateTargetFixtures(data: AdminReviewLootStateForbiddenCaseData) {
  return [
    data.targets.resultClaiming,
    data.targets.reestimate,
    data.targets.frozen,
    data.targets.settled,
  ];
}

export function stateResultFixtures(data: AdminReviewLootStateForbiddenCaseData) {
  return [data.result];
}

export function stateLootFixtures(data: AdminReviewLootStateForbiddenCaseData) {
  return [data.loot.settled];
}

export function stateLedgerReasons(data: AdminReviewLootStateForbiddenCaseData) {
  return [data.reason];
}

export function stateTargetChallengers(data: AdminReviewLootStateForbiddenCaseData) {
  return [data.challengerName];
}

export function stateTargetChallengersByTargetId(data: AdminReviewLootStateForbiddenCaseData) {
  return new Map(stateTargetFixtures(data).map((fixture) => [fixture.id, stateTargetChallengers(data)]));
}

export async function adminWorkbenchContainsStateTargets(page: Page, data: AdminReviewLootStateForbiddenCaseData) {
  return workbenchContainsReviewLootForbiddenTargets(page, {
    fixtures: stateTargetFixtures(data),
    scope: "all",
  });
}

export function requireStateForbiddenTarget(value: unknown): ReviewLootForbiddenTarget {
  return asReviewLootForbiddenTarget(value);
}

export function requireStateForbiddenResult(value: unknown): ReviewLootForbiddenResult {
  return asReviewLootForbiddenResult(value);
}

export function requireStateForbiddenLoot(value: unknown): ReviewLootForbiddenLoot {
  return asReviewLootForbiddenLoot(value);
}
