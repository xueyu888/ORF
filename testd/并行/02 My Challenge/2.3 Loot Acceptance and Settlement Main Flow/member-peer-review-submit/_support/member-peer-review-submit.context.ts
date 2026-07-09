import type { BrowserContext, Page } from "@playwright/test";
import type {
  ContributionReviewMetricRow,
  LootResultClaimStatus,
  ObjectiveAcceptedResult,
  ObjectiveFlowStatus,
  OrfStage,
  ResultAcceptedResult,
  UncertaintyLevel,
  UserRole,
  UserStatus,
} from "../../../../../../src/types/orf";
import type { TestObjectiveFixtureRecord, TestUserAccountRecord } from "../../../../../_operators/common.helpers";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type AcceptedObjectiveTargetData = {
  title: string;
  stage: Extract<OrfStage, "goalFrozen">;
  flowStatus: Extract<ObjectiveFlowStatus, "accepted">;
  finalDueOffsetDays: 8;
};

export type MetricData = {
  title: string;
  difficulty: Extract<UncertaintyLevel, "进阶">;
  score: 30;
  claim: Extract<LootResultClaimStatus, "completed">;
  finalEvidence: string;
  acceptedResult: Extract<ResultAcceptedResult, "completed">;
};

export type FinalLootData = {
  body: string;
  selfTestReportBody: string;
};

export type PeerReviewInputData = {
  memberPercent: 60;
  teammatePercent: 40;
  totalPercent: 100;
};

export type MemberPeerReviewSubmitCaseData = {
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
  teammateEmail: string;
  teammatePassword: string;
  teammateName: string;
  teammateRole: Extract<UserRole, "member">;
  teammateStatus: Extract<UserStatus, "active">;
  targetPrefix: string;
  target: AcceptedObjectiveTargetData;
  metric: MetricData;
  finalLoot: FinalLootData;
  acceptanceResult: Extract<ObjectiveAcceptedResult, "completed">;
  acceptanceReviewReason: string;
  peerReview: PeerReviewInputData;
};

export type MyChallengeApiObjective = {
  id: string;
  title: string;
  stage: OrfStage;
  flowStatus: ObjectiveFlowStatus;
  challengerUserIds?: string[];
  acceptedAt?: string | null;
  lootSubmittedAt?: string | null;
  acceptedResult?: ObjectiveAcceptedResult | null;
};

export type MyChallengesApiData = {
  objectives: MyChallengeApiObjective[];
};

export type LocalSettlementReviewResponse = {
  draft: unknown | null;
  objectiveId: string;
  review: LocalSettlementReview | null;
};

export type LocalSettlementReview =
  | {
      allocations?: Array<{ member: string; memberUserId: string; ratio: number }>;
      metricRows?: ContributionReviewMetricRow[];
      metricScores?: unknown[];
      receivedAt?: string;
      reviewer: string;
      reviewerUserId: string;
      status: "scored";
      submittedAt: string;
    }
  | {
      abstentionReason: string;
      receivedAt?: string;
      reviewer: string;
      reviewerUserId: string;
      status: "abstained";
      submittedAt: string;
    };

export type { TestObjectiveFixtureRecord, TestUserAccountRecord };
