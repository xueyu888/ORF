import type { BrowserContext, Page } from "@playwright/test";
import type { PermissionKey } from "../../../../../../src/config/permissions";
import type { PermissionRule, UserRole, UserStatus } from "../../../../../../src/types/orf";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type MemberCreateTargetForbiddenCaseData = {
  memberEmail: string;
  memberPassword: string;
  memberName: string;
  memberRole: Extract<UserRole, "member">;
  memberStatus: Extract<UserStatus, "active">;
  objectiveTitle: string;
  createObjectivePermissionKey: Extract<PermissionKey, "objective.create">;
};

export type MemberPermissionSnapshot = {
  role: Extract<UserRole, "member">;
  permissionRules: PermissionRule[];
};
