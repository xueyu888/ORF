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

export type AdminReviewLootMemberForbiddenCaseData = {
  email: string;
  password: string;
  name: string;
  role: "member";
  target: ReviewLootForbiddenTargetFixture;
  result: ReviewLootForbiddenResultFixture;
  loot: ReviewLootForbiddenLootFixture;
  reason: string;
};

export type MemberForbiddenTarget = ReviewLootForbiddenTarget;
export type MemberForbiddenResult = ReviewLootForbiddenResult;
export type MemberForbiddenLoot = ReviewLootForbiddenLoot;
