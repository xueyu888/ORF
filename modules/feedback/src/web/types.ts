export type {
  FeedbackIssueReadModelData,
  FeedbackSubscription,
  FeedbackSubscriptionMode,
  FeedbackWebActivityItem,
  FeedbackWebAttachment,
  FeedbackWebCommentAttachment,
  FeedbackWebCommentMessage,
  FeedbackWebCommentThread,
  FeedbackWebIssue,
  FeedbackWebProject,
  FeedbackWebRelation,
  FeedbackWebUser,
  FeedbackWebUserRole,
  FeedbackWebUserStatus,
  FeedbackWebUserSummary,
} from "../contracts";

export { emptyFeedbackIssueReadModelData } from "../contracts";

export type FeedbackWebProjectChatChannel = {
  displayName: string;
  id: string;
};

export type FeedbackWebFilterPreferenceRecord = {
  values: Record<string, string | string[]>;
  version: 1;
};

export type FeedbackWebUserPreferences = {
  filterPreferences: Record<string, FeedbackWebFilterPreferenceRecord | null | undefined>;
  userId: string;
};
