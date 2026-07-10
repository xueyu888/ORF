import type { BrowserContext, Page } from "@playwright/test";
import type { ObjectiveFlowStatus, OrfStage, UserRole, UserStatus } from "../../../../../../src/types/orf";
import type { TestUserAccountRecord } from "../../../../../_operators/common.helpers";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type ReestimateDueRatioTargetData = {
  title: string;
  stage: Extract<OrfStage, "resultClaiming">;
  flowStatus: Extract<ObjectiveFlowStatus, "recruiting">;
  finalDueOffsetDays: 8;
};

export type ReestimateDueRatioCaseData = {
  memberEmail: string;
  memberPassword: string;
  memberName: string;
  memberRole: Extract<UserRole, "member">;
  memberStatus: Extract<UserStatus, "active">;
  targetPrefix: string;
  target: ReestimateDueRatioTargetData;
};

export type ReestimateDueRatioObjectiveRecord = {
  id: string;
  title: string;
  stage: OrfStage;
  flowStatus: ObjectiveFlowStatus;
  finalDueAt: string;
  acceptedAt: string | null;
  confirmationDueAt: string | null;
  assignedChallengers: string[];
  assignedChallengerUserIds: string[];
  challengers: string[];
  challengerUserIds: string[];
};

export type MyChallengeApiObjective = {
  id: string;
  title: string;
  stage: OrfStage;
  flowStatus: ObjectiveFlowStatus;
  finalDueAt?: string | null;
  acceptedAt?: string | null;
  confirmationDueAt?: string | null;
  challengerUserIds?: string[];
};

export type MyChallengesApiData = {
  objectives: MyChallengeApiObjective[];
};

export type { TestUserAccountRecord };
