import type { BrowserContext, Page } from "@playwright/test";
import type { PermissionRule } from "../../../../src/types/orf";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type MemberPermissionForbiddenCaseData = {
  email: string;
  password: string;
  name: string;
  role: "member";
  targetRole: "member";
};

export type MemberPermissionSnapshot = {
  permissionRules: PermissionRule[];
};
