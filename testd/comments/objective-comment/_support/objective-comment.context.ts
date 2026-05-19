import type { BrowserContext, Page } from "@playwright/test";

export const ORY_ADMIN_URL = (process.env.ORY_ADMIN_URL ?? "http://127.0.0.1:4434").replace(/\/+$/, "");
export const ORF_SESSION_COOKIE = "orf_ory_session";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type ObjectiveCommentCaseData = {
  email: string;
  password: string;
  name: string;
  role: "admin" | "member";
  commentBody: string;
  commentBodyPrefix: string;
};

export type ObjectiveCommentTarget = {
  type: "objective";
  id: string;
  title: string;
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

export type MyChallengesObjective = {
  id: string;
  title: string;
};

export type MyChallengesCommentMessage = {
  id: string;
  author: string;
  body: string;
  createdAt: string;
  parentMessageId?: string;
  replyToMessageId?: string;
  replyToAuthor?: string;
};

export type MyChallengesCommentThread = {
  id: string;
  targetType: string;
  targetId: string;
  targetTitle: string;
  status: string;
  messages: MyChallengesCommentMessage[];
};

export type MyChallengesData = {
  objectives?: MyChallengesObjective[];
  comments?: MyChallengesCommentThread[];
};

export type MyChallengesResponse = {
  status: number;
  body: MyChallengesData;
};
