import type { BrowserContext, Page } from "@playwright/test";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type PersonalSettingsSavePersistenceCaseData = {
  email: string;
  password: string;
  name: string;
  role: "member";
  status: "active";
  settingsPathPattern: string;
  defaultLandingLabel: "系统默认";
  savedLandingLabel: "反馈";
  sidebarDefaultLabel: "系统默认";
  savedSidebarLabel: "折叠";
  chatThemeDefaultLabel: "经典浅色";
  savedChatThemeLabel: "舒适暗色";
};
