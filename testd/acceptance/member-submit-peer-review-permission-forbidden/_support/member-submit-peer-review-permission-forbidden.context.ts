import type { BrowserContext, Page } from "@playwright/test";
import type {
  PeerReviewForbiddenLootFixture,
  PeerReviewForbiddenTargetFixture,
} from "../../member-submit-peer-review/_support/member-submit-peer-review-forbidden.helpers";
import type { PeerReviewLoot, PeerReviewTarget } from "../../member-submit-peer-review/_support/member-submit-peer-review.context";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type MemberSubmitPeerReviewPermissionForbiddenCaseData = {
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
  collaboratorName: string;
  target: PeerReviewForbiddenTargetFixture;
  loot: PeerReviewForbiddenLootFixture;
};

export type PermissionForbiddenTarget = PeerReviewTarget;
export type PermissionForbiddenLoot = PeerReviewLoot;
