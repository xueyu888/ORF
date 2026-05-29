import type { BrowserContext, Page } from "@playwright/test";
import type {
  LootForbiddenResultFixture,
  LootForbiddenTargetFixture,
} from "../../member-submit-loot/_support/member-submit-loot-forbidden.helpers";
import type { LootPrerequisiteResult, LootTarget } from "../../member-submit-loot/_support/member-submit-loot.context";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type MemberSubmitLootStageForbiddenCaseData = {
  email: string;
  password: string;
  name: string;
  role: "member";
  targets: {
    resultClaiming: LootForbiddenTargetFixture;
    reestimate: LootForbiddenTargetFixture;
  };
  results: {
    resultClaiming: LootForbiddenResultFixture;
    reestimate: LootForbiddenResultFixture;
  };
  lootBody: string;
};

export type StageForbiddenTarget = LootTarget;
export type StageForbiddenResult = LootPrerequisiteResult;
