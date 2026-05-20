import type { BrowserContext, Page } from "@playwright/test";
import type { VisualBackgroundsData } from "../../../../src/state/apiClient";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type BackgroundPermissionCaseData = {
  email: string;
  password: string;
  name: string;
  role: "member";
};

export type BackgroundSnapshots = {
  login_background: VisualBackgroundsData;
  sidebar_background: VisualBackgroundsData;
};

export type ApiAttemptResult = {
  skipped?: boolean;
  status?: number;
  body?: unknown;
};
