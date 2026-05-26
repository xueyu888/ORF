import type { BrowserContext, Page } from "@playwright/test";
import type { UserRole, UserStatus } from "../../../../src/types/orf";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type AdminEditMemberCaseData = {
  adminEmail: string;
  adminPassword: string;
  adminRole: "admin";
  targetUserId: string;
  originalName: string;
  originalEmail: string;
  originalRole: "member";
  updatedName: string;
  updatedEmail: string;
  updatedRole: "admin";
};

export type EditableMemberRecord = {
  id: string;
  teamId: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
};
