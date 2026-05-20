import type { BrowserContext, Page } from "@playwright/test";

export const ORY_ADMIN_URL = (process.env.ORY_ADMIN_URL ?? "http://127.0.0.1:4434").replace(/\/+$/, "");
export const ORF_SESSION_COOKIE = "orf_ory_session";

export type BrowserTestContext = {
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

export type CapturedResponse = {
  ok: boolean;
  status: number;
  url: string;
  method: string;
  body: unknown;
};
