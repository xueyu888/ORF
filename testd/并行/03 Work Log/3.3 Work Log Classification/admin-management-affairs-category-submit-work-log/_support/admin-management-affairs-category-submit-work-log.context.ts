import type { BrowserContext, Page } from "@playwright/test";
import type { UserRole, UserStatus } from "../../../../../../src/types/orf";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type AdminManagementAffairsCategorySubmitWorkLogCaseData = {
  adminEmail: string;
  adminPassword: string;
  adminName: string;
  adminRole: Extract<UserRole, "admin">;
  adminStatus: Extract<UserStatus, "active">;
  teamId: string;
  teamName: string;
  logBodyMarker: string;
  logBody: string;
};

export type WorkLogCategoryFixture = {
  id: string;
  teamId: string;
  name: string;
  createdByUserId: string | null;
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
