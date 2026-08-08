import { z } from "zod";
import { feedbackCommentPath, feedbackIssuePath } from "./links";

export const feedbackNotificationEventKindValues = [
  "feedback.assignee.changed",
  "feedback.assignee.digest",
  "feedback.comment.created",
  "feedback.created",
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
  impact: feedbackNotificationTextSchema,
  title: feedbackNotificationNonEmptyTextSchema,
  updatedAt: feedbackNotificationTextSchema,
});

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
]);

export type FeedbackNotificationPayloadV1 = z.infer<typeof feedbackNotificationPayloadV1Schema>;

export const feedbackNotificationCardReferenceV1Schema = z.discriminatedUnion("kind", [
  z.object({
    version: z.literal(1),
    kind: z.literal("feedback"),
    activityId: feedbackNotificationNonEmptyTextSchema,
    feedbackId: feedbackNotificationNonEmptyTextSchema,
    payloadType: z.enum(["assignee_changed", "created", "lifecycle_changed"]),
  }),
  z.object({
    version: z.literal(1),
    kind: z.literal("comment"),
    activityId: feedbackNotificationNonEmptyTextSchema,
    commentMessageId: feedbackNotificationNonEmptyTextSchema,
    feedbackId: feedbackNotificationNonEmptyTextSchema,
    payloadType: z.literal("comment_created"),
  }),
]);

export type FeedbackNotificationCardReferenceV1 = z.infer<typeof feedbackNotificationCardReferenceV1Schema>;

export const feedbackNotificationEventPlanSchema = z.object({
  actorName: feedbackNotificationTextSchema,
  actorUserId: feedbackNotificationTextSchema.nullable().optional(),
  body: feedbackNotificationTextSchema,
  kind: feedbackNotificationEventKindSchema,
  metadata: z.record(z.string(), z.string()),
  payload: feedbackNotificationPayloadV1Schema,
  recipientUserIds: z.array(z.string()),
  targetHref: feedbackNotificationTextSchema,
  targetId: feedbackNotificationTextSchema,
  targetType: z.literal("feedback"),
  teamId: feedbackNotificationTextSchema,
  title: feedbackNotificationTextSchema,
});

export type FeedbackNotificationProjectSnapshot = z.infer<typeof feedbackNotificationProjectSnapshotSchema>;
export type FeedbackNotificationEventPlan = z.infer<typeof feedbackNotificationEventPlanSchema>;

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
    actorName: input.actorName,
    actorUserId: input.actorUserId,
    body: `${input.actorName} 创建了反馈「${input.title}」${input.assigneeName ? `，处理人：${input.assigneeName}` : ""}。`,
    kind: "feedback.created",
    metadata: {
      assignee: input.assigneeName ?? "",
      feedbackTitle: input.title,
      ...feedbackProjectNotificationMetadata(input.project),
    },
    payload: {
      version: 1,
      type: "created",
      actor: actorSnapshot(input),
      assignee: userSnapshot(input.assigneeName),
      feedback: feedbackSnapshot(input),
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
    payload: {
      version: 1,
      type: "lifecycle_changed",
      actor: actorSnapshot(input),
      feedback: feedbackSnapshot(input),
      resolution: input.resolution ?? null,
      stage: input.stage,
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
    payload: {
      version: 1,
      type: "assignee_changed",
      actor: actorSnapshot(input),
      feedback: feedbackSnapshot({ feedbackId: input.feedbackId, project: null, title: input.title }),
      nextAssignee: userSnapshot(input.nextAssigneeName),
      previousAssignee: userSnapshot(input.previousAssigneeName),
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
