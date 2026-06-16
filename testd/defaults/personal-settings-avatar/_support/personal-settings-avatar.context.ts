import type { BrowserContext, Page } from "@playwright/test";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type PersonalSettingsAvatarCaseData = {
  manageUser: {
    email: string;
    password: string;
    name: string;
    role: "member";
    status: "active";
  };
  noAvatarUser: {
    email: string;
    password: string;
    name: string;
    role: "member";
    status: "active";
  };
  defaultLandingPath: string;
  settingsPathPattern: string;
  validAvatarFileName: string;
  invalidAvatarFileName: string;
  invalidAvatarMessage: string;
};
