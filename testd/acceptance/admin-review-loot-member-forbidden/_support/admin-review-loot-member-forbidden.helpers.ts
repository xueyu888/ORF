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
  reviewLootForbiddenResultUnreviewed,
  reviewLootForbiddenResultsAbsent,
  reviewLootForbiddenTargetMatchesFixture,
  reviewLootForbiddenTargetsAbsent,
  reviewLootForbiddenTargetsMatchFixtures,
  upsertReviewLootForbiddenTarget,
  workbenchContainsReviewLootForbiddenTargets,
} from "../../admin-review-loot/_support/admin-review-loot-forbidden.helpers";
import type { AdminReviewLootMemberForbiddenCaseData } from "./admin-review-loot-member-forbidden.context";

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
  reviewLootForbiddenResultUnreviewed,
  reviewLootForbiddenResultsAbsent,
  reviewLootForbiddenTargetMatchesFixture,
  reviewLootForbiddenTargetsAbsent,
  reviewLootForbiddenTargetsMatchFixtures,
  upsertReviewLootForbiddenTarget,
  workbenchContainsReviewLootForbiddenTargets,
};

export function memberTargetFixtures(data: AdminReviewLootMemberForbiddenCaseData) {
  return [data.target];
}

export function memberResultFixtures(data: AdminReviewLootMemberForbiddenCaseData) {
  return [data.result];
}

export function memberLootFixtures(data: AdminReviewLootMemberForbiddenCaseData) {
  return [data.loot];
}

export function memberLedgerReasons(data: AdminReviewLootMemberForbiddenCaseData) {
  return [data.reason];
}

export function memberTargetChallengers(data: AdminReviewLootMemberForbiddenCaseData) {
  return [data.name];
}

export function memberTargetChallengersByTargetId(data: AdminReviewLootMemberForbiddenCaseData) {
  return new Map(memberTargetFixtures(data).map((fixture) => [fixture.id, memberTargetChallengers(data)]));
}

export async function memberWorkbenchContainsTarget(page: Page, data: AdminReviewLootMemberForbiddenCaseData) {
  return workbenchContainsReviewLootForbiddenTargets(page, {
    fixtures: memberTargetFixtures(data),
    scope: "mine",
  });
}

export function requireMemberForbiddenTarget(value: unknown): ReviewLootForbiddenTarget {
  return asReviewLootForbiddenTarget(value);
}

export function requireMemberForbiddenResult(value: unknown): ReviewLootForbiddenResult {
  return asReviewLootForbiddenResult(value);
}

export function requireMemberForbiddenLoot(value: unknown): ReviewLootForbiddenLoot {
  return asReviewLootForbiddenLoot(value);
}
