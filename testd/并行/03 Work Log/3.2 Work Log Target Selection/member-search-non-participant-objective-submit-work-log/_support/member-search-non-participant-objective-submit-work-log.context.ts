import type { BrowserContext, Page } from "@playwright/test";
import type { ObjectiveFlowStatus, OrfStage, UserRole, UserStatus, WorkStatus } from "../../../../../../src/types/orf";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type MemberSearchNonParticipantObjectiveSubmitWorkLogCaseData = {
  memberEmail: string;
  memberPassword: string;
  memberName: string;
  memberRole: Extract<UserRole, "member">;
  memberStatus: Extract<UserStatus, "active">;
  otherMemberEmail: string;
  otherMemberName: string;
  otherMemberRole: Extract<UserRole, "member">;
  otherMemberStatus: Extract<UserStatus, "active">;
  objectiveTitle: string;
  objectiveFlowStatus: Extract<ObjectiveFlowStatus, "open">;
  objectiveStage: Extract<OrfStage, "resultClaiming">;
  objectiveStatus: Extract<WorkStatus, "On Track">;
  nonParticipantNotice: string;
  logBodyMarker: string;
  logBody: string;
  durationMinutes: number;
  progressEstimatePercent: number;
  remainingEstimatePercent: number;
  expectedDurationLabel: string;
  expectedProgressLabel: string;
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

export type WorkLogEntryFixture = {
  id: string;
  authorUserId: string;
  workDate: string;
  objectiveIdSnapshot: string | null;
  objectiveTitleSnapshot: string | null;
  bodyMarkdown: string;
  durationMinutes: number | null;
  remainingEstimatePercent: number | null;
};
