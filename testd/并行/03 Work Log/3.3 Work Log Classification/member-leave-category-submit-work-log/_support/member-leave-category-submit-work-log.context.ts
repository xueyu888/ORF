import type { BrowserContext, Page } from "@playwright/test";
import type { UserRole, UserStatus } from "../../../../../../src/types/orf";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type MemberLeaveCategorySubmitWorkLogCaseData = {
  memberEmail: string;
  memberPassword: string;
  memberName: string;
  memberRole: Extract<UserRole, "member">;
  memberStatus: Extract<UserStatus, "active">;
  logBodyMarker: string;
  logBody: string;
};

export type WorkLogCategoryOptionFixture = {
  id: string;
  name: string;
  source: string;
};

export type WorkLogEntryFixture = {
  id: string;
  authorUserId: string;
  workDate: string;
  objectiveIdSnapshot: string | null;
  objectiveTitleSnapshot: string | null;
  categoryIdSnapshot: string | null;
  categoryNameSnapshot: string | null;
  bodyMarkdown: string;
  durationMinutes: number | null;
  remainingEstimatePercent: number | null;
};
