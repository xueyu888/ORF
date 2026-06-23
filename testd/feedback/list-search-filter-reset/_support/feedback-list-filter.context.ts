import type { BrowserContext, Page } from "@playwright/test";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type FeedbackFixture = {
  id: string;
  phenomenon: string;
  category: string;
  status: "Open" | "Closed";
};

export type FeedbackListFilterCaseData = {
  email: string;
  password: string;
  name: string;
  role: "admin";
  feedbackPath: string;
  missingKeyword: string;
  existingKeyword: string;
  fixtureRows: FeedbackFixture[];
  openPhenomena: string[];
  closedPhenomena: string[];
  allPhenomena: string[];
  technicalPhenomena: string[];
  technicalExcludedPhenomena: string[];
  managementPhenomena: string[];
  managementExcludedPhenomena: string[];
  processPhenomena: string[];
  processExcludedPhenomena: string[];
  permissionPhenomena: string[];
  permissionExcludedPhenomena: string[];
  experiencePhenomena: string[];
  experienceExcludedPhenomena: string[];
  technicalOpenPhenomenon: string;
  technicalClosedPhenomenon: string;
};
