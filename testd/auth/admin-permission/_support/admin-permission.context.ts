import type { BrowserContext, Page } from "@playwright/test";
import type { PermissionKey } from "../../../../src/config/permissions";
import type { PermissionRule } from "../../../../src/types/orf";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type AdminPermissionCaseData = {
  email: string;
  password: string;
  name: string;
  role: "admin";
  targetRole: "member";
  permissionKey: PermissionKey;
};

export type PermissionRulesResult = {
  status: number;
  body: {
    permissionRules?: PermissionRule[];
  };
};
