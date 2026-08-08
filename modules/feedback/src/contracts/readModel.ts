import type {
  FeedbackActivityType,
  FeedbackCapabilities,
  FeedbackImpact,
  FeedbackPriority,
  FeedbackRelationType,
  FeedbackResolution,
  FeedbackStage,
  FeedbackSubscriptionMode,
} from "./index";

export type FeedbackWebUserRole = "admin" | "member";
export type FeedbackWebUserStatus = "active" | "disabled" | "pending" | "rejected";

export type FeedbackWebUser = {
  avatarUrl?: string | null;
  email?: string;
  id: string;
  name: string;
  role: FeedbackWebUserRole;
  status: FeedbackWebUserStatus;
};

export type FeedbackWebUserSummary = {
  avatarUrl?: string | null;
  id: string;
  name: string;
};

export type FeedbackWebProject = {
  createdAt: string;
  id: string;
  name: string;
  updatedAt: string;
};

export type FeedbackWebAttachment = {
  contentUrl: string;
  downloadUrl: string;
  fileName: string;
  fileSize: number;
  id: string;
  mimeType: string;
  previewKind: "download" | "image" | "markdown" | "pdf" | "text";
  previewStatus?: "failed" | "ready" | "unavailable";
  previewUrl?: string;
};

export type FeedbackWebActivityItem = {
  actorUserId?: string | null;
  activityType: FeedbackActivityType;
  at: string;
  id: string;
  payload: Record<string, unknown>;
  sequence: number;
};

export type FeedbackWebRelation = {
  createdAt: string;
  createdBy?: string | null;
  id: string;
  sourceFeedbackId: string;
  targetFeedbackId: string;
  type: FeedbackRelationType;
};

export type FeedbackWebIssue = {
  activity: FeedbackWebActivityItem[];
  assigneeUserId?: string | null;
  capabilities: FeedbackCapabilities;
  causeCategories: string[];
  closedAt?: string | null;
  closedByUserId?: string | null;
  createdAt: string;
  createdBy: string;
  description: string;
  id: string;
  impact: FeedbackImpact;
  lastActivityByUserId?: string | null;
  lastActivitySequence: number;
  lastSeenSequence: number;
  priority: FeedbackPriority | null;
  projectId?: string | null;
  relations: FeedbackWebRelation[];
  reportAttachments: FeedbackWebAttachment[];
  requiresAction: boolean;
  resolution: FeedbackResolution | null;
  stage: FeedbackStage;
  title: string;
  unread: boolean;
  updatedAt: string;
  updatedBy?: string | null;
  version: number;
};

export type FeedbackWebCommentAttachment = FeedbackWebAttachment;

export type FeedbackWebCommentMessage = {
  attachments?: FeedbackWebCommentAttachment[];
  author: string;
  authorAvatarUrl?: string | null;
  authorUserId?: string | null;
  body: string;
  createdAt: string;
  id: string;
  parentMessageId?: string | null;
  replyToAuthor?: string | null;
  replyToMessageId?: string | null;
};

export type FeedbackWebCommentThread = {
  createdAt: string;
  createdBy?: string | null;
  id: string;
  messages: FeedbackWebCommentMessage[];
  status: string;
  targetId: string;
  targetTitle: string;
  targetType: "feedback" | string;
  updatedAt: string;
};

export type FeedbackIssueReadModelData = {
  comments: FeedbackWebCommentThread[];
  feedback: FeedbackWebIssue[];
  projects: FeedbackWebProject[];
  users: FeedbackWebUser[];
};

export type FeedbackReferenceCardQuery = {
  activityId?: string | null;
  commentMessageId?: string | null;
  feedbackId: string;
};

export type FeedbackReferenceCardData = {
  activity?: FeedbackWebActivityItem | null;
  comment?: FeedbackWebCommentMessage | null;
  feedback: FeedbackWebIssue;
  project?: FeedbackWebProject | null;
  thread?: FeedbackWebCommentThread | null;
  users: FeedbackWebUser[];
};

export const emptyFeedbackIssueReadModelData: FeedbackIssueReadModelData = {
  comments: [],
  feedback: [],
  projects: [],
  users: [],
};

export function feedbackReferenceCardDataFromReadModel(
  data: FeedbackIssueReadModelData,
  query: FeedbackReferenceCardQuery,
): FeedbackReferenceCardData | null {
  const feedbackId = query.feedbackId.trim();
  if (!feedbackId) return null;
  const feedback = data.feedback.find((item) => item.id === feedbackId);
  if (!feedback) return null;

  const activityId = query.activityId?.trim();
  const commentMessageId = query.commentMessageId?.trim();
  const activity = activityId ? feedback.activity.find((item) => item.id === activityId) ?? null : null;
  if (activityId && !activity) return null;

  const thread = commentMessageId
    ? data.comments.find((item) => item.targetType === "feedback" && item.targetId === feedbackId && item.messages.some((message) => message.id === commentMessageId)) ?? null
    : null;
  const comment = thread?.messages.find((message) => message.id === commentMessageId) ?? null;
  if (commentMessageId && !comment) return null;
  if (commentMessageId && activity && !feedbackActivityReferencesComment(activity, commentMessageId)) return null;

  const userIds = new Set<string>();
  addOptionalUserId(userIds, feedback.createdBy);
  addOptionalUserId(userIds, feedback.updatedBy);
  addOptionalUserId(userIds, feedback.assigneeUserId);
  addOptionalUserId(userIds, feedback.closedByUserId);
  addOptionalUserId(userIds, activity?.actorUserId);
  for (const message of thread?.messages ?? []) {
    addOptionalUserId(userIds, message.authorUserId);
  }

  return {
    activity,
    comment,
    feedback,
    project: feedback.projectId ? data.projects.find((project) => project.id === feedback.projectId) ?? null : null,
    thread,
    users: data.users.filter((user) => userIds.has(user.id)),
  };
}

function feedbackActivityReferencesComment(activity: FeedbackWebActivityItem, commentMessageId: string) {
  if (activity.activityType !== "feedback.comment.created") return false;
  const payloadCommentMessageId = activity.payload.commentMessageId;
  return typeof payloadCommentMessageId === "string" && payloadCommentMessageId.trim() === commentMessageId;
}

function addOptionalUserId(userIds: Set<string>, userId: string | null | undefined) {
  const normalizedUserId = userId?.trim();
  if (normalizedUserId) {
    userIds.add(normalizedUserId);
  }
}

export type FeedbackSubscription = {
  mode: FeedbackSubscriptionMode;
};
