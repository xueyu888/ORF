import type { BrowserContext, Page } from "@playwright/test";
import type { PermissionKey } from "../../../../../../src/config/permissions";
import type { ObjectiveFlowStatus, OrfStage, UserRole, UserStatus } from "../../../../../../src/types/orf";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type ObjectiveStageTargetData = {
  key: string;
  title: string;
  modifiedTitle?: string;
  stage: OrfStage;
  flowStatus: ObjectiveFlowStatus;
};

export type AdminReviewAcceptedSettledEditNoDeleteCaseData = {
  adminEmail: string;
  adminPassword: string;
  adminName: string;
  adminRole: Extract<UserRole, "admin">;
  adminStatus: Extract<UserStatus, "active">;
  targetPrefix: string;
  modifiedTargetPrefix: string;
  deleteObjectivePermissionKey: Extract<PermissionKey, "objective.delete">;
  originalTargets: ObjectiveStageTargetData[];
  editTargets: ObjectiveStageTargetData[];
};

export type TestUserAccountRecord = {
  userId: string;
  teamId: string;
  email: string;
  name: string;
};

export type ObjectiveRecord = {
  id: string;
  title: string;
  stage: OrfStage;
  flowStatus: ObjectiveFlowStatus;
};

export type LockedDeleteResult = {
  title: string;
  status: number;
  body: unknown;
};
