import type { BrowserContext, Page } from "@playwright/test";
import type { VisualBackgroundsData } from "../../../src/state/apiClient";

export type BackgroundSettingsTestContext = {
  context: BrowserContext;
  page: Page;
};

export type BackgroundSettingsCaseData = {
  email: string;
  password: string;
  name: string;
  role: "member" | "admin";
};

export type BackgroundSnapshots = {
  login_background: VisualBackgroundsData;
  sidebar_background: VisualBackgroundsData;
  userSettingsFile: {
    existed: boolean;
    content: string | null;
  };
};

export type ApiAttemptResult = {
  skipped?: boolean;
  status?: number;
  body?: unknown;
};
