import type { BrowserContext, Page } from "@playwright/test";
import type { ObjectiveFlowStatus, OrfStage, UserRole, UserStatus, WorkStatus } from "../../../../../../src/types/orf";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type DefaultObjectiveListCurrentMemberParticipatedIncompleteCaseData = {
  memberEmail: string;
  memberPassword: string;
  memberName: string;
  memberRole: Extract<UserRole, "member">;
  memberStatus: Extract<UserStatus, "active">;
  otherMemberEmail: string;
  otherMemberName: string;
  otherMemberRole: Extract<UserRole, "member">;
  otherMemberStatus: Extract<UserStatus, "active">;
  objectiveTitlePrefix: string;
  participatedOpenObjectiveTitle: string;
  otherOpenObjectiveTitle: string;
  participatedAcceptedObjectiveTitle: string;
  openFlowStatus: Extract<ObjectiveFlowStatus, "open">;
  acceptedFlowStatus: Extract<ObjectiveFlowStatus, "accepted">;
  objectiveStage: Extract<OrfStage, "resultClaiming">;
  objectiveStatus: Extract<WorkStatus, "On Track">;
};

export type ObjectiveFixtureExpectation = {
  title: string;
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
