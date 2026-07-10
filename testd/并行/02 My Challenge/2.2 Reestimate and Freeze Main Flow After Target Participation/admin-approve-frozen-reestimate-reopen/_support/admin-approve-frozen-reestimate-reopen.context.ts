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

export type ObjectiveTargetData = {
  title: string;
  stage: OrfStage;
  flowStatus: ObjectiveFlowStatus;
  finalDueOffsetDays?: number;
};

export type MetricData = {
  title: string;
  difficulty: Extract<UncertaintyLevel, "进阶">;
  score: 30;
};

export type AdminApproveFrozenReestimateReopenCaseData = {
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
  frozenTarget: ObjectiveTargetData;
  reestimateTarget: ObjectiveTargetData;
  metric: MetricData;
  frozenReestimateKind: Extract<ObjectiveAlignmentRequestKind, "frozenReestimate">;
  reestimateCompletionKind: Extract<ObjectiveAlignmentRequestKind, "reestimateCompletion">;
  requestedStatus: Extract<ObjectiveAlignmentRequestStatus, "requested">;
  completedStatus: Extract<ObjectiveAlignmentRequestStatus, "completed">;
  reason: string;
  reopenDueOffsetHours: 1;
};

export type MyChallengeApiObjective = {
  id: string;
  title: string;
  stage: OrfStage;
  flowStatus: ObjectiveFlowStatus;
  confirmedAt?: string | null;
  confirmationDueAt?: string | null;
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
  note?: string | null;
};

export type MyChallengesApiData = {
  objectives: MyChallengeApiObjective[];
  results: MyChallengeApiResult[];
  objectiveAlignmentRequests: MyChallengeApiAlignmentRequest[];
};

export type { TestObjectiveFixtureRecord, TestUserAccountRecord };
