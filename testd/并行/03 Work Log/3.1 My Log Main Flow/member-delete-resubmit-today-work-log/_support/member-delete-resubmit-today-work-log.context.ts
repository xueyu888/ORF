import type { BrowserContext, Page } from "@playwright/test";
import type { ObjectiveFlowStatus, OrfStage, UserRole, UserStatus, WorkStatus } from "../../../../../../src/types/orf";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type MemberDeleteResubmitTodayWorkLogCaseData = {
  memberEmail: string;
  memberPassword: string;
  memberName: string;
  memberRole: Extract<UserRole, "member">;
  memberStatus: Extract<UserStatus, "active">;
  objectiveTitle: string;
  objectiveFlowStatus: Extract<ObjectiveFlowStatus, "open">;
  objectiveStage: Extract<OrfStage, "resultClaiming">;
  objectiveStatus: Extract<WorkStatus, "On Track">;
  originalLogBodyMarker: string;
  originalLogBody: string;
  originalDurationMinutes: number;
  originalProgressEstimatePercent: number;
  originalRemainingEstimatePercent: number;
  originalExpectedDurationLabel: string;
  originalExpectedProgressLabel: string;
  resubmittedLogBodyMarker: string;
  resubmittedLogBody: string;
  resubmittedProgressEstimatePercent: number;
  resubmittedRemainingEstimatePercent: number;
  resubmittedExpectedProgressLabel: string;
};

export type WorkLogObjectiveFixture = {
  id: string;
  teamId: string;
  title: string;
  flowStatus: ObjectiveFlowStatus;
};

export type TestUserAccountFixture = {
  userId: string;
  teamId: string;
  name: string;
  email: string;
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
