import type { BrowserContext, Page } from "@playwright/test";
import type {
  LootResultClaimStatus,
  ObjectiveFlowStatus,
  ObjectiveTrialReviewStatus,
  OrfStage,
  UncertaintyLevel,
  UserRole,
  UserStatus,
} from "../../../../../../src/types/orf";
import type { TestObjectiveFixtureRecord, TestUserAccountRecord } from "../../../../../_operators/common.helpers";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type FrozenObjectiveTargetData = {
  title: string;
  stage: Extract<OrfStage, "goalFrozen">;
  flowStatus: Extract<ObjectiveFlowStatus, "frozen">;
  finalDueOffsetDays: 8;
};

export type MetricData = {
  title: string;
  difficulty: Extract<UncertaintyLevel, "进阶" | "破局">;
  score: 30 | 50;
  claim: Extract<LootResultClaimStatus, "completed">;
  evidence: string;
};

export type TrialReviewData = {
  body: string;
  selfTestReportBody: string;
  status: Extract<ObjectiveTrialReviewStatus, "requested">;
};

export type MemberFrozenTrialReviewSubmitCaseData = {
  memberEmail: string;
  memberPassword: string;
  memberName: string;
  memberRole: Extract<UserRole, "member">;
  memberStatus: Extract<UserStatus, "active">;
  targetPrefix: string;
  target: FrozenObjectiveTargetData;
  metrics: [MetricData, MetricData];
  trialReview: TrialReviewData;
};

export type MyChallengeApiObjective = {
  id: string;
  title: string;
  stage: OrfStage;
  flowStatus: ObjectiveFlowStatus;
  challengerUserIds?: string[];
};

export type MyChallengeApiResult = {
  id: string;
  objectiveId: string;
  title: string;
  uncertaintyLevel?: UncertaintyLevel | null;
  uncertaintyScore: number;
};

export type MyChallengeApiLoot = {
  id: string;
  objectiveId: string;
};

export type MyChallengeApiTrialReview = {
  id: string;
  objectiveId: string;
  requestedByUserId: string;
  body: string;
  resultClaims: Array<{
    resultId: string;
    claim: LootResultClaimStatus;
    evidenceText: string;
  }>;
  selfTestReportBody?: string | null;
  status: ObjectiveTrialReviewStatus;
};

export type MyChallengesApiData = {
  objectives: MyChallengeApiObjective[];
  results: MyChallengeApiResult[];
  objectiveLoot: MyChallengeApiLoot[];
  objectiveTrialReviews: MyChallengeApiTrialReview[];
};

export type { TestObjectiveFixtureRecord, TestUserAccountRecord };
