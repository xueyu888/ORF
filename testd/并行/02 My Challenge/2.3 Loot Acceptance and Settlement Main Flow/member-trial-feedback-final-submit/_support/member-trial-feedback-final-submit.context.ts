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

export type SubmittedObjectiveTargetData = {
  title: string;
  stage: Extract<OrfStage, "goalFrozen">;
  flowStatus: Extract<ObjectiveFlowStatus, "submitted">;
  finalDueOffsetDays: 8;
};

export type ObjectiveTargetStateData = FrozenObjectiveTargetData | SubmittedObjectiveTargetData;

export type MetricData = {
  title: string;
  difficulty: Extract<UncertaintyLevel, "进阶" | "破局">;
  score: 30 | 50;
  claim: Extract<LootResultClaimStatus, "completed">;
  trialEvidence: string;
  finalEvidence: string;
};

export type TrialReviewData = {
  body: string;
  selfTestReportBody: string;
  status: Extract<ObjectiveTrialReviewStatus, "approved">;
  commanderFeedback: string;
};

export type FinalLootData = {
  body: string;
  selfTestReportBody: string;
};

export type MemberTrialFeedbackFinalSubmitCaseData = {
  memberEmail: string;
  memberPassword: string;
  memberName: string;
  memberRole: Extract<UserRole, "member">;
  memberStatus: Extract<UserStatus, "active">;
  adminEmail: string;
  adminPassword: string;
  adminName: string;
  adminRole: Extract<UserRole, "admin">;
  adminStatus: Extract<UserStatus, "active">;
  targetPrefix: string;
  target: FrozenObjectiveTargetData;
  submittedTarget: SubmittedObjectiveTargetData;
  metrics: [MetricData, MetricData];
  trialReview: TrialReviewData;
  finalLoot: FinalLootData;
};

export type MyChallengeApiObjective = {
  id: string;
  title: string;
  stage: OrfStage;
  flowStatus: ObjectiveFlowStatus;
  challengerUserIds?: string[];
  lootSubmittedAt?: string | null;
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
  submittedByUserId: string;
  body: string;
  resultClaims: Array<{
    resultId: string;
    claim: LootResultClaimStatus;
    evidenceText: string;
  }>;
  selfTestReportBody?: string | null;
  submittedAt: string;
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
  commanderFeedback?: string | null;
  reviewedByUserId?: string | null;
  reviewedAt?: string | null;
};

export type MyChallengesApiData = {
  objectives: MyChallengeApiObjective[];
  results: MyChallengeApiResult[];
  objectiveLoot: MyChallengeApiLoot[];
  objectiveTrialReviews: MyChallengeApiTrialReview[];
};

export type { TestObjectiveFixtureRecord, TestUserAccountRecord };
