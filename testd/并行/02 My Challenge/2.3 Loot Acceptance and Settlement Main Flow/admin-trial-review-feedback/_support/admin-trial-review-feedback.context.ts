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
  difficulty: Extract<UncertaintyLevel, "进阶">;
  score: 30;
  claim: Extract<LootResultClaimStatus, "completed">;
  evidence: string;
};

export type TrialReviewData = {
  body: string;
  selfTestReportBody: string;
  initialStatus: Extract<ObjectiveTrialReviewStatus, "requested">;
  reviewedStatus: Extract<ObjectiveTrialReviewStatus, "approved">;
  commanderFeedback: string;
};

export type AdminTrialReviewFeedbackCaseData = {
  adminEmail: string;
  adminPassword: string;
  adminName: string;
  adminRole: Extract<UserRole, "admin">;
  adminStatus: Extract<UserStatus, "active">;
  memberEmail: string;
  memberPassword: string;
  memberName: string;
  memberRole: Extract<UserRole, "member">;
  memberStatus: Extract<UserStatus, "active">;
  targetPrefix: string;
  target: FrozenObjectiveTargetData;
  metric: MetricData;
  trialReview: TrialReviewData;
};

export type ChallengeApiObjective = {
  id: string;
  title: string;
  stage: OrfStage;
  flowStatus: ObjectiveFlowStatus;
  challengerUserIds?: string[];
};

export type ChallengeApiResult = {
  id: string;
  objectiveId: string;
  title: string;
  uncertaintyLevel?: UncertaintyLevel | null;
  uncertaintyScore: number;
};

export type ChallengeApiLoot = {
  id: string;
  objectiveId: string;
};

export type ChallengeApiTrialReview = {
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

export type ChallengesApiData = {
  objectives: ChallengeApiObjective[];
  results: ChallengeApiResult[];
  objectiveLoot: ChallengeApiLoot[];
  objectiveTrialReviews: ChallengeApiTrialReview[];
};

export type { TestObjectiveFixtureRecord, TestUserAccountRecord };
