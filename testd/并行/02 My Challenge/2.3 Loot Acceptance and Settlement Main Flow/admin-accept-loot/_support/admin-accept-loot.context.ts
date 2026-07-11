import type { BrowserContext, Page } from "@playwright/test";
import type {
  LootResultClaimStatus,
  ObjectiveAcceptedResult,
  ObjectiveAlignmentRequestKind,
  ObjectiveAlignmentRequestStatus,
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

export type SubmittedObjectiveTargetData = {
  title: string;
  stage: Extract<OrfStage, "goalFrozen">;
  flowStatus: Extract<ObjectiveFlowStatus, "submitted">;
  finalDueOffsetDays: 8;
};

export type AcceptedObjectiveTargetData = {
  title: string;
  stage: Extract<OrfStage, "goalFrozen">;
  flowStatus: Extract<ObjectiveFlowStatus, "accepted">;
  finalDueOffsetDays: 8;
};

export type ObjectiveTargetStateData = SubmittedObjectiveTargetData | AcceptedObjectiveTargetData;

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

export type AdminAcceptLootCaseData = {
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
  target: SubmittedObjectiveTargetData;
  acceptedTarget: AcceptedObjectiveTargetData;
  metric: MetricData;
  finalLoot: FinalLootData;
  alignmentKind: Extract<ObjectiveAlignmentRequestKind, "acceptance">;
  alignmentStatus: Extract<ObjectiveAlignmentRequestStatus, "requested">;
  completedAlignmentStatus: Extract<ObjectiveAlignmentRequestStatus, "completed">;
  alignmentNote: string;
  alignmentFeedback: string;
  acceptanceResult: Extract<ObjectiveAcceptedResult, "completed">;
  reviewReason: string;
};

export type ChallengeApiObjective = {
  id: string;
  title: string;
  stage: OrfStage;
  flowStatus: ObjectiveFlowStatus;
  challengerUserIds?: string[];
  acceptedAt?: string | null;
  lootSubmittedAt?: string | null;
  acceptedResult?: ObjectiveAcceptedResult | null;
};

export type ChallengeApiResult = {
  id: string;
  objectiveId: string;
  title: string;
  uncertaintyLevel?: UncertaintyLevel | null;
  uncertaintyScore: number;
  acceptedResult: ResultAcceptedResult;
};

export type ChallengeApiLoot = {
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

export type ChallengeApiAcceptanceReview = {
  id: string;
  objectiveId: string;
  lootId: string;
  reviewerUserId: string;
  acceptedResult: ObjectiveAcceptedResult;
  resultReviews: Array<{ resultId: string; acceptedResult: ResultAcceptedResult }>;
  reason?: string | null;
  reviewedAt: string;
};

export type ChallengeApiAlignmentRequest = {
  id: string;
  objectiveId: string;
  kind: ObjectiveAlignmentRequestKind;
  requestedByUserId: string;
  status: ObjectiveAlignmentRequestStatus;
  proposedAt: string;
  note?: string | null;
  commanderFeedback?: string | null;
  reviewedByUserId?: string | null;
  reviewedAt?: string | null;
};

export type ChallengesApiData = {
  objectives: ChallengeApiObjective[];
  results: ChallengeApiResult[];
  objectiveLoot: ChallengeApiLoot[];
  objectiveAcceptanceReviews: ChallengeApiAcceptanceReview[];
  objectiveAlignmentRequests: ChallengeApiAlignmentRequest[];
};

export type { TestObjectiveFixtureRecord, TestUserAccountRecord };
