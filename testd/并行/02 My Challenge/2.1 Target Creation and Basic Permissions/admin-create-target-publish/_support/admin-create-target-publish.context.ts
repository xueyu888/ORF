import type { BrowserContext, Page } from "@playwright/test";
import type { ObjectiveFlowStatus, OrfStage, UserRole, UserStatus } from "../../../../../../src/types/orf";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type AdminCreateTargetPublishCaseData = {
  adminEmail: string;
  adminPassword: string;
  adminName: string;
  adminRole: Extract<UserRole, "admin">;
  adminStatus: Extract<UserStatus, "active">;
  objectiveTitle: string;
};

export type AdminCreateTargetPublishObjective = {
  id: string;
  title: string;
  flowStatus: ObjectiveFlowStatus;
  stage: OrfStage;
  publishedAt: string | null;
};
