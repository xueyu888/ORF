import type { BrowserContext, Page } from "@playwright/test";
import type { FreezeForbiddenTargetFixture } from "../../admin-freeze-objective/_support/admin-freeze-objective-restrictions.helpers";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type AdminFreezeObjectiveAdminStageForbiddenCaseData = {
  email: string;
  password: string;
  name: string;
  role: "admin";
  targets: {
    goalSetting: FreezeForbiddenTargetFixture;
    resultClaiming: FreezeForbiddenTargetFixture;
    goalFrozen: FreezeForbiddenTargetFixture;
  };
  results: {
    goalSetting: FreezePrerequisiteResultInput;
    resultClaiming: FreezePrerequisiteResultInput;
    goalFrozen: FreezePrerequisiteResultInput;
  };
};

export type FreezePrerequisiteResultInput = {
  title: string;
  metricName: string;
};

export type AdminStageForbiddenTarget = {
  objective: {
    id: string;
    title: string;
    flowStatus: string;
  };
};

export type FreezePrerequisiteResult = {
  id: string;
  objectiveId: string;
  title: string;
  metricName: string;
};
