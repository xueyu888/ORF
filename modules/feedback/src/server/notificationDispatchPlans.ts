import {
  planFeedbackAssigneeChangedNotification,
  planFeedbackCommentCreatedNotification,
  planFeedbackCreatedNotification,
  planFeedbackFollowUpNotification,
  planFeedbackLifecycleChangedNotification,
} from "../contracts";
import {
  buildFeedbackNotificationDispatchDraft,
} from "./notificationDispatch";
import type {
  FeedbackNotificationDispatchDraft,
  FeedbackNotificationDispatchRecipient,
} from "./notificationProtocol";

type CreatedNotificationInput = Parameters<typeof planFeedbackCreatedNotification>[0];
type LifecycleChangedNotificationInput = Parameters<typeof planFeedbackLifecycleChangedNotification>[0];
type AssigneeChangedNotificationInput = Parameters<typeof planFeedbackAssigneeChangedNotification>[0];
type CommentCreatedNotificationInput = Parameters<typeof planFeedbackCommentCreatedNotification>[0];

export function buildFeedbackCreatedNotificationDispatch(
  input: Omit<CreatedNotificationInput, "recipientUserIds"> & {
    readonly recipients: readonly FeedbackNotificationDispatchRecipient[];
  },
): FeedbackNotificationDispatchDraft | null {
  const { recipients, ...planInput } = input;
  return buildFeedbackNotificationDispatchDraft(planFeedbackCreatedNotification({
    ...planInput,
    recipientUserIds: [],
  }), recipients);
}

export function buildFeedbackLifecycleChangedNotificationDispatch(
  input: Omit<LifecycleChangedNotificationInput, "recipientUserIds"> & {
    readonly recipients: readonly FeedbackNotificationDispatchRecipient[];
  },
): FeedbackNotificationDispatchDraft | null {
  const { recipients, ...planInput } = input;
  return buildFeedbackNotificationDispatchDraft(planFeedbackLifecycleChangedNotification({
    ...planInput,
    recipientUserIds: [],
  }), recipients);
}

export function buildFeedbackAssigneeChangedNotificationDispatch(
  input: Omit<AssigneeChangedNotificationInput, "recipientUserIds"> & {
    readonly recipients: readonly FeedbackNotificationDispatchRecipient[];
  },
): FeedbackNotificationDispatchDraft | null {
  const { recipients, ...planInput } = input;
  return buildFeedbackNotificationDispatchDraft(planFeedbackAssigneeChangedNotification({
    ...planInput,
    recipientUserIds: [],
  }), recipients);
}

export function buildFeedbackCommentCreatedNotificationDispatch(
  input: Omit<CommentCreatedNotificationInput, "recipientUserIds"> & {
    readonly recipients: readonly FeedbackNotificationDispatchRecipient[];
  },
): FeedbackNotificationDispatchDraft | null {
  const { recipients, ...planInput } = input;
  return buildFeedbackNotificationDispatchDraft(planFeedbackCommentCreatedNotification({
    ...planInput,
    recipientUserIds: [],
  }), recipients);
}

export function buildFeedbackFollowUpNotificationDispatch(input: {
  readonly actorName: string;
  readonly actorUserId: string;
  readonly assignee?: {
    readonly nextName?: string | null;
    readonly previousName?: string | null;
  };
  readonly body: string;
  readonly comment?: {
    readonly messageId: string;
    readonly metadata: Record<string, string>;
    readonly threadId: string;
  };
  readonly feedbackId: string;
  readonly lifecycle?: {
    readonly resolution?: string | null;
    readonly stage: string;
  };
  readonly project: CreatedNotificationInput["project"];
  readonly recipients: readonly FeedbackNotificationDispatchRecipient[];
  readonly teamId: string;
  readonly title: string;
}): FeedbackNotificationDispatchDraft | null {
  const { recipients, ...planInput } = input;
  return buildFeedbackNotificationDispatchDraft(planFeedbackFollowUpNotification({
    ...planInput,
    recipientUserIds: [],
  }), recipients);
}
