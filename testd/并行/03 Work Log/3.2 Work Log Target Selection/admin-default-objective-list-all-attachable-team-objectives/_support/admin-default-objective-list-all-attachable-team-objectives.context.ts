import type { BrowserContext, Page } from "@playwright/test";
import type { ObjectiveFlowStatus, OrfStage, UserRole, UserStatus, WorkStatus } from "../../../../../../src/types/orf";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type AdminDefaultObjectiveListAllAttachableTeamObjectivesCaseData = {
  adminEmail: string;
  adminPassword: string;
  adminName: string;
  adminRole: Extract<UserRole, "admin">;
  adminStatus: Extract<UserStatus, "active">;
  otherMemberEmail: string;
  otherMemberName: string;
  otherMemberRole: Extract<UserRole, "member">;
  otherMemberStatus: Extract<UserStatus, "active">;
  objectiveTitlePrefix: string;
  otherOpenObjectiveTitle: string;
  ownFrozenObjectiveTitle: string;
  acceptedObjectiveTitle: string;
  settledObjectiveTitle: string;
  closedObjectiveTitle: string;
  expectedObjectiveTitles: string[];
  openFlowStatus: Extract<ObjectiveFlowStatus, "open">;
  frozenFlowStatus: Extract<ObjectiveFlowStatus, "frozen">;
  acceptedFlowStatus: Extract<ObjectiveFlowStatus, "accepted">;
  settledFlowStatus: Extract<ObjectiveFlowStatus, "settled">;
  closedFlowStatus: Extract<ObjectiveFlowStatus, "closed">;
  resultClaimingStage: Extract<OrfStage, "resultClaiming">;
  goalFrozenStage: Extract<OrfStage, "goalFrozen">;
  objectiveStatus: Extract<WorkStatus, "On Track">;
};

export type ObjectiveFixtureExpectation = {
  title: string;
  teamId?: string;
  flowStatus: ObjectiveFlowStatus;
  challengerUserId?: string;
  excludedChallengerUserId?: string;
};

export type WorkLogObjectiveOptionFixture = {
  id: string;
  title: string;
  flowStatus: ObjectiveFlowStatus;
  isUserChallenger: boolean;
};
