import type { BrowserContext, Page } from "@playwright/test";
import type {
  ReviewLootForbiddenLoot,
  ReviewLootForbiddenLootFixture,
  ReviewLootForbiddenResult,
  ReviewLootForbiddenResultFixture,
  ReviewLootForbiddenTarget,
  ReviewLootForbiddenTargetFixture,
} from "../../admin-review-loot/_support/admin-review-loot-forbidden.helpers";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type AdminReviewLootStateForbiddenCaseData = {
  email: string;
  password: string;
  name: string;
  role: "admin";
  challengerName: string;
  targets: {
    resultClaiming: ReviewLootForbiddenTargetFixture;
    reestimate: ReviewLootForbiddenTargetFixture;
    frozen: ReviewLootForbiddenTargetFixture;
    settled: ReviewLootForbiddenTargetFixture;
  };
  result: ReviewLootForbiddenResultFixture;
  loot: {
    settled: ReviewLootForbiddenLootFixture;
  };
  reason: string;
};

export type StateForbiddenTarget = ReviewLootForbiddenTarget;
export type StateForbiddenResult = ReviewLootForbiddenResult;
export type StateForbiddenLoot = ReviewLootForbiddenLoot;
