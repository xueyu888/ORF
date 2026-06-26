import type { BrowserContext, Page } from "@playwright/test";
import type { ObjectiveFlowStatus, ObjectiveStatus, OrfStage } from "../../../../../../src/types/orf";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type MemberEditObjectiveForbiddenCaseData = {
  memberEmail: string;
  memberPassword: string;
  memberName: string;
  memberRole: "member";
  objectiveId: string;
  objectiveTitle: string;
  editedObjectiveTitle: string;
  objectiveStatus: ObjectiveStatus;
};

export type MemberEditObjectiveForbiddenObjective = {
  id: string;
  teamId: string;
  title: string;
  flowStatus: ObjectiveFlowStatus;
  stage: OrfStage;
  challengerUserIds: string[];
  challengers: string[];
};

export type ObjectiveUpdateResponse = {
  ok: boolean;
  status: number;
  body: unknown;
};
