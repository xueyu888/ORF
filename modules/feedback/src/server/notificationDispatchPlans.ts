import {
  planFeedbackAssigneeChangedNotification,
  planFeedbackCommentCreatedNotification,
  planFeedbackCreatedNotification,
  planFeedbackLifecycleChangedNotification,
} from "../contracts";
import {
  buildFeedbackNotificationDispatchDraft,
  type FeedbackNotificationDispatchDraft,
  type FeedbackNotificationDispatchRecipient,
} from "./notificationDispatch";

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
