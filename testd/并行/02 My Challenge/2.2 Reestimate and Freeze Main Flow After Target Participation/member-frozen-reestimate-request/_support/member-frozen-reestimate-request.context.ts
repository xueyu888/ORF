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
};

export type MemberFrozenReestimateRequestCaseData = {
  memberEmail: string;
  memberPassword: string;
  memberName: string;
  memberRole: Extract<UserRole, "member">;
  memberStatus: Extract<UserStatus, "active">;
  targetPrefix: string;
  target: FrozenObjectiveTargetData;
  metric: MetricData;
  alignmentKind: Extract<ObjectiveAlignmentRequestKind, "frozenReestimate">;
  requestedStatus: Extract<ObjectiveAlignmentRequestStatus, "requested">;
  reason: string;
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
  note?: string | null;
};

export type MyChallengesApiData = {
  objectives: MyChallengeApiObjective[];
  results: MyChallengeApiResult[];
  objectiveAlignmentRequests: MyChallengeApiAlignmentRequest[];
};

export type { TestObjectiveFixtureRecord, TestUserAccountRecord };
