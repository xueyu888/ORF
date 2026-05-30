import type { BrowserContext, Page } from "@playwright/test";
import type { CommentTargetType, ObjectiveFlowStatus, TaskStatus, Priority } from "../../../src/types/orf";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type CommentTargetKind = Extract<CommentTargetType, "objective" | "task">;

export type CommentCaseData = {
  email: string;
  password: string;
  name: string;
  role: "admin" | "member";
  secondaryEmail?: string;
  secondaryPassword?: string;
  secondaryName?: string;
  secondaryRole?: "admin" | "member";
  objectiveId: string;
  objectiveTitle: string;
  taskId: string;
  taskTitle: string;
  commentTargetType: CommentTargetKind;
  commentBodyMarker: string;
  commentBody?: string;
  rootCommentBody?: string;
  replyBody?: string;
  editedCommentBody?: string;
  imageFileName?: string;
  invalidFileName?: string;
};

export type CommentTarget = {
  type: CommentTargetKind;
  id: string;
  title: string;
  objectiveId: string;
};

export type CommentTask = {
  id: string;
  title: string;
  linkedObjectiveId: string;
  status: TaskStatus;
  priority: Priority;
};

export type FixtureComment = {
  threadId: string;
  messageId: string;
  messageApiPath: string;
  body: string;
  target: CommentTarget;
};

export type MockImageFile = {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
};

export type MyChallengesCommentAttachment = {
  id: string;
  fileName: string;
  contentUrl: string;
};

export type MyChallengesCommentMessage = {
  id: string;
  author: string;
  body: string;
  attachments?: MyChallengesCommentAttachment[];
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
  objectives?: Array<{ id: string; title: string }>;
  tasks?: Array<{ id: string; title: string; linkedObjectiveId: string }>;
  comments?: MyChallengesCommentThread[];
};

export type MyChallengesResponse = {
  status: number;
  body: MyChallengesData;
};
