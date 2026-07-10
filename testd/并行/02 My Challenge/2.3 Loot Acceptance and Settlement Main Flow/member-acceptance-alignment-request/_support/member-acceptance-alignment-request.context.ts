import type { BrowserContext, Page } from "@playwright/test";
import type {
  LootResultClaimStatus,
  ObjectiveAlignmentRequestKind,
  ObjectiveAlignmentRequestStatus,
  ObjectiveFlowStatus,
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

export type SubmittedObjectiveTargetData = {
  title: string;
  stage: Extract<OrfStage, "goalFrozen">;
  flowStatus: Extract<ObjectiveFlowStatus, "submitted">;
  finalDueOffsetDays: 8;
};

export type MetricData = {
  title: string;
  difficulty: Extract<UncertaintyLevel, "进阶">;
  score: 30;
  claim: Extract<LootResultClaimStatus, "completed">;
  finalEvidence: string;
};

export type FinalLootData = {
  body: string;
  selfTestReportBody: string;
};

export type MemberAcceptanceAlignmentRequestCaseData = {
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
  target: SubmittedObjectiveTargetData;
  metric: MetricData;
  finalLoot: FinalLootData;
  alignmentKind: Extract<ObjectiveAlignmentRequestKind, "acceptance">;
  alignmentStatus: Extract<ObjectiveAlignmentRequestStatus, "requested">;
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

export type MyChallengeApiAlignmentRequest = {
  id: string;
  objectiveId: string;
  kind: ObjectiveAlignmentRequestKind;
  status: ObjectiveAlignmentRequestStatus;
  requestedByUserId: string;
  proposedAt: string;
};

export type MyChallengesApiData = {
  objectives: MyChallengeApiObjective[];
  results: MyChallengeApiResult[];
  objectiveLoot: MyChallengeApiLoot[];
  objectiveAlignmentRequests: MyChallengeApiAlignmentRequest[];
};

export type { TestObjectiveFixtureRecord, TestUserAccountRecord };
