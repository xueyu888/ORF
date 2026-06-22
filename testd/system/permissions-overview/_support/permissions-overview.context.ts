import type { BrowserContext, Page } from "@playwright/test";
import type { PermissionKey } from "../../../../src/config/permissions";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type SystemPermissionsOverviewAdminData = {
  email: string;
  password: string;
  name: string;
  role: "admin";
};

export type SystemPermissionsOverviewPermissionData = {
  permissionKey: PermissionKey;
  category: string;
  label: string;
  location: string;
};

export type SystemPermissionsOverviewCaseData = {
  admin: SystemPermissionsOverviewAdminData;
  defaultLandingPath: string;
  permissionsPath: string;
  permissions: {
    objectiveCreate: SystemPermissionsOverviewPermissionData;
    commentManage: SystemPermissionsOverviewPermissionData;
    chatRead: SystemPermissionsOverviewPermissionData;
  };
};
