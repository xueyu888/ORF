import { z } from "zod";
import { feedbackImpactValues } from "./values";

export const feedbackNotificationEventKindValues = [
  "feedback.assignee.changed",
  "feedback.assignee.digest",
  "feedback.comment.created",
  "feedback.created",
  "feedback.follow_up.created",
  "feedback.lifecycle.changed",
] as const;

export const feedbackNotificationEventKindSchema = z.enum(feedbackNotificationEventKindValues);

export type FeedbackNotificationEventKind = z.infer<typeof feedbackNotificationEventKindSchema>;

const feedbackNotificationTextSchema = z.string();
const feedbackNotificationNonEmptyTextSchema = z.string().trim().min(1);
const feedbackNotificationActorSchema = z.object({
  id: feedbackNotificationNonEmptyTextSchema.nullable().optional(),
  name: feedbackNotificationNonEmptyTextSchema,
});
const feedbackNotificationUserSchema = z.object({
  id: feedbackNotificationNonEmptyTextSchema.nullable().optional(),
  name: feedbackNotificationNonEmptyTextSchema,
}).nullable();
const feedbackNotificationProjectSnapshotSchema = z.object({
  id: feedbackNotificationNonEmptyTextSchema,
  name: feedbackNotificationNonEmptyTextSchema,
}).nullable();
const feedbackNotificationFeedbackSnapshotSchema = z.object({
  id: feedbackNotificationNonEmptyTextSchema,
  project: feedbackNotificationProjectSnapshotSchema,
  title: feedbackNotificationNonEmptyTextSchema,
});
const feedbackNotificationDigestItemSchema = z.object({
  id: feedbackNotificationNonEmptyTextSchema,
  impact: z.enum(feedbackImpactValues),
  title: feedbackNotificationNonEmptyTextSchema,
  updatedAt: feedbackNotificationTextSchema,
});
const feedbackNotificationFollowUpCommentSchema = z.object({
  attachmentCount: z.number().int().nonnegative(),
  excerpt: feedbackNotificationTextSchema,
  messageId: feedbackNotificationNonEmptyTextSchema,
  threadId: feedbackNotificationNonEmptyTextSchema,
}).nullable();
const feedbackNotificationFollowUpAssigneeSchema = z.object({
  next: feedbackNotificationUserSchema,
  previous: feedbackNotificationUserSchema,
}).nullable();
const feedbackNotificationFollowUpLifecycleSchema = z.object({
  resolution: feedbackNotificationTextSchema.nullable(),
  stage: feedbackNotificationNonEmptyTextSchema,
}).nullable();

export const feedbackNotificationPayloadV1Schema = z.discriminatedUnion("type", [
  z.object({
    version: z.literal(1),
    type: z.literal("created"),
    actor: feedbackNotificationActorSchema,
    assignee: feedbackNotificationUserSchema,
    feedback: feedbackNotificationFeedbackSnapshotSchema,
  }),
  z.object({
    version: z.literal(1),
    type: z.literal("assignee_changed"),
    actor: feedbackNotificationActorSchema,
    feedback: feedbackNotificationFeedbackSnapshotSchema,
    nextAssignee: feedbackNotificationUserSchema,
    previousAssignee: feedbackNotificationUserSchema,
  }),
  z.object({
    version: z.literal(1),
    type: z.literal("lifecycle_changed"),
    actor: feedbackNotificationActorSchema,
    feedback: feedbackNotificationFeedbackSnapshotSchema,
    resolution: feedbackNotificationTextSchema.nullable(),
    stage: feedbackNotificationNonEmptyTextSchema,
  }),
  z.object({
    version: z.literal(1),
    type: z.literal("comment_created"),
    actor: feedbackNotificationActorSchema,
    attachmentCount: z.number().int().nonnegative(),
    commentExcerpt: feedbackNotificationTextSchema,
    commentMessageId: feedbackNotificationNonEmptyTextSchema,
    commentThreadId: feedbackNotificationNonEmptyTextSchema,
    feedback: feedbackNotificationFeedbackSnapshotSchema,
  }),
  z.object({
    version: z.literal(1),
    type: z.literal("assignee_digest"),
    assigneeUserId: feedbackNotificationNonEmptyTextSchema,
    items: z.array(feedbackNotificationDigestItemSchema).readonly(),
    localDate: feedbackNotificationNonEmptyTextSchema,
    pendingCount: z.number().int().nonnegative(),
  }),
  z.object({
    version: z.literal(1),
    type: z.literal("follow_up"),
    actor: feedbackNotificationActorSchema,
    assignee: feedbackNotificationFollowUpAssigneeSchema,
    comment: feedbackNotificationFollowUpCommentSchema,
    feedback: feedbackNotificationFeedbackSnapshotSchema,
    lifecycle: feedbackNotificationFollowUpLifecycleSchema,
  }),
]);

export type FeedbackNotificationPayloadV1 = z.infer<typeof feedbackNotificationPayloadV1Schema>;

export const feedbackNotificationCardReferenceV1Schema = z.discriminatedUnion("kind", [
  z.object({
    version: z.literal(1),
    kind: z.literal("feedback"),
    activityId: feedbackNotificationNonEmptyTextSchema,
    feedbackId: feedbackNotificationNonEmptyTextSchema,
    payloadType: z.enum(["assignee_changed", "created", "follow_up", "lifecycle_changed"]),
  }),
  z.object({
    version: z.literal(1),
    kind: z.literal("comment"),
    activityId: feedbackNotificationNonEmptyTextSchema,
    commentMessageId: feedbackNotificationNonEmptyTextSchema,
    feedbackId: feedbackNotificationNonEmptyTextSchema,
    payloadType: z.enum(["comment_created", "follow_up"]),
  }),
]);

