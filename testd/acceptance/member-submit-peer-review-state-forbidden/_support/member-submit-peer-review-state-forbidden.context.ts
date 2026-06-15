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

export type MemberSubmitPeerReviewStateForbiddenCaseData = {
  email: string;
  password: string;
  name: string;
  role: "member";
  collaboratorName: string;
  targets: {
    resultClaiming: PeerReviewForbiddenTargetFixture;
    reestimate: PeerReviewForbiddenTargetFixture;
    frozen: PeerReviewForbiddenTargetFixture;
    submitted: PeerReviewForbiddenTargetFixture;
    settled: PeerReviewForbiddenTargetFixture;
  };
  loot: {
    submitted: PeerReviewForbiddenLootFixture;
    settled: PeerReviewForbiddenLootFixture;
  };
};

export type StateForbiddenTarget = PeerReviewTarget;
export type StateForbiddenLoot = PeerReviewLoot;
