import type { BrowserContext, Page } from "@playwright/test";
import type {
  PersonalBackgroundsData,
  VisualBackgroundConfig,
  VisualBackgroundImage,
  VisualBackgroundsData,
} from "../../../src/state/apiClient";

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

export type FileSnapshot = {
  existed: boolean;
  content: string | null;
};

export type DirectorySnapshot = {
  existed: boolean;
  files: Array<{
    relativePath: string;
    content: Buffer;
  }>;
};

export type BackgroundSnapshots = {
  login_background: VisualBackgroundsData;
  sidebar_background: VisualBackgroundsData;
  topbar_background: VisualBackgroundsData;
  systemSettingsFile: FileSnapshot;
  legacySystemSettingsFile: FileSnapshot;
  loginBackgroundSystemDirectory: DirectorySnapshot;
  sidebarBackgroundSystemDirectory: DirectorySnapshot;
  topbarBackgroundSystemDirectory: DirectorySnapshot;
  lockOwner: string;
};

export type PersonalSettingsSnapshot = {
  userId: string;
  userSettingsDirectory: DirectorySnapshot;
};

export type ApiAttemptResult = {
  skipped?: boolean;
  status?: number;
  body?: unknown;
};

export type PersonalBackgroundUploadResult = VisualBackgroundImage;

export type VisualBackgroundConfigByScene = {
  scene: "login_background" | "sidebar_background" | "topbar_background";
  config: VisualBackgroundConfig;
};

export type PersonalBackgroundsApiResult = ApiAttemptResult & {
  body?: {
    code?: number;
    message?: string;
    data?: PersonalBackgroundsData;
  };
};
