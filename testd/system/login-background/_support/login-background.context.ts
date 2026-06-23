import type { BrowserContext, Page } from "@playwright/test";
import type { VisualBackgroundConfig } from "../../../../src/domain/settings/visualBackgrounds";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type SystemLoginBackgroundUserData = {
  email: string;
  password: string;
  name: string;
  role: "admin";
};

export type SystemLoginBackgroundCaseData = {
  admin: SystemLoginBackgroundUserData;
  defaultLandingPath: string;
  settingsPath: string;
  uploadFileBaseName: string;
  switchIntervalMinutes: number;
};

export type StoredLoginBackgroundConfig = {
  config: VisualBackgroundConfig;
};

export type UploadedLoginBackground = {
  id: string;
  fileName: string;
  filePath: string;
  url: string;
};
