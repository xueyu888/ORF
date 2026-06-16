import type { BrowserContext, Page } from "@playwright/test";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type GlobalSearchCaseData = {
  email: string;
  password: string;
  name: string;
  role: "admin";
  defaultLandingPath: string;
  homePath: string;
  pageKeyword: string;
  fixtureKeyword: string;
  objective: {
    id: string;
    title: string;
  };
  result: {
    id: string;
    title: string;
  };
  task: {
    id: string;
    title: string;
  };
  feedback: {
    id: string;
    phenomenon: string;
  };
};
