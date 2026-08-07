import type { CommentThread, Feedback, OrfProject, OrfUser } from "../types/orf";

export type FeedbackIssueReadModelData = {
  comments: CommentThread[];
  feedback: Feedback[];
  projects: OrfProject[];
  users: OrfUser[];
};

export const emptyFeedbackIssueReadModelData: FeedbackIssueReadModelData = {
  comments: [],
  feedback: [],
  projects: [],
  users: [],
};
