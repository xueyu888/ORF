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

export type MemberSubmitLootPermissionForbiddenCaseData = {
  adminEmail: string;
  adminPassword: string;
  adminName: string;
  adminRole: "admin";
  memberEmail: string;
  memberPassword: string;
  memberName: string;
  memberRole: "member";
  cleanupEmails: string[];
  challengerName: string;
  target: LootForbiddenTargetFixture;
  result: LootForbiddenResultFixture;
  lootBody: string;
};

export type PermissionForbiddenTarget = LootTarget;
export type PermissionForbiddenResult = LootPrerequisiteResult;
