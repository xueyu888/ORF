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

export type MemberReestimateCompleteRequestCaseData = {
  memberEmail: string;
  memberPassword: string;
  memberName: string;
  memberRole: Extract<UserRole, "member">;
  memberStatus: Extract<UserStatus, "active">;
  targetPrefix: string;
  target: ReestimateObjectiveTargetData;
  metricTitle: string;
  metricDifficulty: Extract<UncertaintyLevel, "进阶">;
  alignmentKind: Extract<ObjectiveAlignmentRequestKind, "reestimateCompletion">;
  alignmentStatus: Extract<ObjectiveAlignmentRequestStatus, "requested">;
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
};

export type MyChallengeApiAlignmentRequest = {
  id: string;
  objectiveId: string;
  kind: ObjectiveAlignmentRequestKind;
  status: ObjectiveAlignmentRequestStatus;
  requestedByUserId: string;
};

export type MyChallengesApiData = {
  objectives: MyChallengeApiObjective[];
  results: MyChallengeApiResult[];
  objectiveAlignmentRequests: MyChallengeApiAlignmentRequest[];
};

export type { TestObjectiveFixtureRecord, TestUserAccountRecord };
