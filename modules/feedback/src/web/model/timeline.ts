import type {
  FeedbackWebActivityItem,
  FeedbackWebCommentMessage,
  FeedbackWebCommentThread,
} from "../types";

export type FeedbackTimelineCommentEntry = {
  readonly message: FeedbackWebCommentMessage;
  readonly thread: FeedbackWebCommentThread;
};

export type FeedbackTimelineEntry =
  | {
      readonly activities: readonly FeedbackWebActivityItem[];
      readonly kind: "activity";
    }
  | {
      readonly activities: readonly FeedbackWebActivityItem[];
      readonly comment: FeedbackTimelineCommentEntry;
      readonly kind: "comment";
    };

export function feedbackIssueTimelineEntries(
  activities: readonly FeedbackWebActivityItem[],
  comments: readonly FeedbackTimelineCommentEntry[],
): FeedbackTimelineEntry[] {
  const commentIds = new Set(comments.map(({ message }) => message.id));
  const groupedActivities = new Map<string, FeedbackWebActivityItem[]>();
  const standaloneActivities: FeedbackWebActivityItem[] = [];

  for (const activity of activities) {
    if (activity.activityType === "feedback.created" || activity.activityType === "feedback.comment.created") continue;
    const followUpId = feedbackActivityFollowUpId(activity);
    if (!followUpId) {
      standaloneActivities.push(activity);
      continue;
    }
    const group = groupedActivities.get(followUpId) ?? [];
    group.push(activity);
    groupedActivities.set(followUpId, group);
  }

  const items: FeedbackTimelineEntry[] = [
    ...standaloneActivities.map((activity) => ({ activities: [activity], kind: "activity" as const })),
    ...[...groupedActivities.entries()]
      .filter(([followUpId]) => !commentIds.has(followUpId))
      .map(([, entries]) => ({ activities: entries, kind: "activity" as const })),
    ...comments.map((comment) => ({
      activities: groupedActivities.get(comment.message.id) ?? [],
      comment,
      kind: "comment" as const,
    })),
  ];

  return items.sort((left, right) => {
    const leftAt = feedbackTimelineEntryAt(left);
    const rightAt = feedbackTimelineEntryAt(right);
    const byTime = leftAt.localeCompare(rightAt);
    if (byTime !== 0) return byTime;
    if (left.kind === "activity" && right.kind === "activity") {
      return (left.activities[0]?.sequence ?? 0) - (right.activities[0]?.sequence ?? 0);
    }
    return left.kind === "comment" ? -1 : 1;
  });
}

function feedbackActivityFollowUpId(activity: FeedbackWebActivityItem) {
  const followUpId = activity.payload.followUpId;
  return typeof followUpId === "string" ? followUpId.trim() : "";
}

function feedbackTimelineEntryAt(entry: FeedbackTimelineEntry) {
  return entry.kind === "comment"
    ? entry.comment.message.createdAt
    : entry.activities[0]?.at ?? "";
}
