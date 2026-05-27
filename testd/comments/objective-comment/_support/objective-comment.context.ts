import type { BrowserContext, Page } from "@playwright/test";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type ObjectiveCommentCaseData = {
  email: string;
  password: string;
  name: string;
  role: "admin";
  objectiveId: string;
  objectiveTitle: string;
  commentBody: string;
  commentBodyPrefix: string;
};

export type ObjectiveCommentTarget = {
  type: "objective";
  id: string;
  title: string;
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
