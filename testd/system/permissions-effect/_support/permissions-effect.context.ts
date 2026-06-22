import type { BrowserContext, Page } from "@playwright/test";
import type { PermissionKey } from "../../../../src/config/permissions";
import type { PermissionRule } from "../../../../src/types/orf";
import type { CommentTarget } from "../../../comments/_support/comment.context";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type SystemPermissionsEffectUserData = {
  email: string;
  password: string;
  name: string;
  role: "admin" | "member";
};

export type SystemPermissionsEffectCaseData = {
  admin: SystemPermissionsEffectUserData & { role: "admin" };
  member: SystemPermissionsEffectUserData & { role: "member" };
  author: SystemPermissionsEffectUserData & { role: "member" };
  defaultLandingPath: string;
  permissionsPath: string;
  tasksPath: string;
  targetRole: "member";
  permissionKey: PermissionKey;
  objective: {
    id: string;
    title: string;
  };
  comment: {
    body: string;
    marker: string;
    targetType: "objective";
  };
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

export type CommentManageActionState = {
  editVisible: boolean;
  deleteVisible: boolean;
};

export type PermissionSwitchState = {
  checked: boolean;
};

export type PreparedCommentTarget = CommentTarget;
