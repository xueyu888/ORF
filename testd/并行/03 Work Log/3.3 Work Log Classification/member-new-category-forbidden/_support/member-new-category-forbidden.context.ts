import type { BrowserContext, Page } from "@playwright/test";
import type { UserRole, UserStatus } from "../../../../../../src/types/orf";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type MemberNewCategoryForbiddenCaseData = {
  memberEmail: string;
  memberPassword: string;
  memberName: string;
  memberRole: Extract<UserRole, "member">;
  memberStatus: Extract<UserStatus, "active">;
  newCategory: string;
  logBodyMarker: string;
  logBody: string;
  expectedCategoryForbiddenMessage: string;
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
  categoryNameSnapshot: string | null;
  bodyMarkdown: string;
};

export type WorkLogSaveResultFixture = {
  status: number;
  body: unknown;
};
