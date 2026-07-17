import type { BrowserContext, Page } from "@playwright/test";
import type {
  ObjectiveFlowStatus,
  OrfStage,
  Priority,
  ResultAcceptedResult,
  TaskStatus,
  UncertaintyLevel,
  UserRole,
  UserStatus,
} from "../../../../../../src/types/orf";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type ObjectiveStageTargetData = {
  key: string;
  title: string;
  stage: OrfStage;
  flowStatus: ObjectiveFlowStatus;
};

export type MetricItemData = {
  key: string;
  objectiveKey: string;
  title: string;
  modifiedTitle?: string;
  uncertaintyLevel: UncertaintyLevel;
  uncertaintyScore: number;
  acceptedResult: ResultAcceptedResult;
};

export type ActionItemData = {
  key: string;
  objectiveKey: string;
  title: string;
  modifiedTitle?: string;
  status: TaskStatus;
  priority: Priority;
};

export type MemberReestimateMetricActionPermissionsCaseData = {
  memberEmail: string;
  memberPassword: string;
  memberName: string;
  memberRole: Extract<UserRole, "member">;
  memberStatus: Extract<UserStatus, "active">;
  targetPrefix: string;
  metricPrefix: string;
  createdMetricPrefix: string;
  actionPrefix: string;
  createdActionPrefix: string;
  objective: ObjectiveStageTargetData;
  metrics: MetricItemData[];
  actions: ActionItemData[];
};

export type TestUserAccountRecord = {
  userId: string;
  teamId: string;
  email: string;
  name: string;
};