export type FeedbackNotificationCardReferenceV1 = z.infer<typeof feedbackNotificationCardReferenceV1Schema>;

export const feedbackNotificationEventPlanSchema = z.object({
  payload: feedbackNotificationPayloadV1Schema,
  recipientUserIds: z.array(z.string()),
  teamId: feedbackNotificationTextSchema,
}).strict();

export type FeedbackNotificationProjectSnapshot = z.infer<typeof feedbackNotificationProjectSnapshotSchema>;
export type FeedbackNotificationEventPlan = z.infer<typeof feedbackNotificationEventPlanSchema>;

export function feedbackNotificationEventKindFromPayload(payload: FeedbackNotificationPayloadV1): FeedbackNotificationEventKind {
  if (payload.type === "created") return "feedback.created";
  if (payload.type === "assignee_changed") return "feedback.assignee.changed";
  if (payload.type === "lifecycle_changed") return "feedback.lifecycle.changed";
  if (payload.type === "comment_created") return "feedback.comment.created";
  if (payload.type === "follow_up") return "feedback.follow_up.created";
  return "feedback.assignee.digest";
}

export function feedbackNotificationCardReferenceFromPayload(
  payload: FeedbackNotificationPayloadV1,
  activityId: string | null | undefined,
): FeedbackNotificationCardReferenceV1 | null {
  const normalizedActivityId = activityId?.trim();
  if (!normalizedActivityId || payload.type === "assignee_digest") {
    return null;
  }
  if (payload.type === "comment_created") {
    return {
      version: 1,
      kind: "comment",
      activityId: normalizedActivityId,
      commentMessageId: payload.commentMessageId,
      feedbackId: payload.feedback.id,
      payloadType: payload.type,
    };
  }
  if (payload.type === "follow_up" && payload.comment) {
    return {
      version: 1,
      kind: "comment",
      activityId: normalizedActivityId,
      commentMessageId: payload.comment.messageId,
      feedbackId: payload.feedback.id,
      payloadType: payload.type,
    };
  }
  return {
    version: 1,
    kind: "feedback",
    activityId: normalizedActivityId,
    feedbackId: payload.feedback.id,
    payloadType: payload.type,
  };
}

function actorSnapshot(input: { readonly actorName: string; readonly actorUserId?: string | null }) {
  return {
    id: input.actorUserId?.trim() || null,
    name: input.actorName.trim(),
  };
}

function userSnapshot(name: string | null | undefined) {
  const normalizedName = name?.trim();
  return normalizedName ? { id: null, name: normalizedName } : null;
}

function feedbackSnapshot(input: {
  readonly feedbackId: string;
  readonly project: FeedbackNotificationProjectSnapshot;
  readonly title: string;
}) {
  return {
    id: input.feedbackId,
    project: input.project,
    title: input.title,
  };
}

function feedbackCommentAttachmentCount(metadata: Record<string, string>) {
  return (metadata.commentImageAttachmentIds ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .length;
}

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
    payload: {
      version: 1,
      type: "created",
      actor: actorSnapshot(input),
      assignee: userSnapshot(input.assigneeName),
      feedback: feedbackSnapshot(input),
    },
    recipientUserIds: [...input.recipientUserIds],
    teamId: input.teamId,
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
    payload: {
      version: 1,
      type: "lifecycle_changed",
      actor: actorSnapshot(input),
      feedback: feedbackSnapshot(input),
      resolution: input.resolution ?? null,
      stage: input.stage,
    },
    recipientUserIds: [...input.recipientUserIds],
    teamId: input.teamId,
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
    payload: {
      version: 1,
      type: "assignee_changed",
      actor: actorSnapshot(input),
      feedback: feedbackSnapshot({ feedbackId: input.feedbackId, project: null, title: input.title }),
      nextAssignee: userSnapshot(input.nextAssigneeName),
      previousAssignee: userSnapshot(input.previousAssigneeName),
    },
    recipientUserIds: [...input.recipientUserIds],
    teamId: input.teamId,
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
    payload: {
      version: 1,
      type: "comment_created",
      actor: actorSnapshot(input),
      attachmentCount: feedbackCommentAttachmentCount(input.commentMetadata),
      commentExcerpt: input.body,
      commentMessageId: input.commentMessageId,
      commentThreadId: input.commentThreadId,
      feedback: feedbackSnapshot({ feedbackId: input.feedbackId, project: input.project, title: input.targetTitle }),
    },
    recipientUserIds: [...input.recipientUserIds],
    teamId: input.teamId,
  };
}

export function planFeedbackFollowUpNotification(input: {
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
  readonly project: FeedbackNotificationProjectSnapshot;
  readonly recipientUserIds: readonly string[];
  readonly teamId: string;
  readonly title: string;
}): FeedbackNotificationEventPlan {
  return {
    payload: {
      version: 1,
      type: "follow_up",
      actor: actorSnapshot(input),
      assignee: input.assignee ? {
        next: userSnapshot(input.assignee.nextName),
        previous: userSnapshot(input.assignee.previousName),
      } : null,
      comment: input.comment ? {
        attachmentCount: feedbackCommentAttachmentCount(input.comment.metadata),
        excerpt: input.body,
        messageId: input.comment.messageId,
        threadId: input.comment.threadId,
      } : null,
      feedback: feedbackSnapshot(input),
      lifecycle: input.lifecycle ? {
        resolution: input.lifecycle.resolution ?? null,
        stage: input.lifecycle.stage,
      } : null,
    },
    recipientUserIds: [...input.recipientUserIds],
    teamId: input.teamId,
  };
}
