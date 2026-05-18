import type { BrowserContext, Page } from "@playwright/test";

export const ORY_ADMIN_URL = (process.env.ORY_ADMIN_URL ?? "http://127.0.0.1:4434").replace(/\/+$/, "");
export const ORF_SESSION_COOKIE = "orf_ory_session";
export const TEST_EMAIL = "orf-login-e2e@orf.local";
export const TEST_PASSWORD = "OrfLoginE2E!2026";
export const TEST_NAME = "ORF Login E2E";
export const TEST_USER_ID = "user-orf-login-e2e";
export const TEST_TEAM_ID = "team-orf-login-e2e";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type OryIdentity = {
  id: string;
  schema_id?: string;
  traits?: {
    email?: string;
    name?: {
      first?: string;
      last?: string;
    };
  };
};

export type BrowserSession = {
  status: number;
  body: {
    authenticated: boolean;
    user: null | {
      email: string;
      role: string;
    };
  };
};

export type BrowserAuthStorageState = {
  localStorageAuthKeys: string[];
  sessionStorageAuthKeys: string[];
};

export type SetupState = {
  identityId: string;
  teamId: string;
  userId: string;
  previousLastLoginAt: string | null;
};

export type ActionResult = {
  ok: boolean;
  status: number;
  body: BrowserSession["body"];
};
