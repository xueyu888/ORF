import type { BrowserContext, Page } from "@playwright/test";
import type { PermissionKey } from "../../../../src/config/permissions";
import type { PermissionRule } from "../../../../src/types/orf";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type SystemPermissionsConfigUserData = {
  email: string;
  password: string;
  name: string;
};

export type SystemPermissionsConfigCaseData = {
  admin: SystemPermissionsConfigUserData & { role: "admin" };
  memberA: SystemPermissionsConfigUserData & { role: "member" };
  memberB: SystemPermissionsConfigUserData & { role: "member" };
  defaultLandingPath: string;
  permissionsPath: string;
  targetRole: "member";
  adminRole: "admin";
  permissionKey: PermissionKey;
};

export type PermissionRulesResult = {
  status: number;
  body: {
    permissionRules?: PermissionRule[];
  };
};

export type CurrentAccessResult = {
  status: number;
  body: {
    permissions?: PermissionKey[];
  };
};
