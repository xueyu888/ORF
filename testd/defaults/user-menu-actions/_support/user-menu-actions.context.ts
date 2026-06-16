import type { BrowserContext, Page } from "@playwright/test";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type UserMenuActionsCaseData = {
  avatarUser: {
    email: string;
    password: string;
    name: string;
    role: "member";
  };
  noAvatarUser: {
    email: string;
    password: string;
    name: string;
    role: "member";
  };
  defaultLandingPath: string;
  homePath: string;
};
