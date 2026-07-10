import type { BrowserContext, Page } from "@playwright/test";
import type {
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

export type ReestimateObjectiveTargetData = {
  title: string;
  stage: Extract<OrfStage, "orfReestimate">;
  flowStatus: Extract<ObjectiveFlowStatus, "reestimating">;
};

export type UncalibratedMetricData = {
  title: string;
};

export type MemberReapplyReestimateAfterRejectCaseData = {
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
  target: ReestimateObjectiveTargetData;
  metric: UncalibratedMetricData;
  metricDifficulty: Extract<UncertaintyLevel, "进阶">;
  metricScore: 30;
  alignmentKind: Extract<ObjectiveAlignmentRequestKind, "reestimateCompletion">;
  requestedStatus: Extract<ObjectiveAlignmentRequestStatus, "requested">;
  needsWorkStatus: Extract<ObjectiveAlignmentRequestStatus, "needsWork">;
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

export type MyChallengeApiAlignmentRequest = {
  id: string;
  objectiveId: string;
  kind: ObjectiveAlignmentRequestKind;
  status: ObjectiveAlignmentRequestStatus;
  requestedByUserId: string;
  reviewedByUserId?: string | null;
};

export type MyChallengesApiData = {
  objectives: MyChallengeApiObjective[];
  results: MyChallengeApiResult[];
  objectiveAlignmentRequests: MyChallengeApiAlignmentRequest[];
};

export type { TestObjectiveFixtureRecord, TestUserAccountRecord };
