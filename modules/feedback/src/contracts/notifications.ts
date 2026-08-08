import { feedbackCommentPath, feedbackIssuePath } from "./links";

export type FeedbackNotificationEventKind =
  | "feedback.assignee.changed"
  | "feedback.assignee.digest"
  | "feedback.comment.created"
  | "feedback.created"
  | "feedback.lifecycle.changed";

export type FeedbackNotificationProjectSnapshot = {
  readonly id: string;
  readonly name: string;
} | null;

export type FeedbackNotificationEventPlan = {
  actorName: string;
  actorUserId?: string | null;
  body: string;
  kind: FeedbackNotificationEventKind;
  metadata: Record<string, string>;
  recipientUserIds: string[];
  targetHref: string;
  targetId: string;
  targetType: "feedback";
  teamId: string;
  title: string;
};

export function planFeedbackCreatedNotification(input: {
  readonly actorName: string;
  readonly actorUserId: string;
  readonly assigneeName?: string | null;
  readonly feedbackId: string;
  readonly project: FeedbackNotificationProjectSnapshot;
  readonly recipientUserIds: readonly string[];
  readonly teamId: string;
  readonly title: string;
}): FeedbackNotificationEventPlan {
  return {
    actorName: input.actorName,
    actorUserId: input.actorUserId,
    body: `${input.actorName} 创建了反馈「${input.title}」${input.assigneeName ? `，处理人：${input.assigneeName}` : ""}。`,
    kind: "feedback.created",
    metadata: {
      assignee: input.assigneeName ?? "",
      feedbackTitle: input.title,
      ...feedbackProjectNotificationMetadata(input.project),
    },
    recipientUserIds: [...input.recipientUserIds],
    targetHref: feedbackNotificationTargetHref(input.feedbackId),
    targetId: input.feedbackId,
    targetType: "feedback",
    teamId: input.teamId,
    title: "新的反馈 issue",
  };
}

export function planFeedbackLifecycleChangedNotification(input: {
  readonly actorName: string;
  readonly actorUserId: string;
  readonly feedbackId: string;
  readonly project: FeedbackNotificationProjectSnapshot;
  readonly recipientUserIds: readonly string[];
  readonly resolution?: string | null;
  readonly stage: string;
  readonly teamId: string;
  readonly title: string;
}): FeedbackNotificationEventPlan {
  return {
    actorName: input.actorName,
    actorUserId: input.actorUserId,
    body: `${input.actorName} 更新了反馈「${input.title}」的生命周期。`,
    kind: "feedback.lifecycle.changed",
    metadata: {
      feedbackResolution: input.resolution ?? "",
      feedbackStage: input.stage,
      feedbackTitle: input.title,
      ...feedbackProjectNotificationMetadata(input.project),
    },
    recipientUserIds: [...input.recipientUserIds],
    targetHref: feedbackNotificationTargetHref(input.feedbackId),
    targetId: input.feedbackId,
    targetType: "feedback",
    teamId: input.teamId,
    title: "反馈生命周期已更新",
  };
}

export function planFeedbackAssigneeChangedNotification(input: {
  readonly actorName: string;
  readonly actorUserId: string;
  readonly feedbackId: string;
  readonly nextAssigneeName?: string | null;
  readonly previousAssigneeName?: string | null;
  readonly recipientUserIds: readonly string[];
  readonly teamId: string;
  readonly title: string;
}): FeedbackNotificationEventPlan {
  return {
    actorName: input.actorName,
    actorUserId: input.actorUserId,
    body: `${input.actorName} 将反馈「${input.title}」的处理人从 ${input.previousAssigneeName ?? "未指派"} 调整为 ${input.nextAssigneeName ?? "未指派"}。`,
    kind: "feedback.assignee.changed",
    metadata: {
      feedbackTitle: input.title,
      nextAssignee: input.nextAssigneeName ?? "",
      previousAssignee: input.previousAssigneeName ?? "",
    },
    recipientUserIds: [...input.recipientUserIds],
    targetHref: feedbackNotificationTargetHref(input.feedbackId),
    targetId: input.feedbackId,
    targetType: "feedback",
    teamId: input.teamId,
    title: "反馈处理人已更新",
  };
}

export function planFeedbackCommentCreatedNotification(input: {
  readonly actorName: string;
  readonly actorUserId: string;
  readonly body: string;
  readonly commentMessageId: string;
  readonly commentMetadata: Record<string, string>;
  readonly commentThreadId: string;
  readonly feedbackId: string;
  readonly project: FeedbackNotificationProjectSnapshot;
  readonly recipientUserIds: readonly string[];
  readonly targetTitle: string;
  readonly teamId: string;
}): FeedbackNotificationEventPlan {
  return {
    actorName: input.actorName,
    actorUserId: input.actorUserId,
    body: input.body,
    kind: "feedback.comment.created",
    metadata: {
      commentMessageId: input.commentMessageId,
      commentThreadId: input.commentThreadId,
      ...input.commentMetadata,
      ...feedbackProjectNotificationMetadata(input.project),
      targetId: input.feedbackId,
      targetTitle: input.targetTitle,
      targetType: "feedback",
    },
    recipientUserIds: [...input.recipientUserIds],
    targetHref: feedbackCommentPath({
      commentMessageId: input.commentMessageId,
      feedbackId: input.feedbackId,
    }),
    targetId: input.feedbackId,
    targetType: "feedback",
    teamId: input.teamId,
    title: "反馈有新回复",
  };
}

export function feedbackNotificationTargetHref(feedbackId: string) {
  return feedbackIssuePath(feedbackId);
}

export function feedbackProjectNotificationMetadata(project: FeedbackNotificationProjectSnapshot): Record<string, string> {
  return project ? { projectId: project.id, projectName: project.name } : {};
}
