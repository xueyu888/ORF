import type { BrowserContext, Page } from "@playwright/test";
import type { FreezeForbiddenTargetFixture } from "../../admin-freeze-objective/_support/admin-freeze-objective-restrictions.helpers";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type AdminFreezeObjectiveMemberForbiddenCaseData = {
  email: string;
  password: string;
  name: string;
  role: "member";
  targets: {
    goalSetting: FreezeForbiddenTargetFixture;
    resultClaiming: FreezeForbiddenTargetFixture;
    reestimate: FreezeForbiddenTargetFixture;
    goalFrozen: FreezeForbiddenTargetFixture;
  };
  freezeResult: {
    title: string;
    metricName: string;
  };
};

export type MemberFreezeForbiddenTarget = {
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
