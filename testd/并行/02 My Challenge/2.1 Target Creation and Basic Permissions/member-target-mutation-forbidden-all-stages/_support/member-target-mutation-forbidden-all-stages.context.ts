import type { BrowserContext, Page } from "@playwright/test";
import type { PermissionKey } from "../../../../../../src/config/permissions";
import type { ObjectiveFlowStatus, OrfStage, PermissionRule, UserRole, UserStatus } from "../../../../../../src/types/orf";
import type { TestObjectiveFixtureRecord, TestUserAccountRecord } from "../../../../../_operators/common.helpers";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type ObjectiveStageTargetData = {
  key: "goalSetting" | "resultClaiming" | "orfReestimate" | "goalFrozen";
  title: string;
  stage: OrfStage;
  flowStatus: ObjectiveFlowStatus;
};

export type MemberTargetMutationForbiddenAllStagesCaseData = {
  memberEmail: string;
  memberPassword: string;
  memberName: string;
  memberRole: Extract<UserRole, "member">;
  memberStatus: Extract<UserStatus, "active">;
  targetPrefix: string;
  modifiedObjectiveTitle: string;
  deleteObjectivePermissionKey: Extract<PermissionKey, "objective.delete">;
  stageTargets: ObjectiveStageTargetData[];
};

export type MemberPermissionSnapshot = {
  role: Extract<UserRole, "member">;
  permissionRules: PermissionRule[];
};

export type ObjectiveMutationRequestResult = {
  objectiveId: string;
  status: number;
  forbidden: boolean;
};

export type ObjectiveDeleteUiResult = {
  dialogCount: number;
};

export type { TestObjectiveFixtureRecord, TestUserAccountRecord };
