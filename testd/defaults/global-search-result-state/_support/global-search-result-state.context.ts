import type { BrowserContext, Page } from "@playwright/test";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type GlobalSearchResultStateCaseData = {
  email: string;
  password: string;
  name: string;
  role: "admin";
  defaultLandingPath: string;
  homePath: string;
  fixtureKeyword: string;
  missingKeyword: string;
  objective: {
    id: string;
    title: string;
    detailPathPattern: string;
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
